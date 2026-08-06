/* ============================================================
   Aurex Net Zero Platform — Global Net Zero Target Year
   ------------------------------------------------------------
   Single source of truth for the company's "Official Net Zero
   Target Year", shared across every page (Dashboard, Reduction
   Planner, Net Zero Scenarios, and any future page — Progress
   Tracking, Reports, Offset Projects, Company Profile — simply
   by adding the same data attributes used below).

   HOW IT'S SET
   The Net Zero Scenarios module computes three pathways
   (Conservative / Moderate / Aggressive) from the saved
   Reduction Plan. The Moderate scenario's calculated Net Zero
   Year is written here via NZTarget.set(year, ...) and becomes
   the platform-wide "official" target year.

   HOW OTHER PAGES CONSUME IT
   Any element marked with:
     data-nz-target-year   -> its text is replaced with the year
                               (or a fallback string if not set yet)
     data-nz-target-note   -> its text is replaced with a short
                               status note ("Set by Moderate
                               scenario on <date>" / "Not yet set")
   This script auto-applies on DOMContentLoaded, and again live
   (no refresh) whenever the value changes — either in the same
   tab (custom event) or elsewhere in this same browser session (storage
   event — sessionStorage is scoped to the session, so this reaches windows
   that share it, not unrelated independently-opened tabs).
   ============================================================ */
(function () {
  "use strict";

  const KEY = "nz-official-target-year";
  const EVENT_NAME = "nz-target-year-updated";
  const FALLBACK_TEXT = "Pending";

  function get() {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function set(year, meta) {
    const record = Object.assign(
      { year: year, scenario: "moderate", computedAt: new Date().toISOString() },
      meta || {}
    );
    try {
      sessionStorage.setItem(KEY, JSON.stringify(record));
    } catch (err) {
      /* sessionStorage unavailable — value simply won't persist across pages */
    }
    // Update this tab immediately; other windows in this same session pick it
    // up via the native "storage" event (sessionStorage-scoped).
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: record }));
    return record;
  }

  function clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch (err) { /* ignore */ }
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: null }));
  }

  function applyToPage() {
    const record = get();
    const yearEls = document.querySelectorAll("[data-nz-target-year]");
    const noteEls = document.querySelectorAll("[data-nz-target-note]");

    yearEls.forEach((el) => {
      el.textContent = record && record.year ? String(record.year) : FALLBACK_TEXT;
    });

    noteEls.forEach((el) => {
      if (record && record.year) {
        const d = new Date(record.computedAt);
        const stamp = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
        el.textContent = "Set by Moderate scenario on " + stamp;
      } else {
        el.textContent = "Not yet set — run Net Zero Scenarios";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", applyToPage);

  // Live update within the same tab (e.g. right after Net Zero Scenarios computes it)
  window.addEventListener(EVENT_NAME, applyToPage);

  // Live update across tabs (e.g. Dashboard open while Scenarios is recalculated elsewhere)
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) applyToPage();
  });

  window.NZTarget = { get: get, set: set, clear: clear, applyToPage: applyToPage, KEY: KEY };
})();
