"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { v4 as uuidv4 } from 'uuid';

// Define types for our state
interface WorkflowNode {
  name: string;
  content: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  workflowDetails?: WorkflowNode[];
  status?: string;
}

const formatNodeName = (name: string) => {
  if (name === 'tools') return 'Tools';
  if (name === 'software_developer_assistant') return 'Software Developer Assistant';
  return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const WorkflowDetails = ({ details }: { details: WorkflowNode[] }) => {
  const [isExpanded, setIsExpanded] = useState(true); // Default to expanded

  if (!details || details.length === 0) return null;

  return (
    <div className="workflow-details">
      <div onClick={() => setIsExpanded(!isExpanded)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {isExpanded ? '▼' : '▶'} {isExpanded ? 'Hide' : 'View'} processing details
      </div>
      {isExpanded && (
        <div className="workflow-details-content">
          {details.map((node, index) => (
            <div key={index} className="workflow-node">
              <div className="node-title">{node.name}</div>
              <pre className="node-content">{node.content}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AssistantMessage = ({ message }: { message: Message }) => {
  return (
    <div className="message ai-message">
      <pre className="ai-response-content">{message.content}</pre>
      {message.status && <div className="ai-message-status">{message.status}</div>}
      {message.workflowDetails && <WorkflowDetails details={message.workflowDetails} />}
    </div>
  );
};


export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'initial-ai-message', role: 'assistant', content: "Hi! I'm LlamaBot. How can I help you today?" }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setThreadId(uuidv4()); }, []);
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !threadId || isLoading) return;

    const userMessage: Message = { id: uuidv4(), role: "user", content: inputValue };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    const assistantMessageId = uuidv4();
    const assistantMessagePlaceholder: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: "I've processed your request.", // This is the static, final message
      status: 'Thinking...',
      workflowDetails: [],
    };
    setMessages(prev => [...prev, assistantMessagePlaceholder]);

    try {
      const response = await fetch("http://localhost:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: inputValue, thread_id: threadId }),
      });

      if (!response.body) throw new Error("Response body is null");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value);
        const eventLines = chunk.split("\n\n").filter(line => line.startsWith("data:"));

        for (const line of eventLines) {
          try {
            const jsonStr = line.substring(5);
            const parsed = JSON.parse(jsonStr);
            
            if (parsed.type === 'update' && parsed.data) {
              setMessages(prev => prev.map(msg => {
                if (msg.id !== assistantMessageId) return msg;
                
                let newWorkflowDetails = [...(msg.workflowDetails || [])];
                
                // Case 1: Live token stream from an LLM ('messages' stream)
                if (Array.isArray(parsed.data) && parsed.data[0] === 'messages') {
                    const messageChunk = parsed.data[1];
                    const speakingNodeName = formatNodeName(messageChunk.response_metadata?.langgraph_node || 'Software Developer Assistant');

                    const nodeIndex = newWorkflowDetails.findIndex(n => n.name === speakingNodeName);
                    
                    if (nodeIndex > -1) {
                        const updatedNode = {
                            ...newWorkflowDetails[nodeIndex],
                            content: (newWorkflowDetails[nodeIndex].content || '') + (messageChunk.content || ''),
                        };
                        newWorkflowDetails[nodeIndex] = updatedNode;
                    } else {
                        newWorkflowDetails.push({ name: speakingNodeName, content: messageChunk.content || '' });
                    }
                    
                    return { ...msg, workflowDetails: newWorkflowDetails, status: `Streaming from ${speakingNodeName}...` };
                }

                // Case 2: State update from a node ('updates' stream)
                if (typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
                    const nodeName = Object.keys(parsed.data)[0];
                    const nodeData = parsed.data[nodeName];
                    const toolCalls = nodeData.messages?.[0]?.tool_calls;
                    const isToolMessage = nodeData.messages?.[0]?.type === 'tool';
                    
                    if (toolCalls || isToolMessage) {
                        const toolsNodeIndex = newWorkflowDetails.findIndex(n => n.name === 'Tools');
                        let toolsNode;

                        if (toolsNodeIndex > -1) {
                            toolsNode = {...newWorkflowDetails[toolsNodeIndex]};
                        } else {
                            toolsNode = { name: 'Tools', content: '' };
                        }

                        if (toolCalls) {
                            const toolLog = toolCalls.map(tc => `Calling Tool: ${tc.name}\nArgs: ${JSON.stringify(tc.args, null, 2)}`).join('\n');
                            toolsNode.content += toolLog;
                        }
                        if (isToolMessage) {
                            const toolOutput = nodeData.messages.map(m => `\nOutput of ${m.name}:\n${m.content}`).join('');
                            toolsNode.content += toolOutput;
                        }
                        
                        if (toolsNodeIndex > -1) {
                            newWorkflowDetails[toolsNodeIndex] = toolsNode;
                        } else {
                            newWorkflowDetails.push(toolsNode);
                        }
                    }

                    return { ...msg, workflowDetails: newWorkflowDetails, status: `Processing in ${formatNodeName(nodeName)}...` };
                }
                
                return msg; // Return unchanged if no case matches
              }));

            } else if (parsed.type === 'final') {
                setIsLoading(false);
                setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? { ...msg, status: '✅ Complete' } : msg));
                 if (iframeRef.current) {
                    iframeRef.current.src = `/page.html?t=${new Date().getTime()}`;
                 }
            } else if (parsed.type === 'error') {
               setIsLoading(false);
               setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? { ...msg, status: `Error: ${parsed.error}` } : msg));
            }
          } catch (err) {
             console.error("Failed to parse stream chunk:", err, line);
          }
        }
      }
    } catch (error) {
      setIsLoading(false);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
       setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? { ...msg, status: `Request failed: ${errorMessage}` } : msg));
    }
  };


  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: 'var(--bg-color)' }}>
      <style jsx global>{`
        /* Your chat.html styles go here, adapted for JSX/CSS-in-JS if needed */
        .chat-section { width: 33.33%; height: 100%; display: flex; flex-direction: column; border-right: 1px solid var(--border-color); position: relative; }
        .chat-header { height: var(--header-height); padding: 0.8rem 1rem; background-color: var(--chat-bg); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 0.8rem; }
        .chat-header img { width: 32px; height: 32px; border-radius: 8px; }
        .chat-header h1 { font-size: 1.2rem; font-weight: 600; color: var(--text-color); }
        .message-history { flex-grow: 1; padding: 1rem; overflow-y: auto; background-color: var(--chat-bg); display: flex; flex-direction: column; gap: 1rem; }
        .message { padding: 0.8rem 1rem; border-radius: 12px; line-height: 1.4; max-width: 85%; word-wrap: break-word; position: relative; font-size: 0.95rem; }
        .message.user-message { background-color: var(--message-user-bg); align-self: flex-end; border-bottom-right-radius: 4px; }
        .message.ai-message { background-color: var(--message-ai-bg); align-self: flex-start; border-bottom-left-radius: 4px; }
        .input-area { padding: 1rem; background-color: var(--chat-bg); border-top: 1px solid var(--border-color); }
        .input-area form { display: flex; }
        .input-area textarea { width: 100%; padding: 0.8rem 1rem; border: 1px solid var(--border-color); border-radius: 8px 0 0 8px; background-color: var(--input-bg); color: var(--text-color); font-size: 0.95rem; font-family: inherit; resize: none; }
        .input-area textarea:focus { outline: none; border-color: var(--accent-color); }
        .input-area button { padding: 0.8rem 1.2rem; background-color: var(--button-bg); color: white; border: none; border-radius: 0 8px 8px 0; cursor: pointer; }
        .input-area button:hover { background-color: var(--button-hover); }
        .input-area button:disabled { background-color: #aaa; }
        .ai-response-content { white-space: pre-wrap; }
        .ai-message-status { font-size: 0.7rem; color: var(--status-color); margin-top: 6px; }
        .workflow-details { margin-top: 6px; font-size: 0.75rem; color: rgba(255, 255, 255, 0.6); user-select: none; }
        .workflow-details-content { margin-top: 6px; padding: 6px; background-color: rgba(0, 0, 0, 0.2); border-radius: 4px; }
        .workflow-node { margin-bottom: 5px; padding-left: 8px; border-left: 2px solid var(--accent-color); }
        .node-title { font-weight: 500; color: var(--accent-color); }
        .node-content { white-space: pre-wrap; font-family: monospace; font-size: 0.8rem; }
      `}</style>
      <div className="chat-section">
        <div className="chat-header">
          <img src="https://service-jobs-images.s3.us-east-2.amazonaws.com/7rl98t1weu387r43il97h6ipk1l7" alt="LlamaBot Logo" />
          <h1>LlamaBot</h1>
        </div>
        <div ref={chatContainerRef} className="message-history">
          {messages.map((msg) => (
            msg.role === 'user' ? (
              <div key={msg.id} className="message user-message">{msg.content}</div>
            ) : (
              <AssistantMessage key={msg.id} message={msg} />
            )
          ))}
        </div>
        <div className="input-area">
          <form onSubmit={handleSubmit}>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type your message..."
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <button type="submit" disabled={isLoading}>Send</button>
          </form>
        </div>
      </div>
      <div className="iframe-section" style={{ width: '66.67%', height: '100%' }}>
        <iframe ref={iframeRef} src="/page.html" title="Content Frame" style={{ width: '100%', height: '100%', border: 'none' }} />
      </div>
    </div>
  );
}
