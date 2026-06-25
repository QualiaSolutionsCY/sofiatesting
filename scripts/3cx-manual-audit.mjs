/**
 * Manual 3CX Call Audit via Playwright
 *
 * Logs into 3CX web UI, scrapes today's call logs,
 * filters external callers to 22032770, and triggers
 * the alert pipeline for missing callers.
 */

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

// --- Config ---
// Credentials come from the environment (see .env.local / Supabase secrets).
// Never hardcode the 3CX password here — this file is committed to git.
const CX3_URL = process.env.CX3_BASE_URL || "https://185.162.18.158:5001";
const CX3_USER = process.env.CX3_USERNAME || "000";
const CX3_PASS = process.env.CX3_PASSWORD;
const TARGET_NUMBER = "22032770";

if (!CX3_PASS) {
  console.error("ERROR: Set CX3_PASSWORD env var (see .env.local)");
  process.exit(1);
}
const INTERNAL_EXTENSIONS = ["70", "64", "99", "801", "900"];

// Supabase
const SUPABASE_URL = "https://vceeheaxcrhmpqueudqx.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("ERROR: Set SUPABASE_SERVICE_ROLE_KEY env var");
  console.error('Run: export SUPABASE_SERVICE_ROLE_KEY="your-key-here"');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Telegram
const ZYPRESS_OTHERS_CHAT_ID = -1_003_337_263_793;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// --- Helpers ---
function normalizePhone(phone) {
  let cleaned = phone.replace(/[\s\-().+]/g, "");
  if (phone.startsWith("+")) cleaned = "+" + cleaned.replace(/[^0-9]/g, "");
  else cleaned = cleaned.replace(/[^0-9]/g, "");

  if (cleaned.length < 7) return null;
  if (cleaned.startsWith("+357")) return cleaned;
  if (cleaned.startsWith("357") && cleaned.length >= 11) return "+" + cleaned;
  if (cleaned.startsWith("0") && cleaned.length === 9)
    return "+357" + cleaned.substring(1);
  if (
    cleaned.length === 8 &&
    (cleaned.startsWith("2") ||
      cleaned.startsWith("9") ||
      cleaned.startsWith("7"))
  )
    return "+357" + cleaned;
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length >= 10 && !cleaned.startsWith("357")) return "+" + cleaned;
  return null;
}

function isInternal(number) {
  return (
    INTERNAL_EXTENSIONS.includes(number) ||
    INTERNAL_EXTENSIONS.some((ext) => number.endsWith(ext))
  );
}

function formatPhoneDisplay(phone) {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+357") && cleaned.length === 12) {
    const local = cleaned.slice(4);
    return `+357 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  }
  if (cleaned.startsWith("357") && cleaned.length === 11) {
    const local = cleaned.slice(3);
    return `+357 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  }
  return cleaned;
}

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("[TELEGRAM] No bot token - would send:", text);
    return null;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: ZYPRESS_OTHERS_CHAT_ID,
      text,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error("[TELEGRAM] Send failed:", data);
    return null;
  }
  return data.result.message_id;
}

