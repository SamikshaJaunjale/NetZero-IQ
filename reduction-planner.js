/* ============================================================
   Aurex Net Zero Platform — Reduction Planner Module
   Reads its data exclusively from the shared "nz-emission-data"
   snapshot written by emission-upload.js — no emission values
   are ever hardcoded here. Every category shown, every current
   emission figure, and every chart is derived at runtime from
   whatever the user has entered in the Emission Upload module.
   ============================================================ */
(function () {
  "use strict";

  const SNAPSHOT_KEY = "nz-emission-data";   // written by emission-upload.js
  const PLAN_KEY = "nz-reduction-plan";       // this module's own saved plan

  const SCOPE_META = {
    1: { title: "Scope 1 · Direct Emissions", sub: "Company-owned combustion, fleet and process sources", color: "linear-gradient(145deg,#5A8FEE,#2E6FE0)" },
    2: { title: "Scope 2 · Purchased Energy", sub: "Electricity, steam, heating and cooling", color: "linear-gradient(145deg,#2E6FE0,#1949a8)" },
    3: { title: "Scope 3 · Value Chain Emissions", sub: "Upstream and downstream value-chain activities", color: "linear-gradient(145deg,#1FA97C,#10573F)" }
  };

  // In-memory state — rebuilt any time the underlying emission data changes.
  let categories = [];          // [{id,label,scope,value}] — only categories with a real value
  let percentages = {};         // { categoryId: number 0-100 }

  /* ============================================================
     SHARED UI HELPERS (toast / confirm dialog / button loading)
     Small, self-contained copies matching the ones used in
     emission-upload.js so this page has no external JS dependency.
     ============================================================ */
  function toastContainer() {
    let el = document.getElementById("nz-toast-container");
    if (!el) {
      el = document.createElement("div");
      el.id = "nz-toast-container";
      document.body.appendChild(el);
    }
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
      '<div class="nz-modal-box">' +
        '<h4><i class="fa-solid fa-triangle-exclamation"></i><span></span></h4>' +
        "<p></p>" +
        '<div class="nz-modal-actions">' +
          '<button type="button" class="nz-btn-ghost" data-action="cancel"></button>' +
          '<button type="button" class="nz-btn-primary" data-action="confirm"></button>' +
        "</div>" +
      "</div>";
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

  function setButtonLoading(btn, loading, loadingText) {
    if (!btn) return;
    if (loading) {
      btn.dataset.originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner nz-spin"></i> ' + (loadingText || "Working…");
    } else {
      btn.disabled = false;
      if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
    }
  }

  function fmt(n) {
    return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmt1(n) {
    return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  function byScope(n) { return categories.filter((c) => c.scope === n); }

  /* ============================================================
     1. LOAD LIVE DATA FROM EMISSION UPLOAD
     ============================================================ */
  function loadFilledCategories() {
    let snapshot = null;
    try {
      const raw = sessionStorage.getItem(SNAPSHOT_KEY);
      if (raw) snapshot = JSON.parse(raw);
    } catch (err) {
      snapshot = null;
    }
    if (!snapshot || !Array.isArray(snapshot.categories)) return [];

    // Defensive de-duplication by id (guards against malformed/duplicate data)
    const seen = new Set();
    const filled = [];
    snapshot.categories.forEach((cat) => {
      if (!cat || seen.has(cat.id)) return;
      const val = typeof cat.value === "number" && !isNaN(cat.value) ? cat.value : null;
      if (val === null || val <= 0) return; // only categories with a real entered emission
      seen.add(cat.id);
      filled.push({ id: cat.id, label: cat.label, scope: cat.scope, value: val });
    });
    return filled;
  }

  /* ============================================================
     2. RENDER — scope accordions + rows (fully dynamic, no
        hardcoded category markup anywhere in the HTML file)
     ============================================================ */
  function renderScopeAccordion() {
    const container = document.getElementById("rp-scope-accordion");
    container.innerHTML = "";

    [1, 2, 3].forEach((scopeNum) => {
      const cats = byScope(scopeNum);
      if (!cats.length) return; // don't render a scope section with no submitted data

      const meta = SCOPE_META[scopeNum];
      const card = document.createElement("div");
      card.className = "nz-card nz-scope-card";
      card.innerHTML =
        '<button type="button" class="nz-scope-header" data-bs-toggle="collapse" data-bs-target="#rp-scope' + scopeNum + '-body" aria-expanded="true">' +
          '<div class="nz-scope-header-left">' +
            '<div class="nz-scope-num" style="background:' + meta.color + ';">' + scopeNum + "</div>" +
            '<div class="nz-scope-header-text">' +
              '<div class="title">' + meta.title + "</div>" +
              '<div class="sub">' + meta.sub + "</div>" +
            "</div>" +
          "</div>" +
          '<div class="nz-scope-header-right">' +
            '<span class="nz-scope-completion" id="rp-scope' + scopeNum + '-completion">' + cats.length + " categor" + (cats.length === 1 ? "y" : "ies") + '</span>' +
            '<div class="nz-scope-subtotal">' +
              '<div class="amt" id="rp-scope' + scopeNum + '-reduction-amt">0.00 t</div>' +
              '<div class="lbl">Planned reduction</div>' +
            "</div>" +
            '<i class="fa-solid fa-chevron-down nz-scope-chevron"></i>' +
          "</div>" +
        "</button>" +
        '<div class="nz-scope-body collapse show" id="rp-scope' + scopeNum + '-body">' +
          '<div class="nz-scope-table-wrap">' +
            '<table class="nz-scope-table"><thead><tr>' +
              '<th style="width:20%">Category</th>' +
              '<th style="width:14%">Current Emission</th>' +
              '<th style="width:26%">Annual Reduction Target</th>' +
              '<th style="width:15%">Projected Reduction</th>' +
              '<th style="width:15%">Remaining Emission</th>' +
            "</tr></thead><tbody id=\"rp-scope" + scopeNum + "-tbody\"></tbody></table>" +
          "</div>" +
        "</div>";
      container.appendChild(card);

      const tbody = card.querySelector("#rp-scope" + scopeNum + "-tbody");
      cats.forEach((cat) => tbody.appendChild(buildRow(cat)));
    });
  }

  function buildRow(cat) {
    const tr = document.createElement("tr");
    tr.dataset.catId = cat.id;
    tr.innerHTML =
      '<td class="nz-row-category">' + cat.label + "</td>" +
      '<td class="nz-cat-num" id="rp-current-' + cat.id + '">' + fmt(cat.value) + " t</td>" +
      '<td>' +
        '<div class="nz-reduction-control">' +
          '<input type="range" min="0" max="100" step="1" value="0" class="nz-reduction-slider" id="rp-slider-' + cat.id + '">' +
          '<div class="input-group nz-reduction-number-group">' +
            '<input type="number" min="0" max="100" step="1" value="0" class="form-control" id="rp-pct-' + cat.id + '">' +
            '<span class="input-group-text">%</span>' +
          "</div>" +
        "</div>" +
      "</td>" +
      '<td class="nz-cat-num" id="rp-reduction-' + cat.id + '">0.00 t</td>' +
      '<td class="nz-cat-num" id="rp-remaining-' + cat.id + '">' + fmt(cat.value) + " t</td>";
    return tr;
  }

  /* ============================================================
     3. WIRE SLIDER + NUMBER INPUT PER ROW (kept in sync, validated)
     ============================================================ */
  function clampPct(n) {
    if (isNaN(n)) return 0;
    return Math.min(100, Math.max(0, n));
  }

  function bindRowControls() {
    categories.forEach((cat) => {
      const slider = document.getElementById("rp-slider-" + cat.id);
      const number = document.getElementById("rp-pct-" + cat.id);
      if (!slider || !number) return;

      const current = percentages[cat.id] || 0;
      slider.value = current;
      number.value = current;

      slider.addEventListener("input", () => {
        const v = clampPct(parseFloat(slider.value));
        percentages[cat.id] = v;
        number.value = v;
        number.classList.remove("nz-reduction-input-invalid");
        recalcAll();
      });

      number.addEventListener("input", () => {
        const raw = number.value.trim();
        if (raw === "") return; // allow the user to clear it mid-typing; validated on blur
        const v = parseFloat(raw);
        if (isNaN(v) || v < 0 || v > 100) {
          number.classList.add("nz-reduction-input-invalid");
          return;
        }
        number.classList.remove("nz-reduction-input-invalid");
        percentages[cat.id] = v;
        slider.value = v;
        recalcAll();
      });

      number.addEventListener("blur", () => {
        const raw = number.value.trim();
        let v = parseFloat(raw);
        if (raw === "" || isNaN(v)) {
          toast(cat.label + ": reduction % cannot be empty — reset to 0%.", "error");
          v = 0;
        } else if (v < 0) {
          toast(cat.label + ": reduction % cannot be negative — clamped to 0%.", "error");
          v = 0;
        } else if (v > 100) {
          toast(cat.label + ": reduction % cannot exceed 100% — clamped to 100%.", "error");
          v = 100;
        }
        v = clampPct(v);
        number.value = v;
        slider.value = v;
        number.classList.remove("nz-reduction-input-invalid");
        percentages[cat.id] = v;
        recalcAll();
      });
    });
  }

  /* ============================================================
     4. LIVE CALCULATIONS — rows, scope summaries, KPIs, charts
     ============================================================ */
  function scopeCurrent(scopeNum) {
    return byScope(scopeNum).reduce((s, c) => s + c.value, 0);
  }
  function scopeReduction(scopeNum) {
    return byScope(scopeNum).reduce((s, c) => s + c.value * ((percentages[c.id] || 0) / 100), 0);
  }

  function recalcAll() {
    // Per-row
    categories.forEach((cat) => {
      const pct = percentages[cat.id] || 0;
      const reduction = cat.value * (pct / 100);
      const remaining = cat.value - reduction;
      setText("rp-reduction-" + cat.id, fmt(reduction) + " t");
      setText("rp-remaining-" + cat.id, fmt(remaining) + " t");
    });

    // Per-scope subtotal shown in each scope card's header (part of the
    // reduction table section itself, not a separate analytics block)
    [1, 2, 3].forEach((n) => {
      const red = scopeReduction(n);
      setText("rp-scope" + n + "-reduction-amt", fmt(red) + " t");
    });
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  function setHtml(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
  }

  /* ============================================================
     7. SAVE / RESTORE / RESET PLAN
     ============================================================ */
  function updateLastSavedNote(isoDate, label) {
    const note = document.getElementById("rp-last-saved-note");
    if (!note) return;
    const d = new Date(isoDate);
    const stamp = d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    note.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--forest);"></i> ' + (label || "Plan saved") + " " + stamp;
  }

  function buildPlanSummary() {
    let totalCurrent = 0, totalReduction = 0;
    const scopeBreakdown = {};
    [1, 2, 3].forEach((n) => {
      const cur = scopeCurrent(n);
      const red = scopeReduction(n);
      totalCurrent += cur;
      totalReduction += red;
      scopeBreakdown[n] = { current: cur, reduction: red };
    });
    const overallPct = totalCurrent > 0 ? (totalReduction / totalCurrent) * 100 : 0;
    return {
      totalCurrent: totalCurrent,
      totalReduction: totalReduction,
      totalRemaining: totalCurrent - totalReduction,
      overallAnnualReductionPct: overallPct,
      scopeBreakdown: scopeBreakdown
    };
  }

  function bindSavePlan() {
    const btn = document.getElementById("btn-save-plan");
    if (!btn) return;
    btn.addEventListener("click", () => {
      setButtonLoading(btn, true, "Saving…");
      setTimeout(() => {
        const plan = {
          savedAt: new Date().toISOString(),
          percentages: Object.assign({}, percentages),
          summary: buildPlanSummary()
        };
        try {
          sessionStorage.setItem(PLAN_KEY, JSON.stringify(plan));
          window.dispatchEvent(new CustomEvent("nz-reduction-plan-updated", { detail: plan }));
          updateLastSavedNote(plan.savedAt, "Reduction plan saved");
          toast("Reduction Plan Saved Successfully.", "success");

          // ===== REDIRECT TO NET ZERO SCENARIOS =====
          window.location.href = 'net-zero-scenarios.html';
        } catch (err) {
          toast("Could not save the reduction plan to this browser's session storage.", "error");
          setButtonLoading(btn, false);
        }
      }, 400);
    });
  }

  function restoreSavedPlan() {
    try {
      const raw = sessionStorage.getItem(PLAN_KEY);
      if (!raw) return;
      const plan = JSON.parse(raw);
      if (plan && plan.percentages) {
        Object.keys(plan.percentages).forEach((id) => {
          percentages[id] = clampPct(parseFloat(plan.percentages[id]));
        });
        updateLastSavedNote(plan.savedAt, "Reduction plan saved");
      }
    } catch (err) {
      /* corrupted plan — ignore, start fresh */
    }
  }

  function bindResetPlan() {
    const btn = document.getElementById("btn-reset-plan");
    if (!btn) return;
    btn.addEventListener("click", () => {
      confirmDialog({
        title: "Reset the reduction plan?",
        message: "This clears every reduction percentage back to 0% and removes your saved plan. Current emission data from Emission Upload is not affected.",
        confirmLabel: "Yes, reset plan",
        cancelLabel: "Keep my plan",
        onConfirm: () => {
          percentages = {};
          categories.forEach((cat) => {
            const slider = document.getElementById("rp-slider-" + cat.id);
            const number = document.getElementById("rp-pct-" + cat.id);
            if (slider) slider.value = 0;
            if (number) { number.value = 0; number.classList.remove("nz-reduction-input-invalid"); }
          });
          sessionStorage.removeItem(PLAN_KEY);
          const note = document.getElementById("rp-last-saved-note");
          if (note) note.innerHTML = '<i class="fa-solid fa-circle-info"></i> No reduction plan saved yet';
          recalcAll();
          toast("Reduction plan has been reset.", "success");
        }
      });
    });
  }

  /* ============================================================
     8. INITIAL LOAD + LIVE CROSS-TAB SYNC WITH EMISSION UPLOAD
     ============================================================ */
  function renderAll(preserveExistingPercentages) {
    const freshCategories = loadFilledCategories();
    const emptyState = document.getElementById("rp-empty-state");
    const mainContent = document.getElementById("rp-main-content");

    if (!freshCategories.length) {
      categories = [];
      emptyState.style.display = "block";
      mainContent.style.display = "none";
      return;
    }

    emptyState.style.display = "none";
    mainContent.style.display = "block";

    const previousPct = preserveExistingPercentages ? Object.assign({}, percentages) : {};
    categories = freshCategories;

    if (preserveExistingPercentages) {
      // Keep whatever the user already had dialed in for categories that still exist.
      const next = {};
      categories.forEach((c) => { next[c.id] = previousPct[c.id] !== undefined ? previousPct[c.id] : 0; });
      percentages = next;
    }

    renderScopeAccordion();
    bindRowControls();
    recalcAll();
  }

  document.addEventListener("DOMContentLoaded", () => {
    restoreSavedPlan();
    renderAll(true);
    bindSavePlan();
    bindResetPlan();

    // If Emission Upload is edited elsewhere in this same browser session
    // (sessionStorage's "storage" event reaches other windows/tabs that share
    // this session, e.g. ones opened from this tab), refresh live, keeping
    // any in-progress reduction targets for categories that still exist).
    window.addEventListener("storage", (e) => {
      if (e.key === SNAPSHOT_KEY) {
        renderAll(true);
        toast("Emission data was updated in Emission Upload — Reduction Planner refreshed.", "info");
      }
    });
  });
})();