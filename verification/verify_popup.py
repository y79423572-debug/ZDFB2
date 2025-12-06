from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the local HTML file
        # Note: We need to use absolute path
        cwd = os.getcwd()
        url = f"file://{cwd}/popup.html"
        print(f"Navigating to {url}")
        page.goto(url)

        # Verify Tabs exist
        assert page.get_by_role("button", name="Dashboard").is_visible()
        assert page.get_by_role("button", name="Templates").is_visible()
        assert page.get_by_role("button", name="Settings").is_visible()

        # Click Templates tab
        page.get_by_role("button", name="Templates").click()

        # Wait for tab switch animation/logic
        page.wait_for_timeout(500)

        # Verify Editor exists
        assert page.locator("#prefixEditor").is_visible()

        # Take screenshot
        page.screenshot(path="verification/popup_screenshot.png")
        print("Screenshot saved.")

        browser.close()

if __name__ == "__main__":
    run()