// --- Main ---
async function main() {
  console.log("=== Manual 3CX Call Audit ===");
  console.log(`Target: ${TARGET_NUMBER}`);
  console.log(
    `Date: ${new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Nicosia" })}`
  );
  console.log("");

  // Step 1: Launch browser and login to 3CX
  console.log("[1/5] Launching browser and logging into 3CX...");
  const browser = await chromium.launch({
    headless: true,
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    // Navigate to 3CX
    await page.goto(CX3_URL, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(2000);

    // Take screenshot for debugging
    await page.screenshot({ path: "/tmp/3cx-01-login-page.png" });
    console.log("  Screenshot saved: /tmp/3cx-01-login-page.png");

    // Try to find login form
    const pageContent = await page.content();

    // Look for username/password fields
    const usernameSelectors = [
      'input[name="username"]',
      'input[name="Username"]',
      'input[name="user"]',
      'input[type="text"]',
      'input[id="username"]',
      'input[id="Username"]',
      "#inputUser",
      'input[placeholder*="user" i]',
      'input[placeholder*="extension" i]',
      'input[name="ext"]',
    ];

    const passwordSelectors = [
      'input[name="password"]',
      'input[name="Password"]',
      'input[type="password"]',
      'input[id="password"]',
      'input[id="Password"]',
      "#inputPassword",
    ];

    let usernameField = null;
    let passwordField = null;

    for (const sel of usernameSelectors) {
      const el = await page.$(sel);
      if (el) {
        usernameField = sel;
        break;
      }
    }
    for (const sel of passwordSelectors) {
      const el = await page.$(sel);
      if (el) {
        passwordField = sel;
        break;
      }
    }

    if (!usernameField || !passwordField) {
      // Maybe it's a single-page app that loads dynamically
      console.log("  Waiting for login form to load...");
      await page.waitForTimeout(5000);
      await page.screenshot({ path: "/tmp/3cx-02-after-wait.png" });

      // Try again
      for (const sel of usernameSelectors) {
        const el = await page.$(sel);
        if (el) {
          usernameField = sel;
          break;
        }
      }
      for (const sel of passwordSelectors) {
        const el = await page.$(sel);
        if (el) {
          passwordField = sel;
          break;
        }
      }
    }

    if (!usernameField || !passwordField) {
      console.log("  Page title:", await page.title());
      console.log("  URL:", page.url());
      // Dump visible input fields for debugging
      const inputs = await page.$$eval("input", (els) =>
        els.map((e) => ({
          type: e.type,
          name: e.name,
          id: e.id,
          placeholder: e.placeholder,
          className: e.className,
        }))
      );
      console.log("  Visible inputs:", JSON.stringify(inputs, null, 2));
      throw new Error("Could not find login form fields");
    }

    console.log(`  Found username field: ${usernameField}`);
    console.log(`  Found password field: ${passwordField}`);

    // Fill in credentials
    await page.fill(usernameField, CX3_USER);
    await page.fill(passwordField, CX3_PASS);

    // Find and click login button
    const loginButtonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Log in")',
      'button:has-text("Login")',
      'button:has-text("Sign in")',
      'button:has-text("OK")',
      ".login-button",
      "#loginButton",
    ];

    let clicked = false;
    for (const sel of loginButtonSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          clicked = true;
          console.log(`  Clicked login button: ${sel}`);
          break;
        }
      } catch {
        /* try next */
      }
    }

    if (!clicked) {
      // Try pressing Enter
      await page.keyboard.press("Enter");
      console.log("  Pressed Enter to submit");
    }

    // Wait for navigation
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "/tmp/3cx-03-after-login.png" });
    console.log("  Screenshot saved: /tmp/3cx-03-after-login.png");
    console.log("  Current URL:", page.url());

    // Step 2: Navigate to call logs
    console.log("\n[2/5] Navigating to call logs...");

    // Try various call log navigation approaches
    const callLogPaths = [
      "/webclient/#/people/call-logs",
      "/webclient/#/calllog",
      "/webclient/#/call-logs",
      "/#/people/call-logs",
      "/#/calllog",
    ];

    let foundCallLog = false;
    for (const path of callLogPaths) {
      try {
        await page.goto(CX3_URL + path, {
          waitUntil: "networkidle",
          timeout: 15_000,
        });
        await page.waitForTimeout(3000);
        const url = page.url();
        const content = await page.content();
        if (
          content.includes("call") ||
          content.includes("Call") ||
          content.includes("history")
        ) {
          foundCallLog = true;
          console.log(`  Found call log at: ${path}`);
          break;
        }
      } catch {
        /* try next */
      }
    }

    // Also try clicking navigation elements
    if (!foundCallLog) {
      console.log("  Trying to find call log via navigation clicks...");
      const navSelectors = [
        "text=Call Log",
        "text=Call Logs",
        "text=History",
        "text=Call History",
        '[data-testid*="calllog"]',
        'a[href*="call"]',
        'button:has-text("Calls")',
      ];
      for (const sel of navSelectors) {
        try {
          const el = await page.$(sel);
          if (el) {
            await el.click();
            await page.waitForTimeout(3000);
            foundCallLog = true;
            console.log(`  Clicked: ${sel}`);
            break;
          }
        } catch {
          /* try next */
        }
      }
    }

    await page.screenshot({ path: "/tmp/3cx-04-call-logs.png" });
    console.log("  Screenshot saved: /tmp/3cx-04-call-logs.png");

    // Step 3: Extract call data
    console.log("\n[3/5] Extracting call data...");

    // Try to intercept API calls or scrape the DOM
    // First attempt: intercept XHR/fetch responses for call data
    const callData = [];

    // Try scraping the visible table/list
    const tableRows = await page
      .$$eval(
        'table tr, .call-row, .call-item, [class*="call"], [class*="row"]',
        (rows) => {
          return rows.map((row) => ({
            text: row.innerText,
            html: row.innerHTML.substring(0, 500),
          }));
        }
      )
      .catch(() => []);

    console.log(`  Found ${tableRows.length} potential rows`);

    // Also try to get data via the API directly using the browser's session
    console.log("  Trying API call via browser session...");

    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/Nicosia",
    });
    const startOfDay = `${today}T00:00:00.000Z`;
    const endOfDay = `${today}T23:59:59.000Z`;

    // Use page.evaluate to make API calls with the browser's cookies
    const apiData = await page.evaluate(
      async ({ startOfDay, endOfDay, targetNumber }) => {
        const endpoints = [
          {
            url: `/api/calllog?dateFrom=${encodeURIComponent(startOfDay)}&dateTo=${encodeURIComponent(endOfDay)}&filter=${encodeURIComponent(targetNumber)}`,
            method: "GET",
          },
          {
            url: `/api/calllog?dateFrom=${encodeURIComponent(startOfDay)}&dateTo=${encodeURIComponent(endOfDay)}`,
            method: "GET",
          },
          {
            url: `/webclient/api/CallLog/GetCallHistory?from=${encodeURIComponent(startOfDay)}&to=${encodeURIComponent(endOfDay)}`,
            method: "GET",
          },
          {
            url: "/api/activeCalls/getCallLog",
            method: "POST",
            body: JSON.stringify({ dateFrom: startOfDay, dateTo: endOfDay }),
          },
        ];

        for (const ep of endpoints) {
          try {
            const opts = {
              method: ep.method,
              headers: { Accept: "application/json" },
            };
            if (ep.body) {
              opts.body = ep.body;
              opts.headers["Content-Type"] = "application/json";
            }
            const res = await fetch(ep.url, opts);
            if (res.ok) {
              const contentType = res.headers.get("content-type") || "";
              if (contentType.includes("json")) {
                const data = await res.json();
                return { endpoint: ep.url, data, status: res.status };
              }
              const text = await res.text();
              return {
                endpoint: ep.url,
                text: text.substring(0, 2000),
                status: res.status,
              };
            }
          } catch (e) {
            // continue
          }
        }
        return null;
      },
      { startOfDay, endOfDay, targetNumber: TARGET_NUMBER }
    );

    let entries = [];

    if (apiData && apiData.data) {
      console.log(`  API success via: ${apiData.endpoint}`);
      const raw = apiData.data;
      const list = Array.isArray(raw)
        ? raw
        : raw.list || raw.calls || raw.data || [];
      console.log(`  Raw entries: ${list.length}`);
      entries = list;
    } else if (apiData && apiData.text) {
      console.log(`  API returned non-JSON from: ${apiData.endpoint}`);
      console.log(`  Response preview: ${apiData.text.substring(0, 200)}`);
    } else {
      console.log("  All API endpoints failed from browser context too");

      // Fall back to DOM scraping
      if (tableRows.length > 0) {
        console.log("  Falling back to DOM scraping...");
        for (const row of tableRows) {
          // Try to extract phone numbers from text
          const phoneMatches = row.text.match(/\+?\d[\d\s\-()]{6,}/g);
          if (phoneMatches) {
            for (const match of phoneMatches) {
              const cleaned = match.replace(/[\s\-()]/g, "");
              if (cleaned.includes(TARGET_NUMBER) || cleaned.length >= 8) {
                entries.push({ rawText: row.text, phones: phoneMatches });
              }
            }
          }
        }
        console.log(`  Scraped ${entries.length} entries from DOM`);
      }
    }

    // Take final screenshot
    await page.screenshot({ path: "/tmp/3cx-05-data.png" });

    // Step 4: Filter external callers
    console.log(`\n[4/5] Filtering calls (total raw: ${entries.length})...`);

    const externalCallers = new Map(); // phone -> callTime

    for (const entry of entries) {
      // Handle structured API data
      const callerNumber =
        entry.callerNumber ||
        entry.CallerNumber ||
        entry.Caller ||
        entry.from ||
        entry.From ||
        entry.caller ||
        entry.source ||
        entry.Source;
      const calledNumber =
        entry.calledNumber ||
        entry.CalledNumber ||
        entry.Called ||
        entry.to ||
        entry.To ||
        entry.called ||
        entry.destination ||
        entry.Destination;
      const callTime =
        entry.callTime ||
        entry.CallTime ||
        entry.Time ||
        entry.StartTime ||
        entry.start_time ||
        entry.timestamp ||
        entry.DateTime;
      const direction =
        entry.direction ||
        entry.Direction ||
        entry.CallDirection ||
        entry.call_direction ||
        entry.Type ||
        entry.type ||
        "";

      if (callerNumber && calledNumber) {
        // Check if call is to target number
        const isTarget = String(calledNumber).includes(TARGET_NUMBER);
        if (!isTarget) continue;

        // Check if inbound
        const dir = String(direction).toLowerCase();
        const isInbound =
          dir.includes("inbound") || dir === "in" || dir === "1" || dir === "";

        // Check if internal
        if (isInternal(String(callerNumber))) continue;

        const normalized = normalizePhone(String(callerNumber));
        if (normalized && !externalCallers.has(normalized)) {
          externalCallers.set(normalized, callTime || new Date().toISOString());
        }
      }

      // Handle DOM-scraped data
      if (entry.rawText && entry.phones) {
        for (const phone of entry.phones) {
          const cleaned = phone.replace(/[\s\-()]/g, "");
          if (
            cleaned === TARGET_NUMBER ||
            cleaned.length < 7 ||
            isInternal(cleaned)
          )
            continue;
          const normalized = normalizePhone(cleaned);
          if (normalized && !externalCallers.has(normalized)) {
            externalCallers.set(normalized, new Date().toISOString());
          }
        }
      }
    }

    console.log(`  External callers found: ${externalCallers.size}`);
    for (const [phone, time] of externalCallers) {
      console.log(`    ${formatPhoneDisplay(phone)} at ${time}`);
    }

    if (externalCallers.size === 0) {
      console.log("\n  No external callers found today. Nothing to audit.");
      await browser.close();
      return;
    }

    // Step 5: Check against Telegram groups (via Supabase DB) and alert
    console.log("\n[5/5] Checking callers against Telegram groups...");

    const missingCallers = [];

    for (const [phone, callTime] of externalCallers) {
      // Generate search variants
      const cleaned = phone.replace(/[\s\-()]/g, "");
      const variants = [cleaned];
      if (cleaned.startsWith("+")) {
        const withoutPlus = cleaned.slice(1);
        variants.push(withoutPlus);
        if (withoutPlus.startsWith("357") && withoutPlus.length > 3) {
          variants.push(withoutPlus.slice(3));
        }
      }

      // Search telegram_group_messages
      const orFilter = variants
        .map((v) => `message_text.ilike.%${v}%`)
        .join(",");
      const { data, error } = await supabase
        .from("telegram_group_messages")
        .select("group_name, message_date, sender_name")
        .or(orFilter)
        .limit(1);

      if (error) {
        console.log(`  DB error searching ${phone}: ${error.message}`);
        missingCallers.push({ phone, callTime });
        continue;
      }

      if (data && data.length > 0) {
        console.log(
          `  FOUND: ${formatPhoneDisplay(phone)} in ${data[0].group_name} (${data[0].message_date})`
        );
      } else {
        console.log(
          `  MISSING: ${formatPhoneDisplay(phone)} - not in any group`
        );
        missingCallers.push({ phone, callTime });
      }
    }

    console.log("\n=== RESULTS ===");
    console.log(`Total external callers: ${externalCallers.size}`);
    console.log(`Missing from groups: ${missingCallers.length}`);

    if (missingCallers.length === 0) {
      console.log("All callers accounted for. No alerts needed.");
    } else {
      console.log("\nSending alerts to Telegram...");

      for (const { phone, callTime } of missingCallers) {
        const displayPhone = formatPhoneDisplay(phone);
        const timeDisplay = callTime
          ? new Date(callTime).toLocaleTimeString("en-GB", {
              timeZone: "Europe/Nicosia",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
          : "Unknown";

        const message = [
          "\u26a0\ufe0f MISSING CALLER ALERT (Manual Audit)",
          "",
          `Phone: ${displayPhone}`,
          `Call Time: ${timeDisplay}`,
          `Date: ${today}`,
          "",
          "This number was NOT found in any Telegram group.",
          "Please check if this caller has been attended to.",
        ].join("\n");

        const msgId = await sendTelegramMessage(message);
        if (msgId) {
          console.log(`  Alert sent for ${displayPhone} (msg ID: ${msgId})`);
        } else {
          console.log(`  Alert logged for ${displayPhone} (no Telegram token)`);
        }

        // Rate limit
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Also save to DB
      for (const { phone, callTime } of missingCallers) {
        await supabase
          .from("caller_alerts")
          .insert({
            caller_phone: phone,
            status: "alerted",
            call_time: callTime || new Date().toISOString(),
          })
          .then(({ error }) => {
            if (error && !error.message.includes("duplicate")) {
              console.log(`  DB insert error for ${phone}: ${error.message}`);
            }
          });
      }
    }

    await browser.close();
    console.log("\nDone.");
  } catch (err) {
    console.error("ERROR:", err.message);
    await page.screenshot({ path: "/tmp/3cx-error.png" });
    console.log("Error screenshot saved: /tmp/3cx-error.png");
    await browser.close();
    process.exit(1);
  }
}

main();
