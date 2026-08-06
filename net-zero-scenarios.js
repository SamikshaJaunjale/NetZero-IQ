/* ============================================================
   Aurex Net Zero Platform — Net Zero Scenarios Module
   ------------------------------------------------------------
   This page contains NO user input. Every number shown here is
   derived automatically from the Reduction Plan the user already
   saved in reduction-planner.js (sessionStorage key "nz-reduction-plan").

   HOW THE MATH WORKS
   1. The saved plan already contains a blended "overallAnnualReductionPct"
      — the weighted-average annual reduction % across every category,
      weighted by each category's current emissions. That blended rate
      *is* the Moderate scenario's annual reduction rate, because it's
      literally what the company already told us it can achieve.
   2. Conservative = 60% of the Moderate rate (slower implementation).
   3. Aggressive = 150% of the Moderate rate, capped at 60%/year (faster
      implementation through stronger initiatives), and never lower
      than Moderate.
   4. Each rate is applied as a compound annual decline against the
      plan's baseline total emissions:
          E(n) = baseline * (1 - rate)^n
      "Net Zero" is reached when emissions fall to 2% of baseline
      (compound percentage decay is asymptotic and mathematically
      never reaches exactly zero, so 2% is the industry-standard
      practical threshold used here). Solving for n:
          n = ceil( ln(0.02) / ln(1 - rate) )
      Net Zero Year = current calendar year + n.
   5. The Moderate scenario's Net Zero Year is written to the shared
      "nz-official-target-year" key via window.NZTarget.set(...) —
      see net-zero-target.js — which is what makes it propagate to
      the Dashboard and every other page automatically.
   ============================================================ */
