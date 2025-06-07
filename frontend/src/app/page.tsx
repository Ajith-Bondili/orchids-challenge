"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { v4 as uuidv4 } from 'uuid';
import { Bot, User, CornerDownLeft, GitBranch } from 'lucide-react';

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
    { 
      id: 'initial-ai-message', 
      role: 'assistant', 
      content: "Please provide a public website URL to begin cloning."
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [status, setStatus] = useState("Idle");
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setThreadId(uuidv4()); }, []);
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, status]);

  const refreshIframe = () => {
    if (iframeRef.current) {
        iframeRef.current.src = `/page.html?t=${new Date().getTime()}`;
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !threadId || isLoading) return;

    const userMessage: Message = { id: uuidv4(), role: "user", content: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    setStatus("Initializing...");

    try {
      const response = await fetch("http://localhost:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `clone ${inputValue}`, thread_id: threadId }),
      });

      if (!response.body) throw new Error("Response body is null");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const eventLines = chunk.split("\n\n").filter(line => line.startsWith("data:"));

        for (const line of eventLines) {
          try {
            const jsonStr = line.substring(5);
            if (!jsonStr) continue;
            const parsed = JSON.parse(jsonStr);
            
            if (parsed.agent) {
              const agentMessages = parsed.agent.messages;
              if (agentMessages && agentMessages.length > 0) {
                const lastMessage = agentMessages[agentMessages.length - 1];
                if(lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
                    const toolName = lastMessage.tool_calls[0].name.replace(/_/g, ' ');
                    setStatus(`Using tool: ${toolName}...`);
                }
              }
            } else if (parsed.tools) {
                setStatus("Tool finished. Thinking...");
                refreshIframe();
            } else if (parsed.type === 'final' || ('__end__' in parsed)) {
                break;
            }

          } catch (err) {
             console.error("Failed to parse stream chunk:", err, line);
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      setStatus(`Error: ${errorMessage}`);
    } finally {
        setIsLoading(false);
        setStatus("Idle");
        refreshIframe();
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-800 font-sans">
      
      {/* Left Panel: Chat Interface */}
      <div className="flex flex-col w-1/3 h-full border-r border-gray-200 bg-white">
        <div className="p-4 border-b border-gray-200 flex items-center gap-3">
          <GitBranch className="w-6 h-6 text-gray-500" />
          <h1 className="text-lg font-semibold text-gray-700">Cloner Agent</h1>
        </div>
        
        <div ref={chatContainerRef} className="flex-1 p-4 overflow-y-auto space-y-5">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'items-end'}`}>
              {msg.role === 'assistant' && <div className="p-2 bg-gray-200 rounded-full"><Bot className="w-5 h-5 text-gray-600" /></div>}
              <div className={`max-w-md p-3 rounded-lg shadow-sm ${msg.role === 'user' ? 'bg-blue-500 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'}`}>
                <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
              </div>
              {msg.role === 'user' && <div className="p-2 bg-gray-200 rounded-full"><User className="w-5 h-5" /></div>}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-start gap-3 items-end">
              <div className="p-2 bg-gray-200 rounded-full"><Bot className="w-5 h-5 text-gray-600" /></div>
              <div className="max-w-md p-3 rounded-lg bg-gray-100 shadow-sm">
                  <p className="text-sm text-gray-600">{status}</p>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-gray-200 bg-white">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type in a website to be cloned."
              className="flex-1 p-2 bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <CornerDownLeft className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>

      {/* Right Panel: HTML Preview */}
      <div className="flex-1 h-full bg-white">
        <iframe
          ref={iframeRef}
          title="Cloned Website Preview"
          className="w-full h-full border-none"
          src="/page.html"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
