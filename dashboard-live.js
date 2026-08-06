/* ============================================================
   Aurex Net Zero Platform — Dashboard Live Data
   ------------------------------------------------------------
   This dashboard shows ONLY live, session-derived data. Nothing
   here is hardcoded — every figure is read straight from the
   sessionStorage keys the other modules already write:

     nz-emission-data     -> emission-upload.js   (Scope 1/2/3 totals)
     nz-reduction-plan     -> reduction-planner.js  (saved reduction targets)
     nz-offset-selection   -> offset-projects.js    (selected offset projects)

   If no emissions have been uploaded yet, the whole dashboard
   collapses to a single empty state — no fake numbers, no
   placeholder charts.
   ============================================================ */
(function () {
  "use strict";

  const EMISSION_KEY = "nz-emission-data";
  const PLAN_KEY = "nz-reduction-plan";
  const SELECTION_KEY = "nz-offset-selection";
  const CATALOG = window.NZ_OFFSET_CATALOG || [];

  function fmt(n) {
    return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function fmt2(n) {
    return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function readJson(key) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  function setHtml(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
  }
  function scopeTotal(categories, scopeNum) {
    return categories
      .filter((c) => c.scope === scopeNum && typeof c.value === "number" && !isNaN(c.value))
      .reduce((sum, c) => sum + c.value, 0);
  }

  /* ============================================================
     1. LIVE EMISSIONS — KPI cards + Scope Distribution pie chart
     ============================================================ */
  function renderEmissions() {
    const snapshot = readJson(EMISSION_KEY);
    const categories = snapshot && Array.isArray(snapshot.categories) ? snapshot.categories : [];
    const hasData = categories.some((c) => typeof c.value === "number" && !isNaN(c.value) && c.value > 0);

    if (!hasData) return false;

    const s1 = scopeTotal(categories, 1);
    const s2 = scopeTotal(categories, 2);
    const s3 = scopeTotal(categories, 3);
    const total = s1 + s2 + s3;
    const pct1 = total > 0 ? (s1 / total) * 100 : 0;
    const pct2 = total > 0 ? (s2 / total) * 100 : 0;
    const pct3 = total > 0 ? (s3 / total) * 100 : 0;

    setHtml("db-kpi-total", fmt(total) + " <small>tCO₂e</small>");
    setHtml("db-kpi-s1", fmt(s1) + " <small>tCO₂e</small>");
    setHtml("db-kpi-s2", fmt(s2) + " <small>tCO₂e</small>");
    setHtml("db-kpi-s3", fmt(s3) + " <small>tCO₂e</small>");

    setText("db-dist-sub", "Share of total " + fmt(total) + " tCO₂e");
    setText("db-dist-s1", fmt(s1) + " t · " + pct1.toFixed(1) + "%");
    setText("db-dist-s2", fmt(s2) + " t · " + pct2.toFixed(1) + "%");
    setText("db-dist-s3", fmt(s3) + " t · " + pct3.toFixed(1) + "%");

    const deg1 = (pct1 / 100) * 360;
    const deg2 = deg1 + (pct2 / 100) * 360;
    const donut = document.getElementById("db-dist-donut");
    if (donut) {
      donut.style.background =
        "conic-gradient(#5A8FEE 0deg " + deg1 + "deg, #2E6FE0 " + deg1 + "deg " + deg2 + "deg, #10573F " + deg2 + "deg 360deg)";
    }
    return true;
  }

  /* ============================================================
     2. REDUCTION PLAN SUMMARY (short — full detail lives on its own page)
     ============================================================ */
  function renderReductionSummary() {
    const box = document.getElementById("db-reduction-summary");
    const plan = readJson(PLAN_KEY);
    if (!plan || !plan.summary) return; // keep the default "no plan yet" state

    const s = plan.summary;
    box.innerHTML =
      '<div style="display:flex; align-items:baseline; gap:8px; margin-bottom:10px;">' +
        '<span style="font-family:var(--font-mono); font-size:26px; font-weight:600; color:var(--forest);">' + s.overallAnnualReductionPct.toFixed(1) + '%</span>' +
        '<span style="font-size:11.5px; color:var(--ink-soft);">blended annual reduction target</span>' +
      '</div>' +
      '<div style="display:flex; justify-content:space-between; font-size:12.5px; padding:8px 0; border-top:1px solid var(--line);">' +
        '<span style="color:var(--ink-soft);">Planned reduction</span><span style="font-family:var(--font-mono); font-weight:600;">' + fmt2(s.totalReduction) + ' t</span>' +
      '</div>' +
      '<div style="display:flex; justify-content:space-between; font-size:12.5px; padding:8px 0; border-top:1px solid var(--line);">' +
        '<span style="color:var(--ink-soft);">Remaining after reduction</span><span style="font-family:var(--font-mono); font-weight:600;">' + fmt2(s.totalRemaining) + ' t</span>' +
      '</div>' +
      '<a href="reduction-planner.html" class="nz-btn-outline" style="margin-top:14px; font-size:12px; padding:8px 16px;">' +
        '<i class="fa-solid fa-sliders"></i> View full plan</a>';
  }

  /* ============================================================
     3. SELECTED OFFSET PROJECTS
     ============================================================ */
  function renderOffsetProjects() {
    const selectionData = readJson(SELECTION_KEY);
    const selection = selectionData && selectionData.selection ? selectionData.selection : {};
    const ids = Object.keys(selection).filter((id) => selection[id] > 0);
    if (!ids.length) return; // keep the default "none selected" state

    const container = document.getElementById("db-offset-list");
    container.innerHTML = "";
    ids.forEach((id) => {
      const project = CATALOG.find((p) => p.id === id);
      if (!project) return;
      const qty = selection[id];
      const item = document.createElement("div");
      item.className = "nz-offset-item";
      item.innerHTML =
        '<div class="nz-offset-thumb" style="background:linear-gradient(145deg,#1FA97C,#10573F);"><i class="fa-solid ' + project.icon + '"></i></div>' +
        '<div class="nz-offset-info"><div class="name"></div><div class="meta"></div></div>' +
        '<span class="nz-badge ' + (project.verification === "Verified" ? "verified" : "pending") + '"></span>' +
        '<div class="nz-offset-credits"><div class="amt"></div><div class="unit">tCO₂e</div></div>';
      item.querySelector(".name").textContent = project.name;
      item.querySelector(".meta").textContent = project.country + " · " + project.type + " · " + project.standard;
      item.querySelector(".nz-badge").textContent = project.verification;
      item.querySelector(".amt").textContent = fmt2(qty);
      container.appendChild(item);
    });
  }

  /* ============================================================
     4. BOOT — show empty state or the live dashboard, then render
     ============================================================ */
  function boot() {
    const empty = document.getElementById("db-empty-state");
    const live = document.getElementById("db-live-content");

    const hasEmissions = renderEmissions();
    if (!hasEmissions) {
      empty.style.display = "block";
      live.style.display = "none";
      return;
    }
    empty.style.display = "none";
    live.style.display = "block";

    renderReductionSummary();
    renderOffsetProjects();
  }

  document.addEventListener("DOMContentLoaded", boot);

  // Same-session live sync: any of the three source modules changing
  // elsewhere in this session (another tab/window sharing it) refreshes
  // this dashboard instantly, no manual reload needed.
  window.addEventListener("storage", (e) => {
    if ([EMISSION_KEY, PLAN_KEY, SELECTION_KEY].indexOf(e.key) !== -1) boot();
  });
})();
