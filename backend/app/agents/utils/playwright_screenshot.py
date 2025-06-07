import os
import asyncio
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup
import re
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

async def _get_browser(p):
    """
    Connect to Browserless when credentials are available;
    otherwise launch a local headless browser.
    """
    token = os.getenv("BROWSERLESS_API_TOKEN")
    ws_endpoint = os.getenv("BROWSERLESS_WS_ENDPOINT")

    if not ws_endpoint and token:
        ws_endpoint = f"wss://chrome.browserless.io?token={token}"

    if ws_endpoint:
        print(f"[+] Connecting to Browserless...")
        return await p.chromium.connect_over_cdp(ws_endpoint)

    print("[!] No Browserless credentials found - launching local headless Chromium.")
    print("[!] To use Browserless, set BROWSERLESS_API_TOKEN in a .env file.")
    return await p.chromium.launch(headless=True)


async def capture_page_and_img_src(url: str, image_path: str) -> tuple[str, list[str]]:
    async with async_playwright() as p:
        browser = await _get_browser(p)
        page = await browser.new_page()

        try:
            await page.goto(url, wait_until="domcontentloaded")

            # Scroll down the page to trigger lazy-loaded content
            last_height = await page.evaluate("document.body.scrollHeight")
            while True:
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                # Wait for new content to load
                await page.wait_for_timeout(2000)
                new_height = await page.evaluate("document.body.scrollHeight")
                if new_height == last_height:
                    break
                last_height = new_height

            # Ensure the directory exists before saving the screenshot
            os.makedirs(os.path.dirname(image_path), exist_ok=True)
            await page.screenshot(path=image_path, full_page=True)
            print(f"[+] Screenshot saved to {image_path}")

            html = await page.content()
            img_elements = await page.query_selector_all("img")
            image_sources_with_none = await asyncio.gather(
                *[img.get_attribute("src") for img in img_elements]
            )
            image_sources = [src for src in image_sources_with_none if src is not None]

            trimmed_html = trim_html_for_llm(html)

            return trimmed_html, image_sources
        finally:
            await browser.close()


def trim_html_for_llm(html: str) -> str:
    soup = BeautifulSoup(html, 'html.parser')

    for tag_name in ['script', 'meta', 'noscript', 'iframe', 'svg', 'canvas', 'video', 'audio', 'link', 'style']:
        for tag in soup.find_all(tag_name):
            tag.decompose()

    # Only allow a minimal set of attributes
    allowed_attrs = {"src", "href", "alt", "title"}

    for tag in soup.find_all(True):
        original_attributes = list(tag.attrs.keys())

        for attr in original_attributes:
            if attr not in allowed_attrs:
                del tag[attr]

    return str(soup)


# python agents/utils/playwright_screenshot.py
if __name__ == "__main__":
    # This block is for testing the script directly.
    # It needs to load the .env file itself.
    from dotenv import load_dotenv
    import os

    # Assuming you run this from the `backend` directory, this will find the .env file.
    load_dotenv()

    if not os.path.exists("frontend/public/main-demo-playwright"):
        os.makedirs("frontend/public/main-demo-playwright")

    trimmed_html, image_sources = asyncio.run(capture_page_and_img_src("https://google.com/", "frontend/public/main-demo-playwright/demo-screenshot.png"))
    print("\n----- TRIMMED HTML (preview) -----")
    print(trimmed_html[:1000] + ("..." if len(trimmed_html) > 1000 else ""))
    print("\n----- IMAGE SOURCES -----")
    print(image_sources)