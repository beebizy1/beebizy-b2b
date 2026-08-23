"""Browser regression for the five P0 workflows in the public demo."""

import os

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3000")


def visible(page, text: str) -> None:
    page.get_by_text(text, exact=True).first.wait_for(state="visible")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    browser_errors: list[str] = []
    page.on("console", lambda message: browser_errors.append(message.text) if message.type == "error" else None)

    page.goto(BASE_URL, wait_until="networkidle")
    pricing = page.locator("#pricing")
    pricing.wait_for(state="visible")
    assert "Start planning for free." in pricing.inner_text()
    page.get_by_role("button", name="Try the Demo").click()
    page.wait_for_url("**/app")
    visible(page, "Demo data.")

    # Multi-location calendar.
    page.get_by_role("link", name="Events", exact=True).click()
    visible(page, "Every event you run")
    page.get_by_role("button", name="Calendar view").click()
    visible(page, "Today")
    assert page.get_by_label("Filter by venue").is_visible()

    # Run of show builder with a real write.
    page.goto(f"{BASE_URL}/app/events/evt-gala/plan", wait_until="networkidle")
    visible(page, "Run of show")
    page.get_by_role("textbox", name="Cue title").fill("P0 browser verification")
    page.get_by_role("button", name="Add").nth(1).click()
    visible(page, "P0 browser verification")

    # Planned-versus-actual budget management.
    page.goto(f"{BASE_URL}/app/events/evt-gala/budget", wait_until="networkidle")
    visible(page, "Budget")
    visible(page, "Estimated")
    visible(page, "Actual")
    visible(page, "Variance")

    # Floorplan builder with a save.
    page.goto(f"{BASE_URL}/app/events/evt-gala/vendors", wait_until="networkidle")
    visible(page, "Floorplan")
    page.get_by_role("button", name="Round table", exact=True).click()
    page.get_by_role("button", name="Save").click()
    visible(page, "Floorplan saved")

    # The previous write must appear in structured planning history.
    page.goto(f"{BASE_URL}/app/events/evt-gala", wait_until="networkidle")
    visible(page, "Planning history")
    visible(page, "Saved floorplan: Ballroom - 30 tables")

    assert not browser_errors, "Browser console errors:\n" + "\n".join(browser_errors)
    browser.close()

print("P0 end-to-end browser test passed")
