"""Per-page smoke (plan 10.4): every route in plan 5.1, for every role that may see it.
No console/page errors, an h1, a <main> landmark and no error state. Roles that may NOT see a
route must end up on #/forbidden."""
import pytest

from helpers import ALL_ROLES, CONSOLE_IGNORE, goto, routes

_IDS = {"judgment": 1, "draft": 1, "review_draft": 4, "matter": "macp-3-2021"}
ALLOWED = [(name, route, role) for name, route, roles in routes(_IDS) for role in roles]
DENIED = [(name, route, role) for name, route, roles in routes(_IDS) for role in ALL_ROLES
          if role not in roles and name not in ("forbidden", "not-found")]


@pytest.mark.parametrize("name,route,role", ALLOWED, ids=[f"{r}-{n}" for n, _, r in ALLOWED])
def test_route_smoke(page, login, browser_name, name, route, role):
    login(role)
    goto(page, route)
    assert page.locator("h1").count() >= 1
    assert page.locator("main, #g-main").count() >= 1
    body = page.inner_text("body")
    assert "Something went wrong" not in body, f"{route} rendered an error state"
    assert page.locator("h1").first.inner_text().strip() != ""
    page.wait_for_timeout(300)  # let late fetches (badges, freshness) settle
    errors = page.tracker.errors(ignore=CONSOLE_IGNORE)
    assert not errors, f"{route} as {role}: {errors}"
    failed = [f for f in page.tracker.failed if "ERR_ABORTED" not in f and "NS_BINDING_ABORTED" not in f]
    assert not failed, failed


@pytest.mark.parametrize("name,route,role", DENIED, ids=[f"{r}-{n}" for n, _, r in DENIED])
def test_route_denied(page, login, browser_name, name, route, role):
    login(role)
    page.goto("/app/#" + route)
    page.wait_for_function("() => location.hash.startsWith('#/forbidden')")
    page.wait_for_selector("h1")
    assert "Something went wrong" not in page.inner_text("body")
