from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from dotenv import load_dotenv
load_dotenv()

from langgraph.graph import MessagesState
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from bs4 import BeautifulSoup

from langgraph.graph import START, StateGraph
from langgraph.prebuilt import tools_condition
from langgraph.prebuilt import ToolNode

import asyncio

from app.agents.utils.playwright_screenshot import capture_page_and_img_src

from openai import OpenAI
from app.agents.utils.images import encode_image

@tool
def write_html(html_code: str) -> str:
    """
    Write HTML code to the page.html file. This tool completely OVERWRITES the file.
    You will be given the current content of the file as context. 
    Make sure your new code includes all the necessary existing parts plus your changes.
    """
    with open("../frontend/public/page.html", "w") as f:
        f.write(html_code)
    return "HTML code written to page.html"

@tool
def write_css(css_code: str) -> str:
    """
    Write CSS code to the assets/page.css file. This tool completely OVERWRITES the file.
    You will be given the current content of the file as context.
    Make sure your new code includes all the necessary existing parts plus your changes.
    """
    with open("../frontend/public/page.css", "w") as f:
        f.write(css_code)
    return "CSS code written to page.css"

@tool
def get_screenshot_and_html_content_using_playwright(url: str) -> tuple[str, list[str]]:
    """
    Get the screenshot and HTML content of a webpage using Playwright. After this tool call, you should use the tool call clone_and_write_html_to_file to generate the HTML.
    """
    return asyncio.run(capture_page_and_img_src(url, "../frontend/public/screenshot-of-page-to-clone.png"))

@tool
def clone_and_write_html_to_file(trimmed_html_content: str) -> str:
    """
    Used to generate HTML after cloning, after the tool call get_screenshot_and_html_content_using_playwright. Take an existing image screenshot, and the trimmed down HTML as inputs and clone it by generating new HTML 
    and writing it to the file system. The CSS will be written to assets/page.css and the HTML to page.html.
    """

    client = OpenAI()

    # Getting the Base64 string
    base64_image = encode_image("../frontend/public/screenshot-of-page-to-clone.png")

    response = client.chat.completions.create(
        model="o3",
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": """
                ### SYSTEM
You are "Pixel-Perfect Front-End", a senior web-platform engineer who specialises in
 * redesigning bloated, auto-generated pages into clean, semantic, WCAG-conformant HTML/CSS
 * matching the *visual* layout of the reference screenshot to within ±2 px for all major breakpoints

When you reply you MUST:
1. **Think step-by-step silently** ("internal reasoning"), then **output nothing but the final HTML inside a single fenced code block**.
2. **Inline zero commentary** - the code block is the entire answer.
3. Use **only system fonts** (font-stack: `Roboto, Arial, Helvetica, sans-serif`) and a single `<style>` block in the `<head>`.
4. Avoid JavaScript unless explicitly asked; replicate all interactions with pure HTML/CSS where feasible.
5. Preserve all outbound links exactly as provided in the RAW_HTML input.
7. Ensure the layout is mobile-first responsive (Flexbox/Grid) and maintains the same visual hierarchy:  
   e.g) **header ➔ main (logo, search box, buttons, promo) ➔ footer**.

### USER CONTEXT
You will receive two payloads:

**SCREENSHOT** - Your primary reference for all visual styling, layout, colors, and fonts.
**RAW_HTML** - The stripped, uglified DOM dump.

### TASK
1. **Your goal is to re-create the page from the SCREENSHOT as a single, clean HTML document.**
2. **Use the RAW_HTML *only* to extract content like text, links (`href`), and accessibility attributes (`alt`, `aria-label`).**
3. **Do NOT replicate the original's CSS or inline styles.** Create your own clean CSS in a `<style>` tag to match the screenshot's appearance.
4. **Discard** every element from the RAW_HTML that is not visible in the screenshot.

### OUTPUT FORMAT
Return one fenced code block starting with <!DOCTYPE html> and ending with </html>
No extra markdown, no explanations, no leading or trailing whitespace outside the code block.
                 
                 Here is the trimmed down HTML:
                 {trimmed_html_content}
            `"""},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{base64_image}"
                    },
                },
            ],
        }]
    )

    full_html = response.choices[0].message.content
    soup = BeautifulSoup(full_html, 'html.parser')

    css_code = ""
    style_tag = soup.find('style')
    if style_tag:
        css_code = style_tag.string or ''
        style_tag.decompose()

    if css_code:
        with open("../frontend/public/page.css", "w") as f:
            f.write(css_code.strip())
        
        if soup.head:
            link_tag = soup.new_tag("link", rel="stylesheet", href="page.css")
            soup.head.append(link_tag)

    with open("../frontend/public/page.html", "w") as f:
        f.write(str(soup))
    
    return "Cloned webpage written to page.html and assets/page.css"

# Toolsets
creation_tools = [write_html, write_css]
cloning_tools = [get_screenshot_and_html_content_using_playwright, clone_and_write_html_to_file]
all_tools = creation_tools + cloning_tools

# System message
sys_msg = SystemMessage(content="You are a helpful software_developer_assistant tasked with writing and editing websites. When creating from scratch or editing, use the creation tools (`write_html`, `write_css`) to manage files separately. HTML goes in `page.html`, CSS in `assets/page.css`, and JavaScript in `assets/page.js`. When asked to clone a URL, use the cloning tools. The cloning process will automatically create `page.html` and `assets/page.css` for you. For any subsequent edits to the clone, use the creation tools to modify the appropriate file.")

# Nodes
def software_developer_assistant(state: MessagesState):
   llm = ChatOpenAI(model="o4-mini-2025-04-16")
   
   # Simple router based on user input
   user_input = state["messages"][-1].content.lower()
   if "clone" in user_input or "http" in user_input:
       tools_for_llm = cloning_tools
       messages = [sys_msg] + state["messages"]
   else:
       tools_for_llm = creation_tools
       # Provide file content as context for editing tasks
       try:
           with open("../frontend/public/page.html", "r") as f:
               html_content = f.read()
       except FileNotFoundError:
           html_content = "<!-- The HTML file is currently empty. -->"
       
       try:
           with open("../frontend/public/page.css", "r") as f:
               css_content = f.read()
       except FileNotFoundError:
           css_content = "/* The CSS file is currently empty. */"

       context_message = HumanMessage(
           content=f"""Here is the current state of the files you can edit:

### page.html
```html
{html_content}
```

### page.css
```css
{css_content}
```

Please use this context to inform your edits. Remember that the write tools will overwrite the entire file.
""",
           name="context_provider"
       )
       # Inject context right before the user's latest message
       messages = [sys_msg] + state["messages"][:-1] + [context_message, state["messages"][-1]]
       
   llm_with_tools = llm.bind_tools(tools_for_llm)
   return {"messages": [llm_with_tools.invoke(messages)]}

def build_workflow(checkpointer=None):
    # Graph
    builder = StateGraph(MessagesState)

    # Define nodes: these do the work
    builder.add_node("software_developer_assistant", software_developer_assistant)
    builder.add_node("tools", ToolNode(all_tools))

    # Define edges: these determine how the control flow moves
    builder.add_edge(START, "software_developer_assistant")
    builder.add_conditional_edges(
        "software_developer_assistant",
        # If the latest message (result) from software_developer_assistant is a tool call -> tools_condition routes to tools
        # If the latest message (result) from software_developer_assistant is a not a tool call -> tools_condition routes to END
        tools_condition,
    )
    builder.add_edge("tools", "software_developer_assistant")
    react_graph = builder.compile(checkpointer=checkpointer)

    return react_graph 