(function () {
  "use strict";

  const PLAN_KEY = "nz-reduction-plan";       // written by reduction-planner.js
  const NET_ZERO_THRESHOLD = 0.02;            // 2% of baseline counts as "net zero"
  const CURRENT_YEAR = new Date().getFullYear();

  const SCENARIOS = [
    {
      key: "conservative",
      label: "Conservative",
      badge: "Scenario 1",
      icon: "fa-turtle",
      color: "linear-gradient(145deg,#8FD9B7,#1FA97C)",
      rateMultiplier: 0.6,
      description: "A low, cautious reduction pathway that assumes slower rollout of efficiency and electrification initiatives."
    },
    {
      key: "moderate",
      label: "Moderate",
      badge: "Scenario 2 · Official",
      icon: "fa-scale-balanced",
      color: "linear-gradient(145deg,#5A8FEE,#2E6FE0)",
      rateMultiplier: 1.0,
      description: "The balanced, realistic pathway based directly on the annual reduction targets you saved — this is the company's most achievable route to Net Zero."
    },
    {
      key: "aggressive",
      label: "Aggressive",
      badge: "Scenario 3",
      icon: "fa-bolt",
      color: "linear-gradient(145deg,#10573F,#0A3B2C)",
      rateMultiplier: 1.5,
      description: "A faster pathway driven by stronger sustainability initiatives — renewable energy, electrification, operational improvements and carbon reduction projects."
    }
  ];

  function fmt1(n) {
    return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  function fmt(n) {
    return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  /* ============================================================
     1. LOAD THE SAVED REDUCTION PLAN (this page's only data source)
     ============================================================ */
  function loadPlan() {
    try {
      const raw = sessionStorage.getItem(PLAN_KEY);
      if (!raw) return null;
      const plan = JSON.parse(raw);
      if (!plan || !plan.summary || typeof plan.summary.overallAnnualReductionPct !== "number") return null;
      return plan;
    } catch (err) {
      return null;
    }
  }

  /* ============================================================
     2. NET ZERO YEAR CALCULATION (compound annual decline model)
     ============================================================ */
  function clampRate(rate) {
    // Keep rates within a sane 1%–60% annual band so the math never
    // divides by zero or produces an absurd (or negative) timeline.
    return Math.min(0.60, Math.max(0.01, rate));
  }

  function yearsToNetZero(rate) {
    if (rate <= 0) return Infinity;
    const n = Math.log(NET_ZERO_THRESHOLD) / Math.log(1 - rate);
    return Math.ceil(n);
  }

  function buildScenarioResults(moderateRate) {
    return SCENARIOS.map((s) => {
      const rate = s.key === "moderate"
        ? clampRate(moderateRate)
        : clampRate(moderateRate * s.rateMultiplier);
      const years = yearsToNetZero(rate);
      const netZeroYear = CURRENT_YEAR + years;
      return Object.assign({}, s, {
        annualRatePct: rate * 100,
        yearsToNetZero: years,
        netZeroYear: netZeroYear
      });
    });
  }

  /* ============================================================
     3. RENDER
     ============================================================ */
  function renderScenarioCard(scenario) {
    const isModerate = scenario.key === "moderate";
    const card = document.createElement("div");
    card.className = "nz-card nz-scenario-card" + (isModerate ? " nz-scenario-card-official" : "");
    card.innerHTML =
      '<div class="nz-scenario-badge-row">' +
        '<span class="nz-scenario-icon" style="background:' + scenario.color + ';"><i class="fa-solid ' + scenario.icon + '"></i></span>' +
        '<span class="nz-scenario-badge' + (isModerate ? " official" : "") + '">' + scenario.badge + "</span>" +
      "</div>" +
      '<div class="nz-scenario-label">' + scenario.label + "</div>" +
      '<div class="nz-scenario-desc">' + scenario.description + "</div>" +
      '<div class="nz-scenario-stats">' +
        '<div class="nz-scenario-stat">' +
          '<div class="v">' + fmt1(scenario.annualRatePct) + '<small>%/yr</small></div>' +
          '<div class="l">Annual reduction rate</div>' +
        "</div>" +
        '<div class="nz-scenario-stat">' +
          '<div class="v" style="font-family:var(--font-display);">' + scenario.netZeroYear + "</div>" +
          '<div class="l">Net Zero Year</div>' +
        "</div>" +
      "</div>" +
      '<div class="nz-scenario-timeline">' + scenario.yearsToNetZero + " years from " + CURRENT_YEAR + "</div>";
    return card;
  }

  function renderAll() {
    const plan = loadPlan();
    const emptyState = document.getElementById("nzs-empty-state");
    const mainContent = document.getElementById("nzs-main-content");

    if (!plan || plan.summary.overallAnnualReductionPct <= 0) {
      emptyState.style.display = "block";
      mainContent.style.display = "none";
      return;
    }

    emptyState.style.display = "none";
    mainContent.style.display = "block";

    const moderateRate = plan.summary.overallAnnualReductionPct / 100;
    const results = buildScenarioResults(moderateRate);
    const moderate = results.find((r) => r.key === "moderate");

    // Source note
    const savedDate = new Date(plan.savedAt);
    const stamp = savedDate.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    setText("nzs-source-note", ""); // clear, then set via innerHTML for the icon
    document.getElementById("nzs-source-note").innerHTML =
      '<i class="fa-solid fa-circle-info"></i> Based on the Reduction Plan saved ' + stamp;
    document.getElementById("nzs-baseline-note").textContent =
      "Baseline: " + fmt(plan.summary.totalCurrent) + " tCO₂e · Blended annual reduction: " + fmt1(plan.summary.overallAnnualReductionPct) + "%";

    // Scenario cards
    const container = document.getElementById("nzs-scenario-cards");
    container.innerHTML = "";
    results.forEach((s) => container.appendChild(renderScenarioCard(s)));

    // Persist the official, platform-wide Net Zero Target Year (Moderate scenario).
    if (window.NZTarget) {
      window.NZTarget.set(moderate.netZeroYear, {
        annualReductionPct: moderate.annualRatePct,
        baselineEmissions: plan.summary.totalCurrent,
        reductionPlanSavedAt: plan.savedAt
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderAll();

    // Live refresh if the Reduction Plan is saved again from another open
    // tab (e.g. Reduction Planner open alongside this page). Normal same-tab
    // navigation (sidebar link) already re-reads sessionStorage fresh on load.
    window.addEventListener("storage", (e) => {
      if (e.key === PLAN_KEY) renderAll();
    });
  });
})();
