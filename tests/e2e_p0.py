"""Browser regression for authenticated entry and the five P0 workflows."""

import os
import re

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3000")


def wait_for_exact_text(page, text: str) -> None:
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
    assert pricing.evaluate("node => node.nextElementSibling?.id") == "testimonial"
    testimonial = page.locator("#testimonial")
    testimonial.wait_for(state="visible", timeout=5_000)
    assert "They’re incredible at sourcing vendors" in testimonial.inner_text()
    assert "Jaclynn Brennan" in testimonial.inner_text()
    assert "Co-founder, Ayana Foundation" in testimonial.inner_text()
    assert testimonial.locator("figure").count() == 2
    nia_card = testimonial.locator("figure").filter(has_text="Nia Sanchez")
    nia_card_text = nia_card.inner_text()
    assert "Bravo" in nia_card_text
    assert "The Valley" in nia_card_text
    assert "Used Beebizy" in nia_card_text
    nia_video = nia_card.get_by_label("Nia Sanchez video testimonial")
    assert nia_video.get_attribute("poster") == "/nia-sanchez-testimonial-poster.jpg"
    assert nia_video.locator('source[type="video/mp4"]').get_attribute("src") == "/nia-sanchez-testimonial.mp4"
    assert nia_video.evaluate(
        """async video => {
            if (video.readyState < 1) {
                video.load();
                await new Promise((resolve, reject) => {
                    video.addEventListener('loadedmetadata', resolve, { once: true });
                    video.addEventListener('error', () => reject(new Error('Video metadata failed to load')), { once: true });
                });
            }
            video.muted = true;
            await video.play();
            const played = !video.paused && video.duration > 0;
            video.pause();
            return played;
        }"""
    )

    mobile_page = browser.new_page(viewport={"width": 390, "height": 844})
    mobile_page.goto(BASE_URL, wait_until="networkidle")
    mobile_testimonial = mobile_page.locator("#testimonial")
    mobile_testimonial.wait_for(state="visible", timeout=5_000)
    quote_box = mobile_testimonial.locator("blockquote").bounding_box()
    attribution_box = mobile_testimonial.get_by_text("Jaclynn Brennan", exact=True).bounding_box()
    assert quote_box and attribution_box and quote_box["y"] < attribution_box["y"]
    mobile_video = mobile_testimonial.get_by_label("Nia Sanchez video testimonial")
    assert mobile_video.is_visible()
    assert mobile_video.evaluate("video => video.controls && video.playsInline")
    assert mobile_page.evaluate(
        "document.documentElement.scrollWidth === document.documentElement.clientWidth",
    )
    mobile_page.close()

    wait_for_exact_text(
        page,
        "Enterprise, lean, or mission-driven. Sign in to launch the working demo. No credit card.",
    )

    # Every landing-page demo CTA must enter through authentication.
    for cta in ("Try the Demo", "Launch Demo", "Launch the Demo"):
        page.get_by_role("button", name=cta, exact=True).click()
        page.wait_for_url("**/login", timeout=5_000)
        wait_for_exact_text(page, "Sign in to Beebizy")
        assert page.evaluate("sessionStorage.getItem('beebizy:product-demo')") is None
        page.goto(BASE_URL, wait_until="networkidle")

    # The Enterprise sales CTA is not a product launch and must keep its lead form.
    page.get_by_role("link", name="Contact us", exact=True).click()
    page.get_by_role("dialog", name="Talk to sales").wait_for(state="visible", timeout=5_000)
    assert page.url.rstrip("/") == BASE_URL.rstrip("/")
    page.get_by_role("button", name="Cancel", exact=True).click()

    # Keep the seeded product available to regression tests without exposing an
    # authentication bypass through the public landing page.
    page.evaluate("sessionStorage.setItem('beebizy:product-demo', 'true')")
    page.goto(f"{BASE_URL.rstrip('/')}/app", wait_until="networkidle")
    wait_for_exact_text(page, "Demo data.")

    # Multi-location calendar.
    page.get_by_role("link", name="Events", exact=True).click()
    wait_for_exact_text(page, "Every event you run")
    page.get_by_role("button", name="Calendar view").click()
    wait_for_exact_text(page, "Today")
    page.locator('a[title*="Global Sales Kickoff"]').first.wait_for(state="visible")
    calendar = page.locator('a[title*=" · "]')
    calendar_text = " ".join(calendar.all_inner_texts())
    assert "Moscone Center West" in calendar_text
    assert "The Foundry Loft" in calendar_text

    venue_filter = page.get_by_label("Filter by venue")
    venue_filter.click()
    page.get_by_role("option", name="Moscone Center West").click()
    page.locator('a[title*="Global Sales Kickoff"]').first.wait_for(state="visible")
    assert page.locator('a[title*="Customer Advisory Board — Spring"]').count() == 0

    venue_filter.click()
    page.get_by_role("option", name="All venues").click()
    page.get_by_role("button", name="List view").click()
    page.get_by_text("Annual Partner Gala & Fundraiser", exact=True).click()

    # Run of show builder with a real write.
    page.get_by_role("link", name="Plan", exact=True).click()
    wait_for_exact_text(page, "Run of show")
    page.get_by_role("textbox", name="Cue title").fill("P0 browser verification")
    page.get_by_role("button", name="Add").nth(1).click()
    wait_for_exact_text(page, "P0 browser verification")

    # Planned-versus-actual budget management with a tracked actual-spend write.
    event_sections = page.get_by_label("Event sections")
    event_sections.get_by_role("link", name="Budget", exact=True).click()
    wait_for_exact_text(page, "Budget")
    wait_for_exact_text(page, "Estimated")
    wait_for_exact_text(page, "Actual")
    wait_for_exact_text(page, "Variance")
    catering_actual = page.get_by_label("Actual for Catering — 300 covers")
    catering_actual.fill("60001")
    page.locator("h2", has_text="Budget").first.click()
    assert catering_actual.input_value() == "60001"
    wait_for_exact_text(page, "-$3,999")

    # Floorplan builder with a save.
    event_sections.get_by_role("link", name="Vendors", exact=True).click()
    wait_for_exact_text(page, "Floorplan")
    page.get_by_role("button", name="Round table", exact=True).click()
    page.get_by_role("button", name="Save").click()
    wait_for_exact_text(page, "Floorplan saved")

    # The writes above must survive SPA navigation and appear in structured history.
    event_sections.get_by_role("link", name="Overview", exact=True).click()
    wait_for_exact_text(page, "Planning history")
    wait_for_exact_text(page, "Created run-of-show: P0 browser verification")
    wait_for_exact_text(page, "Updated budget: Catering — 300 covers")
    page.get_by_text(re.compile(r"^Updated floorplan:")).first.wait_for(state="visible")

    assert not browser_errors, "Browser console errors:\n" + "\n".join(browser_errors)
    browser.close()

print("P0 end-to-end browser test passed")
