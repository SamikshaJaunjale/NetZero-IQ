/* ============================================================
   Aurex Net Zero Platform — Sustainability Report Module
   ------------------------------------------------------------
   DATA SOURCES (all sessionStorage — nothing hardcoded, nothing
   entered on this page):
     "nz-company-info"        -> emission-upload.js (company details)
     "nz-emission-data"       -> emission-upload.js (Scope 1/2/3 snapshot)
     "nz-reduction-plan"      -> reduction-planner.js
     "nz-official-target-year"-> net-zero-target.js (via window.NZTarget)
     "nz-offset-selection"    -> offset-projects.js (+ offset-catalog-data.js
                                  for the project details themselves)

   This file only READS those keys and renders them. If the user
   edits emissions, saves a new reduction plan, or changes their
   offset selection, the report picks it up the next time it's
   opened (and live, within this tab, via the "storage" event —
   see the bottom of this file).
   ============================================================ */
(function () {
  "use strict";

  const COMPANY_KEY = "nz-company-info";
  const EMISSION_KEY = "nz-emission-data";
  const PLAN_KEY = "nz-reduction-plan";
  const SELECTION_KEY = "nz-offset-selection";
  const CATALOG = window.NZ_OFFSET_CATALOG || [];

  const COMPANY_LABELS = {
    "company-name": "Company Name",
    "reporting-year": "Reporting Year",
    "reporting-period": "Reporting Period",
    "industry": "Industry",
    "country": "Country",
    "business-unit": "Business Unit"
  };

  function fmt(n) { return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtMoney(n) { return "£" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pct(n) { return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"; }
  function todayString() {
    return new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  /* ============================================================
     1. LOAD EVERYTHING
     ============================================================ */
  function safeParse(key) {
    try { const raw = sessionStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  function loadReportData() {
    const companyRaw = safeParse(COMPANY_KEY);
    const emissionRaw = safeParse(EMISSION_KEY);
    const plan = safeParse(PLAN_KEY);
    const selectionRaw = safeParse(SELECTION_KEY);
    const officialTarget = window.NZTarget ? window.NZTarget.get() : null;

    const categories = emissionRaw && Array.isArray(emissionRaw.categories) ? emissionRaw.categories : [];
    const hasEmissions = categories.some((c) => typeof c.value === "number" && !isNaN(c.value) && c.value > 0);

    const byScope = (n) => categories.filter((c) => c.scope === n && typeof c.value === "number" && c.value > 0);
    const scopeTotal = (n) => byScope(n).reduce((s, c) => s + c.value, 0);
    const scopes = { 1: scopeTotal(1), 2: scopeTotal(2), 3: scopeTotal(3) };
    const total = scopes[1] + scopes[2] + scopes[3];

    const selection = selectionRaw && selectionRaw.selection ? selectionRaw.selection : {};
    const offsetProjects = Object.keys(selection).map((id) => {
      const p = CATALOG.find((c) => c.id === id);
      if (!p) return null;
      const qty = selection[id];
      return Object.assign({}, p, { qty: qty, cost: qty * p.pricePerTonne });
    }).filter(Boolean);
    const totalOffset = offsetProjects.reduce((s, p) => s + p.qty, 0);
    const totalOffsetCost = offsetProjects.reduce((s, p) => s + p.cost, 0);

    const remainingAfterReduction = plan && plan.summary ? plan.summary.totalRemaining : total;
    const netEmissions = Math.max(0, remainingAfterReduction - totalOffset);

    let scenarios = null;
    if (plan && plan.summary && plan.summary.overallAnnualReductionPct > 0) {
      const currentYear = new Date().getFullYear();
      const threshold = 0.02;
      const clamp = (r) => Math.min(0.60, Math.max(0.01, r));
      const yearsFor = (r) => Math.ceil(Math.log(threshold) / Math.log(1 - r));
      const moderateRate = clamp(plan.summary.overallAnnualReductionPct / 100);
      const build = (key, label, mult) => {
        const rate = key === "moderate" ? moderateRate : clamp(moderateRate * mult);
        const years = yearsFor(rate);
        return { key: key, label: label, ratePct: rate * 100, netZeroYear: currentYear + years, years: years };
      };
      scenarios = [
        build("conservative", "Conservative", 0.6),
        build("moderate", "Moderate", 1.0),
        build("aggressive", "Aggressive", 1.5)
      ];
    }

    return {
      hasEmissions: hasEmissions,
      company: companyRaw && companyRaw.company ? companyRaw.company : {},
      categories: categories,
      scopes: scopes,
      total: total,
      plan: plan,
      remainingAfterReduction: remainingAfterReduction,
      scenarios: scenarios,
      officialTarget: officialTarget,
      offsetProjects: offsetProjects,
      totalOffset: totalOffset,
      totalOffsetCost: totalOffsetCost,
      netEmissions: netEmissions
    };
  }

  /* ============================================================
     2. RENDER — COVER + TOC
     ============================================================ */
  function renderCover(data) {
    document.getElementById("rpt-cover-company").textContent = data.company["company-name"] || "NetZero IQ";
    document.getElementById("rpt-cover-year").textContent = data.company["reporting-year"] || "—";
    document.getElementById("rpt-cover-period").textContent = data.company["reporting-period"] || "—";
    document.getElementById("rpt-cover-preparedby").textContent = "Samiksha Jaunjale, ESG Manager";
    document.getElementById("rpt-cover-date").textContent = todayString();
    document.getElementById("rpt-cover-version").textContent = "1.0";
  }

  /* ============================================================
     3. RENDER — EXECUTIVE SUMMARY (rule-based, from live data)
     ============================================================ */
  function largestCategory(categories) {
    const withValues = categories.filter((c) => typeof c.value === "number" && c.value > 0);
    if (!withValues.length) return null;
    return withValues.reduce((max, c) => (c.value > max.value ? c : max), withValues[0]);
  }

  function renderExecSummary(data) {
    const perf = document.getElementById("rpt-exec-performance");
    const rec = document.getElementById("rpt-exec-recommendations");
    perf.innerHTML = "";
    rec.innerHTML = "";

    const addLi = (ul, html) => { const li = document.createElement("li"); li.innerHTML = html; ul.appendChild(li); };

    addLi(perf, "Total location-based emissions are <strong>" + fmt(data.total) + " tCO₂e</strong> across Scope 1, 2 and 3.");
    const top = largestCategory(data.categories);
    if (top) {
      addLi(perf, "The most significant emission source is <strong>" + top.label + "</strong>, accounting for " +
        pct((top.value / data.total) * 100) + " of the total footprint.");
    }
    if (data.plan && data.plan.summary) {
      addLi(perf, "A Reduction Plan is in place targeting a blended <strong>" + pct(data.plan.summary.overallAnnualReductionPct) +
        " annual reduction</strong>, bringing remaining emissions to <strong>" + fmt(data.plan.summary.totalRemaining) + " tCO₂e</strong>.");
    } else {
      addLi(perf, "No Reduction Plan has been saved yet — remaining emissions are shown as the full uploaded total.");
    }
    if (data.officialTarget && data.officialTarget.year) {
      addLi(perf, "Based on the Moderate scenario, the official <strong>Net Zero Target Year is " + data.officialTarget.year + "</strong>.");
    }
    if (data.offsetProjects.length) {
      addLi(perf, data.offsetProjects.length + " offset project(s) selected, securing <strong>" + fmt(data.totalOffset) +
        " tCO₂e</strong> of offset for a net position of <strong>" + fmt(data.netEmissions) + " tCO₂e</strong>.");
    }

    if (top) addLi(rec, "Prioritise reduction initiatives on <strong>" + top.label + "</strong>, the largest single contributor.");
    if (data.scopes[3] > data.scopes[1] + data.scopes[2]) {
      addLi(rec, "Scope 3 represents the majority of the footprint — engage suppliers and travel policy owners to reduce value-chain emissions.");
    }
    const categoriesWithoutTarget = data.plan
      ? data.categories.filter((c) => typeof c.value === "number" && c.value > 0 && !(data.plan.percentages && data.plan.percentages[c.id] > 0)).length
      : data.categories.filter((c) => typeof c.value === "number" && c.value > 0).length;
    if (categoriesWithoutTarget > 0) {
      addLi(rec, categoriesWithoutTarget + " emission categor" + (categoriesWithoutTarget === 1 ? "y has" : "ies have") +
        " no reduction target set yet — review these in the Reduction Planner.");
    }
    if (data.remainingAfterReduction > 0 && data.totalOffset < data.remainingAfterReduction) {
      const gap = data.remainingAfterReduction - data.totalOffset;
      addLi(rec, "An offset gap of <strong>" + fmt(gap) + " tCO₂e</strong> remains — select additional projects in Offset Projects to reach full neutrality for this period.");
    } else if (data.remainingAfterReduction > 0 && data.totalOffset >= data.remainingAfterReduction) {
      addLi(rec, "Selected offset projects fully cover remaining emissions for this reporting period.");
    }
    if (!rec.children.length) addLi(rec, "Continue monitoring emissions data quality and expand assessment boundary where feasible.");
  }

  /* ============================================================
     4. RENDER — COMPANY INFO
     ============================================================ */
  function renderCompanyInfo(data) {
    const grid = document.getElementById("rpt-company-fields");
    grid.innerHTML = "";
    Object.keys(COMPANY_LABELS).forEach((key) => {
      const div = document.createElement("div");
      div.className = "f";
      div.innerHTML = '<div class="l">' + COMPANY_LABELS[key] + '</div><div class="v">' + (data.company[key] || "—") + "</div>";
      grid.appendChild(div);
    });
  }

  /* ============================================================
     5. RENDER — EMISSION INVENTORY TABLES
     ============================================================ */
  function renderScopeTable(elId, categories, scopeLabel, scopeTotalValue) {
    const table = document.getElementById(elId);
    let rows = categories.map((c) =>
      "<tr><td>" + c.label + "</td><td style=\"text-align:right; font-family:var(--font-mono);\">" + fmt(c.value) + " t</td></tr>"
    ).join("");
    if (!categories.length) {
      rows = '<tr><td colspan="2" style="color:var(--ink-soft); font-style:italic;">No emissions recorded for this scope.</td></tr>';
    }
    table.innerHTML =
      "<thead><tr><th>Category</th><th style=\"text-align:right;\">Emission (tCO₂e)</th></tr></thead>" +
      "<tbody>" + rows +
      '<tr class="nz-report-total-row"><td>' + scopeLabel + ' Total</td><td style="text-align:right; font-family:var(--font-mono);">' + fmt(scopeTotalValue) + " t</td></tr>" +
      "</tbody>";
  }

  function renderInventory(data) {
    const byScope = (n) => data.categories.filter((c) => c.scope === n && typeof c.value === "number" && c.value > 0);
    renderScopeTable("rpt-table-scope1", byScope(1), "Scope 1", data.scopes[1]);
    renderScopeTable("rpt-table-scope2", byScope(2), "Scope 2", data.scopes[2]);
    renderScopeTable("rpt-table-scope3", byScope(3), "Scope 3", data.scopes[3]);
    document.getElementById("rpt-grandtotal-row").innerHTML =
      "Grand Total Emissions: " + fmt(data.total) + " tCO₂e";
  }

  /* ============================================================
     6. RENDER — CHARTS (dynamic SVG/CSS, same approach as Dashboard)
     ============================================================ */
  function renderCharts(data) {
    const s1pct = data.total > 0 ? (data.scopes[1] / data.total) * 100 : 0;
    const s2pct = data.total > 0 ? (data.scopes[2] / data.total) * 100 : 0;
    const s3pct = data.total > 0 ? (data.scopes[3] / data.total) * 100 : 0;
    const deg1 = s1pct * 3.6, deg2 = s2pct * 3.6;

    document.getElementById("rpt-donut-scope").innerHTML =
      '<div style="display:flex; align-items:center; gap:22px; margin-top:10px;">' +
        '<div style="width:130px; height:130px; border-radius:50%; background:conic-gradient(#5A8FEE 0deg ' + deg1 + 'deg, #2E6FE0 ' + deg1 + 'deg ' + (deg1 + deg2) + 'deg, #10573F ' + (deg1 + deg2) + 'deg 360deg);"></div>' +
        '<div style="font-size:12px; color:var(--ink-soft); line-height:2;">' +
          '<div><i class="fa-solid fa-circle" style="color:#5A8FEE; font-size:8px;"></i> Scope 1 — ' + pct(s1pct) + "</div>" +
          '<div><i class="fa-solid fa-circle" style="color:#2E6FE0; font-size:8px;"></i> Scope 2 — ' + pct(s2pct) + "</div>" +
          '<div><i class="fa-solid fa-circle" style="color:#10573F; font-size:8px;"></i> Scope 3 — ' + pct(s3pct) + "</div>" +
        "</div>" +
      "</div>";

    const top5 = data.categories
      .filter((c) => typeof c.value === "number" && c.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    const maxVal = top5.length ? top5[0].value : 1;
    document.getElementById("rpt-bars-category").innerHTML = top5.map((c) =>
      '<div class="nz-hbar-row"><span class="lbl">' + c.label + '</span>' +
      '<div class="nz-hbar-track"><div class="nz-hbar-fill" style="width:' + ((c.value / maxVal) * 100) + '%; background:linear-gradient(90deg,#10573F,#1FA97C);"></div></div>' +
      '<span class="val">' + fmt(c.value) + " t</span></div>"
    ).join("") || '<p class="nz-report-p">No category data available.</p>';
  }

  /* ============================================================
     7. RENDER — REDUCTION PLANNER SECTION
     ============================================================ */
  function renderReductionSection(data) {
    const intro = document.getElementById("rpt-reduction-intro");
    const table = document.getElementById("rpt-table-reduction");

    if (!data.plan || !data.plan.percentages) {
      intro.textContent = "No Reduction Plan has been saved yet. Category-level annual reduction targets will appear here once one is completed in the Reduction Planner module.";
      table.innerHTML = "";
      return;
    }

    intro.innerHTML = "The company has set annual reduction targets across " +
      Object.keys(data.plan.percentages).filter((k) => data.plan.percentages[k] > 0).length +
      " categories, for a blended annual reduction rate of <strong>" + pct(data.plan.summary.overallAnnualReductionPct) +
      "</strong>. Applying these targets brings emissions from <strong>" + fmt(data.plan.summary.totalCurrent) +
      " tCO₂e</strong> down to <strong>" + fmt(data.plan.summary.totalRemaining) + " tCO₂e</strong>.";

    const rows = data.categories
      .filter((c) => typeof c.value === "number" && c.value > 0)
      .map((c) => {
        const p = data.plan.percentages[c.id] || 0;
        const reduction = c.value * (p / 100);
        const remaining = c.value - reduction;
        return "<tr><td>" + c.label + "</td><td style=\"text-align:right;\">" + fmt(c.value) + " t</td>" +
          "<td style=\"text-align:right;\">" + pct(p) + "</td>" +
          "<td style=\"text-align:right;\">" + fmt(reduction) + " t</td>" +
          "<td style=\"text-align:right;\">" + fmt(remaining) + " t</td></tr>";
      }).join("");

    table.innerHTML =
      "<thead><tr><th>Category</th><th style=\"text-align:right;\">Current Emission</th><th style=\"text-align:right;\">Annual Target</th>" +
      "<th style=\"text-align:right;\">Projected Reduction</th><th style=\"text-align:right;\">Remaining</th></tr></thead><tbody>" + rows + "</tbody>";
  }

  /* ============================================================
     8. RENDER — NET ZERO SCENARIOS SECTION
     ============================================================ */
  function renderScenariosSection(data) {
    const table = document.getElementById("rpt-table-scenarios");
    if (!data.scenarios) {
      table.innerHTML = "<tbody><tr><td style=\"color:var(--ink-soft); font-style:italic; padding:14px;\">No scenarios have been generated yet — save a Reduction Plan with at least one category target above 0% first.</td></tr></tbody>";
      return;
    }
    const rows = data.scenarios.map((s) => {
      const rowClass = s.key === "moderate" ? ' class="nz-report-highlight-row"' : "";
      const label = s.key === "moderate" ? s.label + " (Official Pathway)" : s.label;
      return "<tr" + rowClass + "><td>" + label + "</td><td style=\"text-align:right;\">" + pct(s.ratePct) +
        "/yr</td><td style=\"text-align:right;\">" + s.netZeroYear + "</td><td style=\"text-align:right;\">" + s.years + " years</td></tr>";
    }).join("");
    table.innerHTML =
      "<thead><tr><th>Scenario</th><th style=\"text-align:right;\">Annual Reduction Rate</th>" +
      "<th style=\"text-align:right;\">Net Zero Year</th><th style=\"text-align:right;\">Years from Today</th></tr></thead><tbody>" + rows + "</tbody>";
  }

  /* ============================================================
     9. RENDER — OFFSET PROJECTS SECTION
     ============================================================ */
  function renderOffsetsSection(data) {
    const table = document.getElementById("rpt-table-offsets");
    if (!data.offsetProjects.length) {
      table.innerHTML = "<tbody><tr><td style=\"color:var(--ink-soft); font-style:italic; padding:14px;\">No offset projects have been selected yet.</td></tr></tbody>";
      document.getElementById("rpt-offset-summary").textContent = "Total Offset: 0.00 tCO₂e";
      return;
    }
    const rows = data.offsetProjects.map((p) =>
      "<tr><td>" + p.name + " <span style=\"color:var(--ink-soft); font-size:11px;\">(" + p.id + ")</span></td>" +
      "<td>" + p.country + " / " + p.region + "</td><td>" + p.standard + "</td><td>" + p.type + "</td>" +
      "<td style=\"text-align:right;\">" + p.vintage + "</td>" +
      "<td style=\"text-align:right;\">" + fmt(p.qty) + " t</td>" +
      "<td style=\"text-align:right;\">" + fmtMoney(p.cost) + "</td>" +
      "<td>" + p.verification + "</td></tr>"
    ).join("");
    table.innerHTML =
      "<thead><tr><th>Project</th><th>Country / Region</th><th>Standard</th><th>Type</th>" +
      "<th style=\"text-align:right;\">Vintage</th><th style=\"text-align:right;\">Credits Purchased</th>" +
      "<th style=\"text-align:right;\">Cost</th><th>Verification</th></tr></thead><tbody>" + rows + "</tbody>";

    const carbonNeutral = data.netEmissions <= 0;
    document.getElementById("rpt-offset-summary").innerHTML =
      "Total Offset: " + fmt(data.totalOffset) + " tCO₂e · Total Investment: " + fmtMoney(data.totalOffsetCost) +
      " · Net Remaining Emissions: " + fmt(data.netEmissions) + " tCO₂e · Status: " +
      (carbonNeutral ? "Carbon Neutral Achieved" : "Partially Offset");
  }

  /* ============================================================
     10b. RENDER — NET ZERO ROADMAP (year-by-year, from Moderate scenario)
     ============================================================ */
  function renderRoadmap(data) {
    const intro = document.getElementById("rpt-roadmap-intro");
    const table = document.getElementById("rpt-table-roadmap");
    const footnote = document.getElementById("rpt-roadmap-footnote");

    if (!data.scenarios || !data.plan) {
      intro.textContent = "A roadmap will appear here once a Reduction Plan has been saved and Net Zero Scenarios have been generated.";
      table.innerHTML = "";
      footnote.textContent = "";
      return;
    }

    const moderate = data.scenarios.find((s) => s.key === "moderate");
    const currentYear = new Date().getFullYear();
    const baseline = data.plan.summary.totalCurrent;
    const rate = moderate.ratePct / 100;
    const targetYear = moderate.netZeroYear;
    const span = Math.min(targetYear - currentYear, 40);

    intro.innerHTML = "Modelled from " + currentYear + " to the Moderate scenario's Net Zero Year of <strong>" + targetYear +
      "</strong>, applying the blended annual reduction rate of <strong>" + pct(moderate.ratePct) + "</strong> each year.";

    let prevEmission = baseline;
    const rows = [];
    for (let i = 0; i <= span; i++) {
      const yr = currentYear + i;
      const emission = baseline * Math.pow(1 - rate, i);
      const reduction = prevEmission - emission;
      const offsetRequired = Math.max(0, emission - data.totalOffset);
      let milestone = "Projected";
      if (i === 0) milestone = "Baseline Year";
      else if (yr === targetYear) milestone = "Net Zero Target";
      const status = i === 0 ? "Actual" : (yr === targetYear ? "Target" : "Modelled");
      rows.push("<tr" + (yr === targetYear ? ' class="nz-report-highlight-row"' : "") + "><td>" + yr + "</td>" +
        "<td style=\"text-align:right;\">" + fmt(emission) + " t</td>" +
        "<td style=\"text-align:right;\">" + fmt(i === 0 ? 0 : reduction) + " t</td>" +
        "<td style=\"text-align:right;\">" + fmt(offsetRequired) + " t</td>" +
        "<td>" + milestone + "</td><td>" + status + "</td></tr>");
      prevEmission = emission;
    }
    table.innerHTML =
      "<thead><tr><th>Year</th><th style=\"text-align:right;\">Emission</th><th style=\"text-align:right;\">Reduction</th>" +
      "<th style=\"text-align:right;\">Offset Required</th><th>Milestone</th><th>Status</th></tr></thead><tbody>" + rows.join("") + "</tbody>";
    footnote.textContent = targetYear - currentYear > 40
      ? "Roadmap truncated to 40 years for readability; full trajectory continues to " + targetYear + "."
      : "Offset Required assumes the currently selected offset portfolio (" + fmt(data.totalOffset) + " tCO₂e/yr) remains constant; review annually as the portfolio evolves.";
  }

  /* ============================================================
     10c. RENDER — SUSTAINABLE DEVELOPMENT GOALS (from selected projects)
     ============================================================ */
  function renderSdgSection(data) {
    const intro = document.getElementById("rpt-sdg-intro");
    const container = document.getElementById("rpt-sdg-cards");
    const SDG_REF = window.NZ_SDG_REFERENCE || {};

    if (!data.offsetProjects.length) {
      intro.textContent = "No offset projects have been selected yet, so no Sustainable Development Goal contributions are recorded for this reporting period.";
      container.innerHTML = "";
      return;
    }

    const sdgMap = {};
    data.offsetProjects.forEach((p) => {
      p.sdgs.forEach((id) => {
        if (!sdgMap[id]) sdgMap[id] = { countries: new Set(), projects: [] };
        sdgMap[id].countries.add(p.country);
        sdgMap[id].projects.push(p);
      });
    });
    const sdgIds = Object.keys(sdgMap).map(Number).sort((a, b) => a - b);

    intro.innerHTML = "The " + data.offsetProjects.length + " selected offset project(s) collectively support <strong>" +
      sdgIds.length + " UN Sustainable Development Goal(s)</strong>, summarised below with the countries and projects contributing to each.";

    container.innerHTML = sdgIds.map((id) => {
      const ref = SDG_REF[id] || { name: "SDG " + id, color: "#666" };
      const entry = sdgMap[id];
      const projectNames = entry.projects.map((p) => p.name).join(", ");
      const countries = Array.from(entry.countries).join(", ");
      return '<div class="nz-sdg-detail-card">' +
        '<div class="nz-sdg-detail-badge" style="background:' + ref.color + ';"><div class="num">' + id + '</div><div class="lbl">SDG</div></div>' +
        '<div class="nz-sdg-detail-body">' +
          '<div class="name">' + ref.name + '</div>' +
          '<div class="meta"><strong>Contributing projects:</strong> ' + projectNames + '<br>' +
          '<strong>Countries:</strong> ' + countries + '</div>' +
        '</div>' +
      '</div>';
    }).join("");
  }

  /* ============================================================
     10d. RENDER — FINANCIAL SUMMARY
     ============================================================ */
  function renderFinancialSummary(data) {
    const grid = document.getElementById("rpt-financial-kpis");
    const table = document.getElementById("rpt-table-financial");
    const kpi = (label, value, icon, color) =>
      '<div class="nz-card nz-stat-card"><div class="nz-stat-top"><span class="nz-stat-label">' + label +
      '</span><span class="nz-stat-icon" style="background:' + color + '15; color:' + color + ';"><i class="fa-solid ' + icon + '"></i></span></div>' +
      '<div class="nz-stat-value" style="font-size:16px;">' + value + "</div></div>";

    const avgPrice = data.totalOffset > 0 ? data.totalOffsetCost / data.totalOffset : 0;

    grid.innerHTML =
      kpi("Required Offset Credits", fmt(data.remainingAfterReduction) + " t", "fa-bullseye", "#0A3B2C") +
      kpi("Purchased Credits", fmt(data.totalOffset) + " t", "fa-seedling", "#1FA97C") +
      kpi("Avg. Price per Tonne", fmtMoney(avgPrice), "fa-tag", "#2E6FE0") +
      kpi("Total Investment (GBP)", fmtMoney(data.totalOffsetCost), "fa-sterling-sign", "#10573F");

    if (!data.offsetProjects.length) {
      table.innerHTML = "<tbody><tr><td style=\"color:var(--ink-soft); font-style:italic; padding:14px;\">No offset purchases recorded for this reporting period.</td></tr></tbody>";
      return;
    }
    const rows = data.offsetProjects.map((p) =>
      "<tr><td>" + p.name + "</td><td style=\"text-align:right;\">" + fmt(p.qty) + " t</td>" +
      "<td style=\"text-align:right;\">" + fmtMoney(p.pricePerTonne) + "</td>" +
      "<td style=\"text-align:right;\">" + fmtMoney(p.cost) + "</td></tr>"
    ).join("");
    table.innerHTML =
      "<thead><tr><th>Project</th><th style=\"text-align:right;\">Credits</th><th style=\"text-align:right;\">Price/Tonne</th>" +
      "<th style=\"text-align:right;\">Cost</th></tr></thead><tbody>" + rows +
      '<tr class="nz-report-total-row"><td>Total Investment</td><td></td><td></td><td style=\"text-align:right;\">' + fmtMoney(data.totalOffsetCost) + "</td></tr></tbody>";
  }

  /* ============================================================
     10e. RENDER — DASHBOARD SUMMARY (mirrors the Dashboard KPI cards)
     ============================================================ */
  function renderDashboardSummary(data) {
    const grid = document.getElementById("rpt-dashboard-kpis");
    const kpi = (label, value, icon, color) =>
      '<div class="nz-card nz-stat-card"><div class="nz-stat-top"><span class="nz-stat-label">' + label +
      '</span><span class="nz-stat-icon" style="background:' + color + '15; color:' + color + ';"><i class="fa-solid ' + icon + '"></i></span></div>' +
      '<div class="nz-stat-value" style="font-size:16px;">' + value + "</div></div>";

    const overallReductionPct = data.plan ? data.plan.summary.overallAnnualReductionPct : 0;
    const offsetProgressPct = data.remainingAfterReduction > 0 ? Math.min(100, (data.totalOffset / data.remainingAfterReduction) * 100) : 0;
    const status = data.netEmissions <= 0 ? "Carbon Neutral" : (data.plan ? "Reduction Plan Active" : "Baseline Recorded");

    grid.innerHTML =
      kpi("Total Emissions", fmt(data.total) + " t", "fa-cloud", "#10573F") +
      kpi("Scope 1", fmt(data.scopes[1]) + " t", "fa-fire", "#3b6fd6") +
      kpi("Scope 2", fmt(data.scopes[2]) + " t", "fa-bolt", "#2E6FE0") +
      kpi("Scope 3", fmt(data.scopes[3]) + " t", "fa-truck-fast", "#10573F") +
      kpi("Annual Reduction %", pct(overallReductionPct), "fa-arrow-trend-down", "#1FA97C") +
      kpi("Net Zero Year", data.officialTarget && data.officialTarget.year ? String(data.officialTarget.year) : "Pending", "fa-bullseye", "#0A3B2C") +
      kpi("Offset Progress", pct(offsetProgressPct), "fa-seedling", "#2E6FE0") +
      kpi("Status", status, "fa-circle-check", "#0A3B2C");
  }

  /* ============================================================
     10f. RENDER — AI RECOMMENDATIONS (rule-based, from live category data)
     ============================================================ */
  function renderAIRecommendations(data) {
    const table = document.getElementById("rpt-table-ai");
    const withValues = data.categories.filter((c) => typeof c.value === "number" && c.value > 0);
    if (!withValues.length) { table.innerHTML = ""; return; }

    const avgPrice = data.totalOffset > 0
      ? data.totalOffsetCost / data.totalOffset
      : (CATALOG.length ? CATALOG.reduce((s, p) => s + p.pricePerTonne, 0) / CATALOG.length : 10);

    const RULES = [
      { match: /vehicle|fleet|petrol|diesel|fuel/i, action: "Transition to an EV fleet", potential: 0.30, difficulty: "Medium", timeline: "12–24 months" },
      { match: /electricity|power|steam|heating|cooling/i, action: "Switch to renewable electricity / on-site solar", potential: 0.40, difficulty: "Medium", timeline: "6–18 months" },
      { match: /flight|air travel|business travel/i, action: "Reduce non-essential business flights", potential: 0.25, difficulty: "Low", timeline: "Immediate" },
      { match: /waste/i, action: "Expand waste recycling & diversion programmes", potential: 0.35, difficulty: "Low", timeline: "3–6 months" },
      { match: /commut/i, action: "Promote remote work & EV commuter incentives", potential: 0.20, difficulty: "Low", timeline: "3–9 months" },
      { match: /freight|logistics|transport/i, action: "Optimise freight routing & consolidate shipments", potential: 0.20, difficulty: "Medium", timeline: "6–12 months" },
      { match: /refrigerant/i, action: "Service and upgrade refrigerant systems to low-GWP alternatives", potential: 0.50, difficulty: "Medium", timeline: "6–12 months" },
      { match: /generator|process/i, action: "Improve energy efficiency of on-site generation & processes", potential: 0.15, difficulty: "Medium", timeline: "9–18 months" }
    ];

    const recs = [];
    withValues.forEach((c) => {
      const rule = RULES.find((r) => r.match.test(c.label));
      if (!rule) return;
      const contribution = c.value / data.total;
      const expectedReduction = c.value * rule.potential;
      const savings = expectedReduction * avgPrice;
      const priority = contribution > 0.2 ? "High" : contribution > 0.08 ? "Medium" : "Low";
      recs.push({ category: c.label, action: rule.action, priority: priority, expectedReduction: expectedReduction, savings: savings, difficulty: rule.difficulty, timeline: rule.timeline });
    });
    recs.sort((a, b) => b.expectedReduction - a.expectedReduction);

    if (!recs.length) { table.innerHTML = "<tbody><tr><td style=\"color:var(--ink-soft); font-style:italic; padding:14px;\">No specific recommendations matched the current category set.</td></tr></tbody>"; return; }

    const rows = recs.slice(0, 8).map((r) =>
      "<tr><td>" + r.action + " <span style=\"color:var(--ink-soft); font-size:11px;\">(" + r.category + ")</span></td>" +
      "<td>" + r.priority + "</td>" +
      "<td style=\"text-align:right;\">" + fmt(r.expectedReduction) + " t</td>" +
      "<td style=\"text-align:right;\">" + fmtMoney(r.savings) + "</td>" +
      "<td>" + r.difficulty + "</td><td>" + r.timeline + "</td></tr>"
    ).join("");
    table.innerHTML =
      "<thead><tr><th>Recommendation</th><th>Priority</th><th style=\"text-align:right;\">Expected CO₂ Reduction</th>" +
      "<th style=\"text-align:right;\">Est. Avoided Offset Cost</th><th>Difficulty</th><th>Timeline</th></tr></thead><tbody>" + rows + "</tbody>";
  }

  /* ============================================================
     10g. RENDER — CONCLUSION (narrative, rule-based from live data)
     ============================================================ */
  function renderConclusion(data) {
    const el = document.getElementById("rpt-conclusion-text");
    const parts = [];
    parts.push((data.company["company-name"] || "The organisation") + "'s current carbon position stands at <strong>" +
      fmt(data.total) + " tCO₂e</strong> across Scope 1, 2 and 3 for " + (data.company["reporting-period"] || "the current reporting period") + ".");

    if (data.plan) {
      parts.push("A Reduction Plan is in place targeting a blended <strong>" + pct(data.plan.summary.overallAnnualReductionPct) +
        "</strong> annual reduction, projected to bring emissions to <strong>" + fmt(data.plan.summary.totalRemaining) + " tCO₂e</strong>.");
    } else {
      parts.push("No Reduction Plan has been saved yet — completing one is the single highest-leverage next step toward Net Zero readiness.");
    }

    if (data.officialTarget && data.officialTarget.year) {
      parts.push("Under the Moderate scenario, full Net Zero is projected by <strong>" + data.officialTarget.year + "</strong>.");
    }

    if (data.offsetProjects.length) {
      const neutral = data.netEmissions <= 0;
      parts.push(neutral
        ? "Selected offset projects fully cover remaining emissions for this period, achieving <strong>Carbon Neutral</strong> status."
        : "Selected offset projects cover <strong>" + fmt(data.totalOffset) + " tCO₂e</strong>, leaving a net position of <strong>" + fmt(data.netEmissions) + " tCO₂e</strong> still to offset or reduce.");
    } else {
      parts.push("No offset projects have been selected yet to address remaining emissions after reduction.");
    }

    parts.push("Overall, " + (data.company["company-name"] || "the organisation") + " has established the data foundation — emissions inventory" +
      (data.plan ? ", reduction targets" : "") + (data.scenarios ? ", Net Zero scenarios" : "") + (data.offsetProjects.length ? " and an offset portfolio" : "") +
      " — required for credible, auditable Net Zero reporting, with the priority actions in Section 12 identifying where future focus will have the greatest impact.");

    el.innerHTML = parts.join(" ");
  }

  /* ============================================================
     10h. RENDER — APPENDIX (references + glossary)
     ============================================================ */
  function renderAppendix(data) {
    const refs = document.getElementById("rpt-appendix-refs");
    refs.innerHTML = "";
    const addLi = (html) => { const li = document.createElement("li"); li.innerHTML = html; refs.appendChild(li); };
    addLi(data.categories.filter((c) => typeof c.value === "number" && c.value > 0).length + " uploaded activity categories — see Section 3, Emission Inventory.");
    addLi((data.plan ? Object.keys(data.plan.percentages).filter((k) => data.plan.percentages[k] > 0).length : 0) + " categories with saved annual reduction targets — see Section 5, Reduction Planner.");
    addLi(data.offsetProjects.length + " selected offset project(s) — see Section 8, Offset Projects.");
    if (data.offsetProjects.length) {
      const registries = Array.from(new Set(data.offsetProjects.map((p) => p.standard))).join(", ");
      addLi("Project references verifiable via issuing registries: " + registries + ".");
    }

    const glossary = {
      "tCO₂e": "Tonnes of carbon dioxide equivalent — the standard unit for comparing greenhouse gases.",
      "GHG": "Greenhouse Gas.",
      "Scope 1 / 2 / 3": "GHG Protocol categories for direct, purchased-energy, and value-chain emissions respectively.",
      "SDG": "United Nations Sustainable Development Goal.",
      "VCS": "Verified Carbon Standard (administered by Verra).",
      "GS": "Gold Standard for the Global Goals.",
      "CAR / ACR": "Climate Action Reserve / American Carbon Registry.",
      "ICVCM CCP": "Integrity Council for the Voluntary Carbon Market's Core Carbon Principles.",
      "Vintage Year": "The year in which a carbon credit's underlying emission reduction occurred.",
      "Net Zero": "A state where any remaining emissions are balanced by an equivalent amount of removals or offsets."
    };
    document.getElementById("rpt-glossary").innerHTML = Object.keys(glossary).map((term) =>
      '<div class="f"><div class="l">' + term + '</div><div class="v" style="font-weight:400; font-size:11.5px;">' + glossary[term] + '</div></div>'
    ).join("");
  }

  /* ============================================================
     11. FULL RENDER + EMPTY STATE
     ============================================================ */
  let lastData = null;
  let reportGenerated = false;

  function setActionButtonsState(enabled) {
    const previewBtn = document.getElementById("btn-preview-report");
    const downloadBtn = document.getElementById("btn-download-report");
    previewBtn.disabled = !enabled;
    downloadBtn.disabled = !enabled;
  }

  function renderAll() {
    const data = loadReportData();
    lastData = data;
    const emptyState = document.getElementById("rpt-empty-state");
    const mainContent = document.getElementById("rpt-main-content");

    if (!data.hasEmissions) {
      emptyState.style.display = "block";
      mainContent.style.display = "none";
      reportGenerated = false;
      setActionButtonsState(false);
      return;
    }
    emptyState.style.display = "none";
    mainContent.style.display = "block";

    renderCover(data);
    renderExecSummary(data);
    renderCompanyInfo(data);
    renderInventory(data);
    renderCharts(data);
    renderReductionSection(data);
    renderScenariosSection(data);
    renderRoadmap(data);
    renderOffsetsSection(data);
    renderSdgSection(data);
    renderFinancialSummary(data);
    renderDashboardSummary(data);
    renderAIRecommendations(data);
    renderConclusion(data);
    renderAppendix(data);

    reportGenerated = true;
    setActionButtonsState(true);
  }

  /* ============================================================
     12. PDF GENERATION  (screenshot-based, pixel-perfect)
     ------------------------------------------------------------
     We clone the report DOM into a fixed 900 px off-screen
     container, render it with html2canvas at 2x scale, then slice
     the resulting image into A4 pages and drop each slice into
     the PDF. This preserves web fonts, gradients, tables and
     layout exactly as they appear on screen.
     ============================================================ */
  function buildPdf() {
    const data = lastData;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;
    const REPORT_VERSION = "1.0";
    const companyName = data.company["company-name"] || "Aurex Industries";
    const reportingYear = data.company["reporting-year"] || "";
    const issueDate = todayString();

    const btn = document.getElementById("btn-download-report");
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating PDF…';

    setTimeout(() => {
      (async () => {
        try {
          const sourceEl = document.getElementById("rpt-document");

          // Clone into a fixed-width off-screen box so the PDF is
          // identical no matter the browser viewport size.
          const cloneWrapper = document.createElement("div");
          cloneWrapper.style.position = "absolute";
          cloneWrapper.style.left = "-9999px";
          cloneWrapper.style.top = "0";
          cloneWrapper.style.width = "900px";
          cloneWrapper.style.background = "#f4f6f8";
          document.body.appendChild(cloneWrapper);

          const clone = sourceEl.cloneNode(true);
          clone.style.display = "block";
          clone.style.margin = "0 auto";
          clone.style.maxWidth = "900px";
          cloneWrapper.appendChild(clone);

          // Brief pause for fonts/layout to settle on the clone
          await new Promise((r) => setTimeout(r, 200));

          const canvas = await html2canvas(clone, {
            scale: 2,
            useCORS: true,
            backgroundColor: "#f4f6f8",
            logging: false,
            width: 900,
            windowWidth: 900
          });

          document.body.removeChild(cloneWrapper);

          const imgWidth = canvas.width;
          const imgHeight = canvas.height;

          // Scale so the full width fits in the PDF usable area
          const drawWidth = usableWidth;
          const drawHeight = drawWidth * (imgHeight / imgWidth);

          // How many image-pixels fit in one page of usable height?
          const pxPerPt = imgWidth / drawWidth;
          const sliceHeightPx = usableHeight * pxPerPt;

          let pageIndex = 0;
          for (let y = 0; y < imgHeight; y += sliceHeightPx) {
            const sliceH = Math.min(sliceHeightPx, imgHeight - y);

            // Extract just this vertical slice into its own canvas
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = imgWidth;
            tempCanvas.height = sliceH;
            const tCtx = tempCanvas.getContext("2d");
            tCtx.drawImage(canvas, 0, -y);

            const sliceDataUrl = tempCanvas.toDataURL("image/png");

            if (pageIndex > 0) {
              doc.addPage();
            }

            // Draw the slice, preserving aspect ratio
            const sliceDrawHeight = drawWidth * (sliceH / imgWidth);
            doc.addImage(sliceDataUrl, "PNG", margin, margin, drawWidth, sliceDrawHeight);

            // Header
            doc.setFontSize(8.5);
            doc.setTextColor(120, 120, 120);
            doc.setFont("helvetica", "normal");
            doc.text(companyName + "  ·  " + reportingYear, margin, 24);
            doc.text("Carbon Footprint & Net Zero Report", pageWidth - margin, 24, { align: "right" });
            doc.setDrawColor(210, 210, 210);
            doc.line(margin, 30, pageWidth - margin, 30);

            // Footer
            const footerY = pageHeight - 24;
            doc.line(margin, footerY - 8, pageWidth - margin, footerY - 8);
            doc.text("Issue Date: " + issueDate + "  ·  v" + REPORT_VERSION + "  ·  Confidential", margin, footerY);
            doc.text("Page " + (pageIndex + 1), pageWidth - margin, footerY, { align: "right" });

            pageIndex++;
          }

          // CONFIDENTIAL watermark on every page
          const totalPages = doc.internal.getNumberOfPages();
          for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.saveGraphicsState();
            doc.setGState(new doc.GState({ opacity: 0.06 }));
            doc.setFontSize(60);
            doc.setTextColor(10, 59, 44);
            doc.setFont("helvetica", "bold");
            doc.text("CONFIDENTIAL", pageWidth / 2, pageHeight / 2, { align: "center", angle: 40 });
            doc.restoreGraphicsState();
          }

          const filename = (companyName || "Aurex-Industries").replace(/\s+/g, "-") +
            "-Carbon-Footprint-Net-Zero-Report-" +
            (reportingYear || "").replace(/\s+/g, "") + ".pdf";
          doc.save(filename);
        } catch (err) {
          console.error("PDF generation failed:", err);
          alert("Something went wrong generating the PDF. Please try again.");
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      })();
    }, 50);
  }

  function bindDownload() {
    const btn = document.getElementById("btn-download-report");
    btn.addEventListener("click", () => {
      if (!lastData || !lastData.hasEmissions || !reportGenerated) return;
      buildPdf();
    });
  }

  function bindGenerate() {
    document.getElementById("btn-generate-report").addEventListener("click", () => {
      renderAll();
      if (lastData && lastData.hasEmissions) {
        alert_or_toast_ok();
      }
    });
  }

  function alert_or_toast_ok() {
    const btn = document.getElementById("btn-generate-report");
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Generated';
    setTimeout(() => { btn.innerHTML = original; }, 1400);
  }

  function bindPreview() {
    document.getElementById("btn-preview-report").addEventListener("click", () => {
      if (!reportGenerated) return;
      const doc2 = document.getElementById("rpt-document");
      doc2.scrollIntoView({ behavior: "smooth", block: "start" });
      doc2.style.transition = "box-shadow .3s ease";
      doc2.style.boxShadow = "0 0 0 3px rgba(46,111,224,0.35)";
      setTimeout(() => { doc2.style.boxShadow = ""; }, 900);
    });
  }

  function bindTocLinks() {
    const items = document.querySelectorAll("#rpt-toc-list li[data-target]");
    items.forEach((li) => {
      li.addEventListener("click", () => {
        const target = document.getElementById(li.getAttribute("data-target"));
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  /* ============================================================
     13. INIT + LIVE SYNC
     ============================================================ */
  document.addEventListener("DOMContentLoaded", () => {
    try {
      renderAll();
      bindGenerate();
      bindPreview();
      bindDownload();
      bindTocLinks();
    } catch (err) {
      console.error("Reports failed to initialise:", err);
    }

    window.addEventListener("storage", (e) => {
      if ([COMPANY_KEY, EMISSION_KEY, PLAN_KEY, SELECTION_KEY, "nz-official-target-year"].includes(e.key)) {
        renderAll();
      }
    });
  });
})();
