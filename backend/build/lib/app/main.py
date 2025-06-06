from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import json
import logging
import time

from app.agents.react_agent.nodes import build_workflow
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

class CloneRequest(BaseModel):
    url: str

@app.get("/")
def read_root():
    return {"message": "Welcome to the Orchids Website Cloning API"}

@app.post("/api/clone")
async def clone_website(req: CloneRequest):
    request_id = f"req_{int(time.time())}"
    logger.info(f"[{request_id}] Received cloning request for URL: {req.url}")

    async def response_generator():
        try:
            yield f"data: {json.dumps({'type': 'start', 'request_id': request_id})}\n\n"
            
            # The checkpointer is in-memory for this version
            graph = build_workflow(checkpointer=None) 
            
            # Use a unique thread_id for each request
            thread_id = f"thread_{request_id}"
            config = {"configurable": {"thread_id": thread_id}}
            
            # Initial message to kick off the agent
            initial_message = HumanMessage(content=f"Clone the website at this URL: {req.url}")

            # Stream the agent's execution
            stream = graph.stream(
                {"messages": [initial_message]}, 
                config=config,
                stream_mode="updates"
            )

            for chunk in stream:
                # Log the chunk for debugging
                logger.info(f"[{request_id}] Stream chunk: {chunk}")
                
                # Yield the chunk to the frontend
                yield f"data: {json.dumps({'type': 'update', 'data': chunk})}\n\n"

        except Exception as e:
            logger.error(f"[{request_id}] Error during cloning process: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
        finally:
            logger.info(f"[{request_id}] Cloning process finished.")
            yield f"data: {json.dumps({'type': 'final', 'message': 'Cloning process finished.'})}\n\n"

    return StreamingResponse(response_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    # This is for local development.
    # In a production environment, you would use a Gunicorn or similar server.
    uvicorn.run(app, host="0.0.0.0", port=8000)
