from playwright.async_api import async_playwright
from bs4 import BeautifulSoup
import re
import asyncio


async def capture_page_and_img_src(url: str, image_path: str) -> tuple[str, list[str]]:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

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

        await page.screenshot(path=image_path, full_page=True)
        print(f"Screenshot saved to {image_path}")

        html = await page.content()
        img_elements = await page.query_selector_all("img")
        image_sources_with_none = await asyncio.gather(
            *[img.get_attribute("src") for img in img_elements]
        )
        image_sources = [src for src in image_sources_with_none if src is not None]
        print(f"Image sources: {image_sources}")

        await browser.close()

        trimmed_html = trim_html_for_llm(html)

        return trimmed_html, image_sources
    
def trim_html_for_llm(html: str) -> str:
    soup = BeautifulSoup(html, 'html.parser')

    for tag_name in ['script', 'meta', 'noscript', 'iframe', 'svg', 'canvas', 'video', 'audio', 'link', 'style']:
        for tag in soup.find_all(tag_name):
            tag.decompose()

    # 3. Only allow a minimal set of attributes
    allowed_attrs = {"src", "href", "alt", "title"}

    for tag in soup.find_all(True):
        original_attributes = list(tag.attrs.keys())

        for attr in original_attributes:
            if attr not in allowed_attrs:
                del tag[attr]

    return str(soup)


# python agents/utils/playwright_screenshot.py
if __name__ == "__main__":
    trimmed_html, image_sources = asyncio.run(capture_page_and_img_src("https://google.com/", "assets/images/demo-screenshot.png"))
    print(trimmed_html)
    print("--------------------------------")
    print(image_sources) 