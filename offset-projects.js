/* ============================================================
   Aurex Net Zero Platform — Offset Projects Module
   ------------------------------------------------------------
   DATA SOURCES (all sessionStorage — cleared when the browser
   session ends, per the platform's session-workspace behaviour):
     "nz-emission-data"   -> written by emission-upload.js
     "nz-reduction-plan"  -> written by reduction-planner.js
     "nz-offset-selection"-> written/read by this file only

   REMAINING EMISSIONS LOGIC
   If a Reduction Plan has been saved, remaining emissions =
   plan.summary.totalRemaining (i.e. emissions AFTER planned
   reductions — exactly the "8,000 tCO2e" example in the brief).
   If no plan has been saved yet, remaining emissions = the full
   uploaded total (nothing has been reduced yet), with a note
   telling the user a saved Reduction Plan will refine the figure.

   The project catalog itself (offset-catalog-data.js) is static
   marketplace/reference data, not user emissions data — see the
   comment at the top of that file for why that distinction matters.
   ============================================================ */
(function () {
  "use strict";

  const EMISSION_KEY = "nz-emission-data";
  const PLAN_KEY = "nz-reduction-plan";
  const SELECTION_KEY = "nz-offset-selection";

  const CATALOG = window.NZ_OFFSET_CATALOG || [];
  const SDG_REF = window.NZ_SDG_REFERENCE || {};

  let remaining = 0;
  let selection = {}; // { projectId: quantityInTonnes }

  /* ============================================================
     SHARED UI HELPERS (self-contained, matching the rest of the app)
     ============================================================ */
  function toastContainer() {
    let el = document.getElementById("nz-toast-container");
    if (!el) { el = document.createElement("div"); el.id = "nz-toast-container"; document.body.appendChild(el); }
    return el;
  }
  const TOAST_ICONS = { success: "fa-circle-check", error: "fa-circle-exclamation", info: "fa-circle-info" };
  function toast(message, type) {
    type = type || "info";
    const container = toastContainer();
    const el = document.createElement("div");
    el.className = "nz-toast " + type;
    el.innerHTML = '<i class="fa-solid ' + TOAST_ICONS[type] + '"></i><span class="msg"></span><i class="fa-solid fa-xmark close"></i>';
    el.querySelector(".msg").textContent = message;
    container.appendChild(el);
    const remove = () => { el.classList.add("nz-toast-out"); setTimeout(() => el.remove(), 200); };
    el.querySelector(".close").addEventListener("click", remove);
    setTimeout(remove, 4200);
  }
  function confirmDialog(opts) {
    const overlay = document.createElement("div");
    overlay.className = "nz-modal-overlay";
    overlay.innerHTML =
      '<div class="nz-modal-box"><h4><i class="fa-solid fa-triangle-exclamation"></i><span></span></h4><p></p>' +
      '<div class="nz-modal-actions"><button type="button" class="nz-btn-ghost" data-action="cancel"></button>' +
      '<button type="button" class="nz-btn-primary" data-action="confirm"></button></div></div>';
    overlay.querySelector("h4 span").textContent = opts.title || "Please confirm";
    overlay.querySelector("p").textContent = opts.message || "Are you sure?";
    overlay.querySelector('[data-action="cancel"]').textContent = opts.cancelLabel || "Cancel";
    overlay.querySelector('[data-action="confirm"]').textContent = opts.confirmLabel || "Confirm";
    document.body.appendChild(overlay);
    function close() { overlay.remove(); }
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-action="cancel"]').addEventListener("click", () => { close(); if (opts.onCancel) opts.onCancel(); });
    overlay.querySelector('[data-action="confirm"]').addEventListener("click", () => { close(); if (opts.onConfirm) opts.onConfirm(); });
  }
  function fmt(n) { return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtMoney(n) { return "£" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  /* ============================================================
     1. REMAINING EMISSIONS (the engine's only real "input")
     ============================================================ */
  function computeRemaining() {
    let emissionSnapshot = null, plan = null;
    try { const raw = sessionStorage.getItem(EMISSION_KEY); if (raw) emissionSnapshot = JSON.parse(raw); } catch (e) {}
    try { const raw = sessionStorage.getItem(PLAN_KEY); if (raw) plan = JSON.parse(raw); } catch (e) {}

    const categories = emissionSnapshot && Array.isArray(emissionSnapshot.categories) ? emissionSnapshot.categories : [];
    const hasEmissions = categories.some((c) => typeof c.value === "number" && !isNaN(c.value) && c.value > 0);
    if (!hasEmissions) return { remaining: 0, hasData: false, source: "", scopes: null, total: 0, plannedReduction: 0 };

    // Scope 1 / 2 / 3 breakdown, fetched straight from the Emission Upload
    // snapshot — displayed on this page so the user can see exactly what
    // feeds the recommendation engine, without re-entering anything.
    const scopeTotal = (n) => categories
      .filter((c) => c.scope === n && typeof c.value === "number")
      .reduce((s, c) => s + c.value, 0);
    const scopes = { 1: scopeTotal(1), 2: scopeTotal(2), 3: scopeTotal(3) };
    const total = scopes[1] + scopes[2] + scopes[3];

    if (plan && plan.summary && typeof plan.summary.totalRemaining === "number") {
      return {
        remaining: plan.summary.totalRemaining,
        hasData: true,
        source: "After your saved Reduction Plan (" + fmt(plan.summary.totalReduction) + " t already planned to be reduced)",
        scopes: scopes,
        total: total,
        plannedReduction: plan.summary.totalReduction
      };
    }

    return {
      remaining: total,
      hasData: true,
      source: "Based on your full uploaded total — save a Reduction Plan to refine this figure",
      scopes: scopes,
      total: total,
      plannedReduction: 0
    };
  }

  /* ============================================================
     2. SELECTION PERSISTENCE (session-scoped, like everything else)
     ============================================================ */
  function persistSelection() {
    try {
      sessionStorage.setItem(SELECTION_KEY, JSON.stringify({ selection: selection, savedAt: new Date().toISOString() }));
    } catch (e) { /* selection simply won't survive a reload — non-critical */ }
  }
  function restoreSelection() {
    try {
      const raw = sessionStorage.getItem(SELECTION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.selection) selection = parsed.selection;
    } catch (e) { selection = {}; }
  }

  /* ============================================================
     3. FILTER BAR — options populated from the catalog itself
     ============================================================ */
  function populateFilterOptions() {
    const types = Array.from(new Set(CATALOG.map((p) => p.type))).sort();
    const standards = Array.from(new Set(CATALOG.map((p) => p.standard))).sort();
    const regions = Array.from(new Set(CATALOG.map((p) => p.region))).sort();
    const countries = Array.from(new Set(CATALOG.map((p) => p.country))).sort();
    const vintages = Array.from(new Set(CATALOG.map((p) => p.vintage))).sort((a, b) => b - a);

    const fill = (id, values) => {
      const sel = document.getElementById(id);
      values.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        sel.appendChild(opt);
      });
    };
    fill("op-filter-type", types);
    fill("op-filter-standard", standards);
    fill("op-filter-region", regions);
    fill("op-filter-country", countries);
    fill("op-filter-vintage", vintages);
  }

  function getFilters() {
    return {
      search: document.getElementById("op-search").value.trim().toLowerCase(),
      type: document.getElementById("op-filter-type").value,
      standard: document.getElementById("op-filter-standard").value,
      region: document.getElementById("op-filter-region").value,
      country: document.getElementById("op-filter-country").value,
      vintage: document.getElementById("op-filter-vintage").value ? parseInt(document.getElementById("op-filter-vintage").value, 10) : null,
      verification: document.getElementById("op-filter-verification").value,
      maxPrice: document.getElementById("op-filter-price").value ? parseFloat(document.getElementById("op-filter-price").value) : null,
      sort: document.getElementById("op-sort").value
    };
  }

  function applyFiltersAndSort() {
    const f = getFilters();
    let list = CATALOG.filter((p) => {
      if (f.search && !(p.name.toLowerCase().includes(f.search) || p.country.toLowerCase().includes(f.search))) return false;
      if (f.type && p.type !== f.type) return false;
      if (f.standard && p.standard !== f.standard) return false;
      if (f.region && p.region !== f.region) return false;
      if (f.country && p.country !== f.country) return false;
      if (f.vintage !== null && p.vintage !== f.vintage) return false;
      if (f.verification && p.verification !== f.verification) return false;
      if (f.maxPrice !== null && p.pricePerTonne > f.maxPrice) return false;
      return p.availableCredits > 0;
    });

    switch (f.sort) {
      case "price-asc": list.sort((a, b) => a.pricePerTonne - b.pricePerTonne); break;
      case "price-desc": list.sort((a, b) => b.pricePerTonne - a.pricePerTonne); break;
      case "credits-desc": list.sort((a, b) => b.maxOffsetCapacity - a.maxOffsetCapacity); break;
      case "newest": list.sort((a, b) => b.vintage - a.vintage); break;
      default: list.sort((a, b) => b.rating - a.rating); // "Best match"
    }
    return list;
  }

  /* ============================================================
     4. RENDER PROJECT CARDS
     ============================================================ */
  function sdgBadgeRow(sdgIds) {
    return sdgIds.map((id) => {
      const ref = SDG_REF[id] || { name: "SDG " + id, color: "#666" };
      return '<span class="nz-op-sdg-badge" style="background:' + ref.color + ';" title="SDG ' + id + ' — ' + ref.name + '">SDG ' + id + "</span>";
    }).join("");
  }

  function renderStars(rating) {
    const full = Math.round(rating);
    let html = "";
    for (let i = 0; i < 5; i++) html += '<i class="fa-solid fa-star" style="opacity:' + (i < full ? "1" : "0.25") + ';"></i>';
    return html;
  }

  function buildCard(p) {
    const qty = selection[p.id] || 0;
    const isSelected = qty > 0;
    const fullyCovers = remaining > 0 && p.availableCredits >= remaining;

    const card = document.createElement("div");
    card.className = "nz-card nz-op-card";
    card.innerHTML =
      '<div class="nz-op-card-head">' +
        '<span class="nz-op-thumb" style="background:linear-gradient(145deg,#1FA97C,#10573F);"><i class="fa-solid ' + p.icon + '"></i></span>' +
        '<div style="text-align:right;">' +
          '<div class="nz-op-rating">' + renderStars(p.rating) + '<span>' + p.rating.toFixed(1) + "</span></div>" +
          (fullyCovers ? '<div class="nz-badge verified" style="margin-top:6px;"><i class="fa-solid fa-bullseye"></i> Fully covers your gap</div>' : "") +
        "</div>" +
      "</div>" +

      '<div>' +
        '<div class="nz-op-name">' + p.name + "</div>" +
        '<div class="nz-op-meta">' +
          '<span><i class="fa-solid fa-location-dot"></i> ' + p.country + ", " + p.region + "</span>" +
          '<span><i class="fa-solid fa-layer-group"></i> ' + p.type + "</span>" +
        "</div>" +
      "</div>" +

      '<div class="nz-op-desc">' + p.description + "</div>" +

      '<div class="nz-op-stat-grid">' +
        '<div class="nz-op-stat"><div class="v">' + p.standard + '</div><div class="l">Carbon standard</div></div>' +
        '<div class="nz-op-stat"><div class="v">' + p.id + '</div><div class="l">Project ID</div></div>' +
        '<div class="nz-op-stat"><div class="v">' + p.vintage + '</div><div class="l">Vintage year</div></div>' +
        '<div class="nz-op-stat"><div class="v">' + fmt(p.availableCredits) + ' t</div><div class="l">Available credits</div></div>' +
        '<div class="nz-op-stat"><div class="v">' + fmt(p.maxOffsetCapacity) + ' t</div><div class="l">Max offset capacity</div></div>' +
        '<div class="nz-op-stat"><div class="v">' + fmt(p.annualRemoval) + ' t/yr</div><div class="l">Expected annual removal</div></div>' +
      "</div>" +

      '<div>' +
        '<div class="nz-op-stat l" style="margin-bottom:6px;">Supported UN SDGs</div>' +
        '<div class="nz-op-sdg-row">' + sdgBadgeRow(p.sdgs) + "</div>" +
      "</div>" +

      '<div style="font-size:11.5px; color:var(--ink-soft);"><i class="fa-solid fa-building"></i> ' + p.developer + "</div>" +

      '<div class="nz-op-card-footer">' +
        '<div>' +
          '<div class="nz-op-price">' + fmtMoney(p.pricePerTonne) + '<small>/tonne</small></div>' +
          '<span class="nz-op-verified-badge ' + (p.verification === "Verified" ? "verified" : "pending") + '">' + p.verification + "</span>" +
        "</div>" +
        '<div id="op-card-action-' + p.id + '"></div>' +
      "</div>";

    // Action area: either an "Add to Plan" button, or a quantity control + remove
    const actionSlot = card.querySelector("#op-card-action-" + p.id);
    if (!isSelected) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nz-btn-primary";
      btn.innerHTML = '<i class="fa-solid fa-plus"></i> Add to Plan';
      btn.addEventListener("click", () => addToSelection(p));
      actionSlot.appendChild(btn);
    } else {
      const wrap = document.createElement("div");
      wrap.className = "nz-op-qty-control";
      wrap.innerHTML =
        '<input type="number" min="0" max="' + p.maxOffsetCapacity + '" step="1" value="' + qty + '">' +
        '<span style="font-size:11px; color:var(--ink-soft);">t</span>' +
        '<button type="button" class="nz-icon-btn" style="width:32px;height:32px;" title="Remove"><i class="fa-solid fa-trash"></i></button>';
      const input = wrap.querySelector("input");
      const removeBtn = wrap.querySelector("button");
      input.addEventListener("change", () => updateSelectionQty(p, parseFloat(input.value)));
      removeBtn.addEventListener("click", () => removeFromSelection(p));
      actionSlot.appendChild(wrap);
    }

    return card;
  }

  function renderGrid() {
    const grid = document.getElementById("op-project-grid");
    grid.innerHTML = "";
    const list = applyFiltersAndSort();
    document.getElementById("op-results-count").textContent =
      list.length === CATALOG.length ? "Showing all " + list.length + " projects" : "Showing " + list.length + " of " + CATALOG.length + " projects";

    if (!list.length) {
      grid.innerHTML = '<div class="nz-summary-note" style="grid-column:1/-1;"><i class="fa-solid fa-circle-info"></i> No projects match these filters — try widening your search.</div>';
      return;
    }
    list.forEach((p) => grid.appendChild(buildCard(p)));
  }

  /* ============================================================
     5. SELECTION + OFFSET CALCULATOR
     ============================================================ */
  function currentTotalOffset() {
    return Object.keys(selection).reduce((sum, id) => sum + (selection[id] || 0), 0);
  }

  function addToSelection(project) {
    const alreadyCovered = currentTotalOffset();
    const uncovered = Math.max(0, remaining - alreadyCovered);
    // If there's still a gap to fill, default to exactly that gap (capped by
    // what this project can supply). If the gap is already fully covered by
    // other selections, default to a small buffer rather than the project's
    // entire capacity — the user can always increase it themselves.
    const defaultQty = uncovered > 0
      ? Math.min(project.maxOffsetCapacity, uncovered)
      : Math.min(project.maxOffsetCapacity, Math.max(100, remaining * 0.1));
    selection[project.id] = Math.round(defaultQty * 100) / 100;
    persistSelection();
    renderGrid();
    recalcSelectionSummary();
    toast(project.name + " added to your offset plan.", "success");
  }

  function updateSelectionQty(project, value) {
    if (isNaN(value) || value < 0) value = 0;
    if (value > project.maxOffsetCapacity) {
      value = project.maxOffsetCapacity;
      toast("Capped at this project's maximum offset capacity (" + fmt(project.maxOffsetCapacity) + " t).", "error");
    }
    if (value === 0) {
      delete selection[project.id];
    } else {
      selection[project.id] = Math.round(value * 100) / 100;
    }
    persistSelection();
    renderGrid();
    recalcSelectionSummary();
  }

  function removeFromSelection(project) {
    delete selection[project.id];
    persistSelection();
    renderGrid();
    recalcSelectionSummary();
    toast(project.name + " removed from your offset plan.", "info");
  }

  function recalcSelectionSummary() {
    const ids = Object.keys(selection);
    const bar = document.getElementById("op-selection-bar");
    if (!ids.length) {
      bar.style.display = "none";
      document.getElementById("op-plan-section").style.display = "none";
      return;
    }
    bar.style.display = "flex";

    const totalOffset = currentTotalOffset();
    const totalCost = ids.reduce((sum, id) => {
      const p = CATALOG.find((c) => c.id === id);
      return sum + (p ? p.pricePerTonne * selection[id] : 0);
    }, 0);
    const balance = remaining - totalOffset;

    document.getElementById("op-sel-count").textContent = String(ids.length);
    document.getElementById("op-sel-offset").textContent = fmt(totalOffset) + " t";
    document.getElementById("op-sel-balance").textContent = (balance >= 0 ? fmt(balance) : "+" + fmt(Math.abs(balance))) + " t" + (balance < 0 ? " surplus" : "");
    document.getElementById("op-sel-cost").textContent = fmtMoney(totalCost);
  }

  /* ============================================================
     6. IMPLEMENTATION PLAN
     ============================================================ */
  function bindClearSelection() {
    document.getElementById("btn-clear-selection").addEventListener("click", () => {
      confirmDialog({
        title: "Clear your offset selection?",
        message: "This removes every project from your current offset plan for this session.",
        confirmLabel: "Yes, clear it",
        cancelLabel: "Keep selection",
        onConfirm: () => {
          selection = {};
          persistSelection();
          renderGrid();
          recalcSelectionSummary();
          toast("Offset selection cleared.", "success");
        }
      });
    });
  }

  function estimatedCompletion(leadTimeMonths) {
    const d = new Date();
    d.setMonth(d.getMonth() + leadTimeMonths);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  }

  function bindGeneratePlan() {
    document.getElementById("btn-generate-plan").addEventListener("click", () => {
      const ids = Object.keys(selection);
      if (!ids.length) {
        toast("Select at least one project before generating an implementation plan.", "error");
        return;
      }

      const tbody = document.getElementById("op-plan-tbody");
      tbody.innerHTML = "";
      let totalCost = 0, totalOffset = 0;
      const sdgSet = new Set();

      ids.forEach((id) => {
        const p = CATALOG.find((c) => c.id === id);
        if (!p) return;
        const qty = selection[id];
        const cost = qty * p.pricePerTonne;
        totalCost += cost;
        totalOffset += qty;
        p.sdgs.forEach((s) => sdgSet.add(s));

        const tr = document.createElement("tr");
        tr.innerHTML =
          "<td><strong>" + p.name + "</strong><br><span style=\"color:var(--ink-soft); font-size:11px;\">" + p.id + "</span></td>" +
          "<td>" + p.country + "<br><span style=\"color:var(--ink-soft); font-size:11px;\">" + p.region + "</span></td>" +
          "<td>" + p.standard + "</td>" +
          "<td class=\"nz-cat-num\">" + fmt(qty) + " t</td>" +
          "<td class=\"nz-cat-num\">" + fmt(qty) + " t CO₂e</td>" +
          "<td>" + p.leadTimeMonths + " month" + (p.leadTimeMonths === 1 ? "" : "s") + " lead time</td>" +
          "<td>" + estimatedCompletion(p.leadTimeMonths) + "</td>" +
          "<td class=\"nz-cat-num\">" + fmtMoney(cost) + "</td>";
        tbody.appendChild(tr);
      });

      document.getElementById("op-plan-total-cost").textContent = fmtMoney(totalCost);
      document.getElementById("op-plan-total-offset").innerHTML = fmt(totalOffset) + " <small>tCO₂e</small>";
      const netRemaining = Math.max(0, remaining - totalOffset);
      document.getElementById("op-plan-net-remaining").innerHTML = fmt(netRemaining) + " <small>tCO₂e</small>";
      document.getElementById("op-plan-sdgs").innerHTML = sdgBadgeRow(Array.from(sdgSet).sort((a, b) => a - b));

      const planSection = document.getElementById("op-plan-section");
      planSection.style.display = "block";
      planSection.scrollIntoView({ behavior: "smooth", block: "start" });
      toast("Implementation plan generated.", "success");
    });
  }

  /* ============================================================
     7. INIT
     ============================================================ */
  function applyRemainingToUI(info) {
    document.getElementById("op-remaining-amt").innerHTML = fmt(info.remaining) + ' <small style="font-size:14px; font-weight:500; color:var(--ink-soft);">tCO₂e</small>';
    document.getElementById("op-remaining-source").innerHTML = '<i class="fa-solid fa-circle-info"></i> ' + info.source;

    // Scope 1/2/3 + Total + Planned Reduction snapshot cards — fetched, never entered here.
    if (info.scopes) {
      document.getElementById("op-snap-s1").innerHTML = fmt(info.scopes[1]) + " <small>tCO₂e</small>";
      document.getElementById("op-snap-s2").innerHTML = fmt(info.scopes[2]) + " <small>tCO₂e</small>";
      document.getElementById("op-snap-s3").innerHTML = fmt(info.scopes[3]) + " <small>tCO₂e</small>";
      document.getElementById("op-snap-total").innerHTML = fmt(info.total) + " <small>tCO₂e</small>";
      document.getElementById("op-snap-reduction").innerHTML = fmt(info.plannedReduction) + " <small>tCO₂e</small>";
      document.getElementById("op-snap-remaining").innerHTML = fmt(info.remaining) + " <small>tCO₂e</small>";
    }
  }

  /* ============================================================
     SUGGESTED PORTFOLIO — a simple greedy recommendation that picks a
     diverse mix of projects (preferring higher-rated, lower-cost, and
     different types) to cover the remaining-emissions gap, similar to
     the Wind + Afforestation + Solar + Cookstove example in the brief.
     This only pre-fills a suggestion; the user can still add/remove
     projects manually afterwards.
     ============================================================ */
  function buildSuggestedPortfolio() {
    if (remaining <= 0) return [];
    const pool = CATALOG
      .filter((p) => p.availableCredits > 0)
      .slice()
      .sort((a, b) => (b.rating / Math.sqrt(b.pricePerTonne)) - (a.rating / Math.sqrt(a.pricePerTonne)));

    const picks = [];
    const usedTypes = new Set();
    let covered = 0;
    const targetChunk = remaining / 4; // aim for ~4 diverse projects, like the brief's example

    for (const p of pool) {
      if (covered >= remaining) break;
      if (usedTypes.has(p.type)) continue; // prefer diversity across types first
      const need = remaining - covered;
      const qty = Math.round(Math.min(p.maxOffsetCapacity, Math.max(targetChunk, need > targetChunk ? targetChunk : need)) * 100) / 100;
      const actualQty = Math.min(qty, need);
      picks.push({ project: p, qty: actualQty });
      usedTypes.add(p.type);
      covered += actualQty;
    }
    // If diverse picks didn't fully cover it (small catalog edge case), top up with best remaining options regardless of type.
    if (covered < remaining) {
      for (const p of pool) {
        if (covered >= remaining) break;
        const already = picks.find((x) => x.project.id === p.id);
        const room = p.maxOffsetCapacity - (already ? already.qty : 0);
        if (room <= 0) continue;
        const need = remaining - covered;
        const addQty = Math.min(room, need);
        if (already) { already.qty += addQty; } else { picks.push({ project: p, qty: addQty }); }
        covered += addQty;
      }
    }
    return picks;
  }

  function renderSuggestedPortfolio() {
    const box = document.getElementById("op-suggested-portfolio");
    const picks = buildSuggestedPortfolio();
    if (!picks.length) { box.style.display = "none"; return; }
    box.style.display = "block";
    document.getElementById("op-suggested-list").innerHTML = picks.map((pick) =>
      '<span><strong>' + pick.project.name + '</strong> — ' + fmt(pick.qty) + " t</span>"
    ).join("") + '<span style="font-weight:700; color:var(--forest);">Total: ' + fmt(picks.reduce((s, x) => s + x.qty, 0)) + " t</span>";
  }

  function bindApplySuggested() {
    document.getElementById("btn-apply-suggested").addEventListener("click", () => {
      const picks = buildSuggestedPortfolio();
      picks.forEach((pick) => { selection[pick.project.id] = Math.round(pick.qty * 100) / 100; });
      persistSelection();
      renderGrid();
      recalcSelectionSummary();
      toast("Suggested portfolio applied — adjust quantities any time.", "success");
    });
  }

  const FILTER_IDS = [
    "op-search", "op-filter-type", "op-filter-standard", "op-filter-region",
    "op-filter-country", "op-filter-vintage", "op-filter-verification",
    "op-filter-price", "op-sort"
  ];

  function boot() {
    const info = computeRemaining();
    remaining = info.remaining;

    const emptyState = document.getElementById("op-empty-state");
    const mainContent = document.getElementById("op-main-content");
    if (!info.hasData) {
      emptyState.style.display = "block";
      mainContent.style.display = "none";
      return;
    }
    emptyState.style.display = "none";
    mainContent.style.display = "block";
    applyRemainingToUI(info);
    renderSuggestedPortfolio();

    populateFilterOptions();
    restoreSelection();
    renderGrid();
    recalcSelectionSummary();

    FILTER_IDS.forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener(id === "op-search" ? "input" : "change", renderGrid);
    });

    bindClearSelection();
    bindGeneratePlan();
    bindApplySuggested();
  }

  /* ============================================================
     DEFENSIVE INIT — if anything above throws (a missing script, a
     stale/mismatched HTML file, an unexpected data shape, etc.) this
     catches it and shows a visible, actionable error state instead of
     a silent blank page. This is the fix for "nothing is displayed":
     previously an uncaught exception anywhere in boot() would leave
     both the empty-state and main-content divs hidden with no
     feedback at all.
     ============================================================ */
  function showFatalError(err) {
    try {
      const el = document.getElementById("op-fatal-error");
      if (el) el.style.display = "block";
      const empty = document.getElementById("op-empty-state");
      const main = document.getElementById("op-main-content");
      if (empty) empty.style.display = "none";
      if (main) main.style.display = "none";
    } catch (inner) { /* if even this fails, there's nothing more we can do client-side */ }
    if (window.console && console.error) console.error("Offset Projects failed to initialise:", err);
  }

  document.addEventListener("DOMContentLoaded", () => {
    try {
      if (!window.NZ_OFFSET_CATALOG || !window.NZ_SDG_REFERENCE) {
        throw new Error("offset-catalog-data.js did not load before offset-projects.js — check script order/paths.");
      }
      boot();
    } catch (err) {
      showFatalError(err);
    }

    // Same-session live sync: emissions or reduction plan changed elsewhere
    // in this session (sessionStorage's "storage" event reaches other
    // windows/tabs that share this session).
    window.addEventListener("storage", (e) => {
      if (e.key === EMISSION_KEY || e.key === PLAN_KEY) {
        try {
          const info = computeRemaining();
          remaining = info.remaining;
          if (info.hasData) {
            document.getElementById("op-empty-state").style.display = "none";
            document.getElementById("op-main-content").style.display = "block";
            applyRemainingToUI(info);
            renderSuggestedPortfolio();
            renderGrid();
            recalcSelectionSummary();
            toast("Your remaining emissions changed — recommendations refreshed.", "info");
          } else {
            document.getElementById("op-empty-state").style.display = "block";
            document.getElementById("op-main-content").style.display = "none";
          }
        } catch (err) {
          showFatalError(err);
        }
      }
    });
  });
})();
