from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load local HTML
        cwd = os.getcwd()
        url = f"file://{cwd}/popup.html"
        print(f"Navigating to {url}")
        page.goto(url)

        # Verify Scheduling Controls exist
        assert page.get_by_text("Scheduling (Optional)").is_visible()

        # Check inputs
        assert page.locator("#schedStart").is_visible()
        assert page.locator("#schedBatch").is_visible()
        assert page.locator("#schedInterval").is_visible()
        assert page.locator("#schedUnit").is_visible()

        # Interact with inputs to ensure they work
        page.fill("#schedBatch", "3")
        page.fill("#schedInterval", "12")
        page.select_option("#schedUnit", "3600") # Hours

        # Take screenshot
        page.screenshot(path="verification/scheduling_ui.png")
        print("Screenshot saved.")

        browser.close()

if __name__ == "__main__":
    run()
