/**
 * Marios meeting scenarios (2026-06-25) — behavioral regression guards.
 *
 * Each test encodes a requirement straight from what Marios asked for, against
 * the pure helpers the fixes touched. UI-level scenarios (paid read-only,
 * batch-upcoming, edit-panel field removal, approve-preview) are validated by
 * the real-browser QA pass; these lock the deterministic logic so a future
 * change can't silently regress Marios's rules.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addOneMonth,
  addOneYear,
  isCommissionDescription,
  rollDescriptionMonth,
  rollDescriptionYear,
} from "../../lib/invoices/format";

test("R8 — commission is recognised from the agent's own words", async (t) => {
  await t.test("'commission from the sale of the land' (Marios's exact phrasing)", () => {
    assert.equal(isCommissionDescription("Marios Papa, commission from the sale of the land"), true);
  });
  await t.test("'15000 commission flat'", () => {
    assert.equal(isCommissionDescription("15000 euros commission flat"), true);
  });
  await t.test("bare 'sale of land' / 'sale of plot' (no 'commission' word)", () => {
    assert.equal(isCommissionDescription("Fee for the sale of land at Paphos"), true);
    assert.equal(isCommissionDescription("sale of the plot 5"), true);
  });
  await t.test("a plain rental is NOT a commission", () => {
    assert.equal(isCommissionDescription("Monthly rent for June 2026"), false);
    assert.equal(isCommissionDescription("Consulting services"), false);
  });
});

test("R14 — yearly advances by a year, monthly by a month (same shape)", async (t) => {
  await t.test("addOneYear advances the year, keeps day/month", () => {
    assert.equal(addOneYear("2026-06-25"), "2027-06-25");
  });
  await t.test("addOneMonth advances the month", () => {
    assert.equal(addOneMonth("2026-06-25"), "2026-07-25");
  });
  await t.test("addOneYear clamps Feb 29 → Feb 28 on a non-leap year", () => {
    // 2028 is a leap year; +1 lands on non-leap 2029 → clamp to the 28th.
    assert.equal(addOneYear("2028-02-29"), "2029-02-28");
  });
  await t.test("addOneMonth rolls the year boundary (Dec → Jan)", () => {
    assert.equal(addOneMonth("2026-12-15"), "2027-01-15");
  });
});

test("R15 — the recurring description rolls the month forward (one source of truth)", async (t) => {
  await t.test("June → July in the description", () => {
    const rolled = rollDescriptionMonth("Consulting services — June 2026");
    assert.match(rolled, /July/);
    assert.doesNotMatch(rolled, /June/);
  });
});

test("R14/R15 — the YEARLY description rolls the year forward (PDF shows 2027, not 2026)", async (t) => {
  await t.test("2026 → 2027 in the description", () => {
    const rolled = rollDescriptionYear("Yearly service · 2026");
    assert.match(rolled, /2027/);
    assert.doesNotMatch(rolled, /2026/);
  });
  await t.test("leaves text without a year untouched", () => {
    assert.equal(rollDescriptionYear("Annual maintenance"), "Annual maintenance");
  });
});
