from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import json
import logging
import time

from app.agents.react_agent.nodes import build_workflow
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import HumanMessage

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Use an in-memory checkpointer to maintain conversation state
checkpointer = MemorySaver()

class ChatRequest(BaseModel):
    message: str
    thread_id: str

def pydantic_serializer(obj):
    """Custom JSON serializer for Pydantic models."""
    if isinstance(obj, BaseModel):
        return obj.dict()
    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")

@app.get("/")
def read_root():
    return {"message": "Welcome to the Orchids Website Cloning API"}

@app.post("/api/chat")
async def chat(req: ChatRequest):
    request_id = f"req_{int(time.time())}"
    logger.info(f"[{request_id}] Received chat message for thread {req.thread_id}: {req.message}")

    async def response_generator():
        try:
            yield f"data: {json.dumps({'type': 'start', 'request_id': request_id})}\n\n"
            
            graph = build_workflow(checkpointer=checkpointer)
            
            config = {"configurable": {"thread_id": req.thread_id}}
            
            message = HumanMessage(content=req.message)

            # Stream the agent's execution
            stream = graph.stream(
                {"messages": [message]}, 
                config=config,
                stream_mode="updates"
            )

            for chunk in stream:
                logger.info(f"[{request_id}] Stream chunk: {chunk}")
                
                # We will simplify the complex chunk on the frontend
                # For now, we pass the raw update chunk
                yield f"data: {json.dumps({'type': 'update', 'data': chunk}, default=pydantic_serializer)}\n\n"

        except Exception as e:
            logger.error(f"[{request_id}] Error during process: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
        finally:
            logger.info(f"[{request_id}] Process finished for thread {req.thread_id}.")
            yield f"data: {json.dumps({'type': 'final', 'message': 'Process finished.'})}\n\n"

    return StreamingResponse(response_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    # This is for local development.
    # In a production environment, you would use a Gunicorn or similar server.
    uvicorn.run(app, host="0.0.0.0", port=8000)
