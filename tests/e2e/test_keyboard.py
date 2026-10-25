"""Keyboard behaviour: sign-in tab order, skip link, Ctrl K palette open/close and focus return."""
import re

from playwright.sync_api import expect

from helpers import goto

_ACTIVE = ("() => { const a = document.activeElement; return {tag: a.tagName, type: a.type || ''}; }")


def test_signin_tab_order(page):
    page.goto("/app/")
    page.wait_for_url(re.compile(r"#/signin"))
    page.wait_for_selector("input[type=radio]")
    # The router moves focus to the page heading on navigation, so the first Tab stop is the profile group.
    page.keyboard.press("Tab")
    assert page.evaluate(_ACTIVE)["type"] == "radio"
    # keyboard choice of a profile reveals the Continue action, which is the next tab stop
    page.locator("input[type=radio]").first.focus()
    page.keyboard.press("Space")
    cont = page.get_by_role("button", name=re.compile(r"^Continue as"))
    expect(cont).to_be_visible()
    page.keyboard.press("Tab")
    expect(cont).to_be_focused()
    page.keyboard.press("Enter")
    page.wait_for_function("() => !location.hash.startsWith('#/signin')")


def test_skip_link_is_reachable_and_works(page, login):
    login("Justice")
    goto(page, "/research")
    skip = page.get_by_role("link", name="Skip to main content")
    skip.focus()
    expect(skip).to_be_focused()
    box = skip.bounding_box()
    assert box and box["y"] >= 0 and box["height"] > 0, "skip link must be visible while focused"


def test_palette_ctrl_k_and_escape_returns_focus(page, login):
    login("Justice")
    goto(page, "/")
    trigger = page.get_by_role("button", name="Search").first
    trigger.focus()
    page.keyboard.press("Control+k")
    palette = page.get_by_role("combobox", name="Search commands")
    expect(palette).to_be_visible()
    expect(palette).to_be_focused()
    page.keyboard.type("research")
    expect(page.get_by_role("option").first).to_be_visible()
    page.keyboard.press("Escape")
    expect(palette).to_be_hidden()
    expect(trigger).to_be_focused()  # focus returns to where it was
    page.keyboard.press("Control+k")
    page.keyboard.type("research")
    page.keyboard.press("Enter")
    page.wait_for_url(re.compile(r"#/research"))
