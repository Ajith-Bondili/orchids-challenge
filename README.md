# Orchids Website Cloning Challenge

This project consists of a backend built with FastAPI and a frontend built with Next.js and TypeScript. The application allows you to clone websites by providing a URL and getting back a preview of the cloned website's HTML.

## Prerequisites

- Python 3.12 or higher
- Node.js 18 or higher
- npm or yarn
- A Browserless.io account (free tier available)
- An OpenAI API key

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd orchids-challenge
```

### 2. Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create and activate a virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

3. Install dependencies using uv:
```bash
uv sync
uv pip install -r pyproject.toml
```
4. Install Playwright browsers (required for scraping):
```bash
npm init playwright@latest
```

4. Create a `.env` file in the backend directory:
```bash
cat <<EOF > .env
OPENAI_API_KEY=sk-...  # Your OpenAI API key
BROWSERLESS_API_KEY=... # Your Browserless.io API key (optional)
EOF
```

5. Start the backend server:
```bash
uv run fastapi dev
```

The backend will be available at `http://localhost:8000`

### 3. Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
npm install lucide-react  # For icons
```

3. Start the frontend development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`

## Using the Application

1. Open your browser and go to `http://localhost:3000`
2. Enter a website URL in the input field
3. Click the clone button to start the cloning process
4. Wait for the process to complete
5. View the cloned website preview

## Demo Video

[📹 Watch the demo video](https://drive.google.com/file/d/17ohl87DI4pQ6k2ksK76-fiq7bjdYXe-Y/view?usp=sharing)

## How It Works & Key Features

This project enables an AI coding agent to reliably clone websites by combining Playwright (with Browserless.io) for robust scraping and a ReAct-style agentic workflow for intelligent reasoning and tool use.

- **Reliable Website Scraping:**
  - Uses Playwright with Browserless.io to visit any public website, scroll for lazy-loaded content, and capture a full-page screenshot.
  - Extracts a cleaned HTML DOM structure and all image sources (handling CDN images and lazy loading).
  - Browserless.io ensures reliability by handling firewalls, IP blocks, slow loads, and anti-bot measures with cloud-hosted browsers and proxy rotation.

- **Efficient LLM Context:**
  - Instead of sending the entire, often bloated, HTML/CSS to the LLM (which can overwhelm it), the agent provides:
    - A screenshot (for visual reference)
    - A minimal, cleaned HTML structure (parsed with BeautifulSoup, removing scripts, styles, and unnecessary tags)
  - This approach leverages modern vision-language models for accurate visual reasoning and content extraction.

- **Agentic Workflow (ReAct Architecture):**
  - The main agent ("software developer assistant") uses a ReAct-style architecture, choosing tools based on the user's prompt.
  - It can use a "clone" tool to generate new HTML/CSS from the screenshot and DOM, or "edit" tools to modify the cloned site.
  - The system prompt is engineered to instruct the LLM to act as a pixel-perfect front-end engineer, using the screenshot as the source of truth and the DOM for content.
