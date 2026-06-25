#!/usr/bin/env python3
"""
Manual 3CX Call Audit via Playwright

Logs into 3CX web UI, scrapes today's call logs,
filters external callers to 22032770, checks against
Telegram groups in Supabase, and alerts for missing callers.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright

# --- Config ---
# Credentials come from the environment (see .env.local / Supabase secrets).
# Never hardcode the 3CX password here — this file is committed to git.
CX3_URL = os.environ.get("CX3_BASE_URL", "https://185.162.18.158:5001")
CX3_USER = os.environ.get("CX3_USERNAME", "000")
CX3_PASS = os.environ.get("CX3_PASSWORD", "")
TARGET_NUMBER = "22032770"

if not CX3_PASS:
    print("ERROR: Set CX3_PASSWORD env var (see .env.local)")
    sys.exit(1)
INTERNAL_EXTENSIONS = ["70", "64", "99", "801", "900"]

SUPABASE_URL = "https://vceeheaxcrhmpqueudqx.supabase.co"
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ZYPRESS_OTHERS_CHAT_ID = -1003337263793
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")


def normalize_phone(phone):
    if not phone:
        return None
    cleaned = re.sub(r"[\s\-(). +]", "", phone)
    if phone.startswith("+"):
        cleaned = "+" + re.sub(r"[^0-9]", "", cleaned)
    else:
        cleaned = re.sub(r"[^0-9]", "", cleaned)

    if len(cleaned) < 7:
        return None
    if cleaned.startswith("+357"):
        return cleaned
    if cleaned.startswith("357") and len(cleaned) >= 11:
        return "+" + cleaned
    if cleaned.startswith("0") and len(cleaned) == 9:
        return "+357" + cleaned[1:]
    if len(cleaned) == 8 and cleaned[0] in ("2", "9", "7"):
        return "+357" + cleaned
    if cleaned.startswith("+"):
        return cleaned
    if len(cleaned) >= 10 and not cleaned.startswith("357"):
        return "+" + cleaned
    return None


def is_internal(number):
    return number in INTERNAL_EXTENSIONS or any(
        number.endswith(ext) for ext in INTERNAL_EXTENSIONS
    )


def format_phone_display(phone):
    cleaned = re.sub(r"[^\d+]", "", phone)
    if cleaned.startswith("+357") and len(cleaned) == 12:
        local = cleaned[4:]
        return f"+357 {local[:2]} {local[2:5]} {local[5:]}"
    if cleaned.startswith("357") and len(cleaned) == 11:
        local = cleaned[3:]
        return f"+357 {local[:2]} {local[2:5]} {local[5:]}"
    return cleaned


def supabase_request(method, path, body=None):
    """Make a direct HTTP request to Supabase REST API."""
    import urllib.request

    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"  Supabase error: {e}")
        return None


def search_phone_in_groups(phone):
    """Search telegram_group_messages for a phone number."""
    cleaned = re.sub(r"[\s\-()]", "", phone)
    variants = [cleaned]
    if cleaned.startswith("+"):
        without_plus = cleaned[1:]
        variants.append(without_plus)
        if without_plus.startswith("357") and len(without_plus) > 3:
            variants.append(without_plus[3:])

    or_filter = ",".join(f"message_text.ilike.%{v}%" for v in variants)
    path = f"telegram_group_messages?select=group_name,message_date,sender_name&or=({or_filter})&limit=1"
    return supabase_request("GET", path)


def send_telegram_message(text):
    """Send a message to the Zypress Others Telegram group."""
    if not TELEGRAM_BOT_TOKEN:
        print(f"  [TELEGRAM] No bot token - would send:\n{text}")
        return None
    import urllib.request

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    data = json.dumps({"chat_id": ZYPRESS_OTHERS_CHAT_ID, "text": text}).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read().decode())
            if result.get("ok"):
                return result["result"]["message_id"]
    except Exception as e:
        print(f"  [TELEGRAM] Send failed: {e}")
    return None


def main():
    if not SUPABASE_SERVICE_KEY:
        print("ERROR: Set SUPABASE_SERVICE_ROLE_KEY env var")
        sys.exit(1)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    print("=== Manual 3CX Call Audit ===")
    print(f"Target: {TARGET_NUMBER}")
    print(f"Date: {today}")
    print()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(ignore_https_errors=True, viewport={"width": 1280, "height": 800})
        page = context.new_page()

        try:
            # Step 1: Login
            print("[1/5] Logging into 3CX...")
            page.goto(CX3_URL, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(3000)
            page.screenshot(path="/tmp/3cx-01-login.png")
            print("  Screenshot: /tmp/3cx-01-login.png")

            # Find login fields
            username_sels = [
                'input[name="username"]', 'input[name="Username"]',
                'input[type="text"]', 'input[id="username"]',
                '#inputUser', 'input[placeholder*="user" i]',
                'input[placeholder*="extension" i]', 'input[name="ext"]',
            ]
            password_sels = [
                'input[name="password"]', 'input[name="Password"]',
                'input[type="password"]', 'input[id="password"]',
            ]

            username_field = None
            password_field = None
            for sel in username_sels:
                if page.query_selector(sel):
                    username_field = sel
                    break
            for sel in password_sels:
                if page.query_selector(sel):
                    password_field = sel
                    break

            if not username_field or not password_field:
                # Wait more for SPA to load
                print("  Waiting for SPA to load...")
                page.wait_for_timeout(5000)
                page.screenshot(path="/tmp/3cx-02-wait.png")
                for sel in username_sels:
                    if page.query_selector(sel):
                        username_field = sel
                        break
                for sel in password_sels:
                    if page.query_selector(sel):
                        password_field = sel
                        break

            if not username_field or not password_field:
                inputs = page.eval_on_selector_all(
                    "input",
                    "els => els.map(e => ({type: e.type, name: e.name, id: e.id, placeholder: e.placeholder}))",
                )
                print(f"  Visible inputs: {json.dumps(inputs, indent=2)}")
                raise Exception("Could not find login form fields")

            print(f"  Username field: {username_field}")
            print(f"  Password field: {password_field}")

            page.fill(username_field, CX3_USER)
            page.fill(password_field, CX3_PASS)

            # Submit
            login_btns = [
                'button[type="submit"]', 'input[type="submit"]',
                'button:has-text("Log in")', 'button:has-text("Login")',
                'button:has-text("Sign in")', 'button:has-text("OK")',
            ]
            clicked = False
            for sel in login_btns:
                btn = page.query_selector(sel)
                if btn:
                    btn.click()
                    clicked = True
                    print(f"  Clicked: {sel}")
                    break
            if not clicked:
                page.keyboard.press("Enter")
                print("  Pressed Enter")

            page.wait_for_timeout(5000)
            page.screenshot(path="/tmp/3cx-03-loggedin.png")
            print(f"  Screenshot: /tmp/3cx-03-loggedin.png")
            print(f"  URL: {page.url}")

            # Step 2: Navigate to call logs
            print("\n[2/5] Navigating to call logs...")
            call_log_paths = [
                "/webclient/#/people/call-logs",
                "/webclient/#/calllog",
                "/webclient/#/call-logs",
                "/#/people/call-logs",
                "/#/calllog",
            ]
            found = False
            for path in call_log_paths:
                try:
                    page.goto(CX3_URL + path, wait_until="networkidle", timeout=15000)
                    page.wait_for_timeout(3000)
                    content = page.content().lower()
                    if "call" in content or "history" in content:
                        found = True
                        print(f"  Found call log at: {path}")
                        break
                except:
                    continue

            if not found:
                nav_sels = [
                    "text=Call Log", "text=Call Logs", "text=History",
                    "text=Call History", "text=Calls",
                ]
                for sel in nav_sels:
                    el = page.query_selector(sel)
                    if el:
                        el.click()
                        page.wait_for_timeout(3000)
                        found = True
                        print(f"  Clicked nav: {sel}")
                        break

            page.screenshot(path="/tmp/3cx-04-calllog.png")
            print("  Screenshot: /tmp/3cx-04-calllog.png")

            # Step 3: Extract call data via API using browser session
            print("\n[3/5] Extracting call data via browser session API...")

            start_of_day = f"{today}T00:00:00.000Z"
            end_of_day = f"{today}T23:59:59.000Z"

            api_data = page.evaluate(
                """({startOfDay, endOfDay, targetNumber}) => {
                    const endpoints = [
                        { url: `/api/calllog?dateFrom=${encodeURIComponent(startOfDay)}&dateTo=${encodeURIComponent(endOfDay)}`, method: 'GET' },
                        { url: `/webclient/api/CallLog/GetCallHistory?from=${encodeURIComponent(startOfDay)}&to=${encodeURIComponent(endOfDay)}`, method: 'GET' },
                        { url: `/api/activeCalls/getCallLog`, method: 'POST', body: JSON.stringify({ dateFrom: startOfDay, dateTo: endOfDay }) },
                    ];

                    return (async () => {
                        for (const ep of endpoints) {
                            try {
                                const opts = { method: ep.method, headers: { 'Accept': 'application/json' } };
                                if (ep.body) {
                                    opts.body = ep.body;
                                    opts.headers['Content-Type'] = 'application/json';
                                }
                                const res = await fetch(ep.url, opts);
                                const status = res.status;
                                const ct = res.headers.get('content-type') || '';
                                if (res.ok && ct.includes('json')) {
                                    const data = await res.json();
                                    return { endpoint: ep.url, data, status };
                                }
                                if (res.ok) {
                                    const text = await res.text();
                                    return { endpoint: ep.url, text: text.substring(0, 3000), status };
                                }
                            } catch (e) {
                                // continue
                            }
                        }
                        return null;
                    })();
                }""",
                {"startOfDay": start_of_day, "endOfDay": end_of_day, "targetNumber": TARGET_NUMBER},
            )

            entries = []
            if api_data and api_data.get("data"):
                print(f"  API success via: {api_data['endpoint']}")
                raw = api_data["data"]
                if isinstance(raw, list):
                    entries = raw
                elif isinstance(raw, dict):
                    entries = raw.get("list", raw.get("calls", raw.get("data", [])))
                print(f"  Raw entries: {len(entries)}")
                if entries:
                    print(f"  Sample entry keys: {list(entries[0].keys()) if entries else 'N/A'}")
            elif api_data and api_data.get("text"):
                print(f"  API returned non-JSON from: {api_data['endpoint']}")
                print(f"  Preview: {api_data['text'][:300]}")
            else:
                print("  All API endpoints failed from browser context too")
                # Try scraping DOM
                rows = page.eval_on_selector_all(
                    "table tr, .call-row, .call-item, [class*='call'], [class*='row'], [class*='history']",
                    "els => els.map(e => e.innerText).filter(t => t.trim().length > 0)",
                )
                print(f"  DOM rows found: {len(rows)}")
                for row in rows[:10]:
                    print(f"    {row[:120]}")

            page.screenshot(path="/tmp/3cx-05-data.png")

            # Step 4: Filter external callers
            print(f"\n[4/5] Filtering calls (raw: {len(entries)})...")

            external_callers = {}  # phone -> callTime

            for entry in entries:
                caller = (
                    entry.get("callerNumber") or entry.get("CallerNumber") or
                    entry.get("Caller") or entry.get("from") or entry.get("From") or
                    entry.get("caller") or entry.get("source") or entry.get("Source") or ""
                )
                called = (
                    entry.get("calledNumber") or entry.get("CalledNumber") or
                    entry.get("Called") or entry.get("to") or entry.get("To") or
                    entry.get("called") or entry.get("destination") or entry.get("Destination") or ""
                )
                call_time = (
                    entry.get("callTime") or entry.get("CallTime") or entry.get("Time") or
                    entry.get("StartTime") or entry.get("start_time") or entry.get("timestamp") or
                    entry.get("DateTime") or ""
                )
                direction = str(
                    entry.get("direction") or entry.get("Direction") or
                    entry.get("CallDirection") or entry.get("Type") or entry.get("type") or ""
                ).lower()

                caller = str(caller)
                called = str(called)

                if not caller or not called:
                    continue

                # Check if call is to target number
                if TARGET_NUMBER not in called:
                    continue

                # Skip internal extensions
                if is_internal(caller):
                    continue

                normalized = normalize_phone(caller)
                if normalized and normalized not in external_callers:
                    external_callers[normalized] = call_time or datetime.now(timezone.utc).isoformat()

            print(f"  External callers: {len(external_callers)}")
            for phone, time in external_callers.items():
                print(f"    {format_phone_display(phone)} at {time}")

            if not external_callers:
                print("\n  No external callers to 22032770 found today.")
                browser.close()
                return

            # Step 5: Check against Telegram groups and alert
            print(f"\n[5/5] Checking {len(external_callers)} callers against Telegram groups...")

            missing_callers = []

            for phone, call_time in external_callers.items():
                results = search_phone_in_groups(phone)
                if results and len(results) > 0:
                    print(f"  FOUND: {format_phone_display(phone)} in {results[0].get('group_name', '?')} ({results[0].get('message_date', '?')})")
                else:
                    print(f"  MISSING: {format_phone_display(phone)} - not in any group")
                    missing_callers.append({"phone": phone, "call_time": call_time})

            print(f"\n=== RESULTS ===")
            print(f"Total external callers: {len(external_callers)}")
            print(f"Missing from groups: {len(missing_callers)}")

            if not missing_callers:
                print("All callers accounted for. No alerts needed.")
            else:
                print("\nSending alerts to Telegram (Vasia)...")

                for mc in missing_callers:
                    display = format_phone_display(mc["phone"])
                    try:
                        time_display = datetime.fromisoformat(mc["call_time"].replace("Z", "+00:00")).strftime("%H:%M")
                    except:
                        time_display = "Unknown"

                    message = (
                        "\u26a0\ufe0f MISSING CALLER ALERT (Manual Audit)\n\n"
                        f"Phone: {display}\n"
                        f"Call Time: {time_display}\n"
                        f"Date: {today}\n\n"
                        "This number was NOT found in any Telegram group.\n"
                        "Please check if this caller has been attended to."
                    )

                    msg_id = send_telegram_message(message)
                    if msg_id:
                        print(f"  Alert sent for {display} (msg ID: {msg_id})")
                    else:
                        print(f"  Alert logged for {display}")

                    # Save to DB
                    supabase_request("POST", "caller_alerts", {
                        "caller_phone": mc["phone"],
                        "status": "alerted",
                        "call_time": mc["call_time"],
                    })

            browser.close()
            print("\nDone.")

        except Exception as e:
            print(f"\nERROR: {e}")
            page.screenshot(path="/tmp/3cx-error.png")
            print("Error screenshot: /tmp/3cx-error.png")
            browser.close()
            sys.exit(1)


if __name__ == "__main__":
    main()
