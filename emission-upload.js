/* ============================================================
   Aurex Net Zero Platform — Emission Upload Module
   Handles: company info edit, bulk template download, bulk
   file upload + mapping, live calculations, reset, save draft,
   validation, and submission. Pure vanilla JS, no framework.
   ============================================================ */
(function () {
  "use strict";

  /* ============================================================
     0. CATEGORY REGISTRY
     Single source of truth mapping every emission input/comment
     field to its scope + human-readable label. Used for totals,
     validation, draft save/restore, and bulk-upload mapping.
     ============================================================ */
  const CATEGORIES = [
    { id: "s1-vehicles-emission", comment: "s1-vehicles-comment", scope: 1, label: "Company-Owned Vehicles" },
    { id: "s1-stationary-emission", comment: "s1-stationary-comment", scope: 1, label: "Stationary Combustion" },
    { id: "s1-generators-emission", comment: "s1-generators-comment", scope: 1, label: "Generators" },
    { id: "s1-natgas-emission", comment: "s1-natgas-comment", scope: 1, label: "Natural Gas" },
    { id: "s1-diesel-emission", comment: "s1-diesel-comment", scope: 1, label: "Diesel" },
    { id: "s1-petrol-emission", comment: "s1-petrol-comment", scope: 1, label: "Petrol" },
    { id: "s1-lpg-emission", comment: "s1-lpg-comment", scope: 1, label: "LPG" },
    { id: "s1-refrigerant-emission", comment: "s1-refrigerant-comment", scope: 1, label: "Refrigerant Leakage" },
    { id: "s1-process-emission", comment: "s1-process-comment", scope: 1, label: "Industrial Process Emissions" },
    { id: "s1-other-emission", comment: "s1-other-comment", scope: 1, label: "Other Scope 1 Sources" },

    { id: "s2-electricity-emission", comment: "s2-electricity-comment", scope: 2, label: "Purchased Electricity" },
    { id: "s2-steam-emission", comment: "s2-steam-comment", scope: 2, label: "Purchased Steam" },
    { id: "s2-heating-emission", comment: "s2-heating-comment", scope: 2, label: "Purchased Heating" },
    { id: "s2-cooling-emission", comment: "s2-cooling-comment", scope: 2, label: "Purchased Cooling" },
    { id: "s2-renewable-emission", comment: "s2-renewable-comment", scope: 2, label: "Renewable Electricity" },
    { id: "s2-other-emission", comment: "s2-other-comment", scope: 2, label: "Other Scope 2 Sources" },

    { id: "s3-flights-emission", comment: "s3-flights-comment", scope: 3, label: "Business Flights" },
    { id: "s3-accommodation-emission", comment: "s3-accommodation-comment", scope: 3, label: "Accommodation" },
    { id: "s3-commuting-emission", comment: "s3-commuting-comment", scope: 3, label: "Employee Commuting" },
    { id: "s3-publictransport-emission", comment: "s3-publictransport-comment", scope: 3, label: "Public Transport" },
    { id: "s3-freight-emission", comment: "s3-freight-comment", scope: 3, label: "Freight & Logistics" },
    { id: "s3-courier-emission", comment: "s3-courier-comment", scope: 3, label: "Courier Services" },
    { id: "s3-purchasedgoods-emission", comment: "s3-purchasedgoods-comment", scope: 3, label: "Purchased Goods" },
    { id: "s3-capitalgoods-emission", comment: "s3-capitalgoods-comment", scope: 3, label: "Capital Goods" },
    { id: "s3-waste-emission", comment: "s3-waste-comment", scope: 3, label: "Waste Generated" },
    { id: "s3-water-emission", comment: "s3-water-comment", scope: 3, label: "Water Consumption" },
    { id: "s3-businesstravel-emission", comment: "s3-businesstravel-comment", scope: 3, label: "Business Travel" },
    { id: "s3-leasedassets-emission", comment: "s3-leasedassets-comment", scope: 3, label: "Leased Assets" },
    { id: "s3-investments-emission", comment: "s3-investments-comment", scope: 3, label: "Investments" },
    { id: "s3-fuelenergy-emission", comment: "s3-fuelenergy-comment", scope: 3, label: "Fuel & Energy Related Activities" },
    { id: "s3-downstreamtransport-emission", comment: "s3-downstreamtransport-comment", scope: 3, label: "Downstream Transportation" },
    { id: "s3-upstreamtransport-emission", comment: "s3-upstreamtransport-comment", scope: 3, label: "Upstream Transportation" },
    { id: "s3-other-emission", comment: "s3-other-comment", scope: 3, label: "Other Scope 3 Sources" }
  ];

  // A small set of categories treated as mandatory for Validate/Submit,
  // representative of the most material source in each scope.
  const REQUIRED_IDS = ["s1-vehicles-emission", "s2-electricity-emission", "s3-flights-emission"];

  const DRAFT_KEY = "nz-emission-draft";

  // Shared source-of-truth key read by the Reduction Planner module.
  // Every time totals are recalculated, the current emission-by-category
  // snapshot is written here so Reduction Planner (same tab on next visit,
  // or a same-session window/popup via the "storage" event) always reflects
  // the latest data. Because this now uses sessionStorage, that sync applies
  // within one browser session (same tab, or a tab/window opened from it) —
  // not across independently opened tabs, and everything clears when the
  // tab/browser closes, as required.
  const EMISSION_SNAPSHOT_KEY = "nz-emission-data";

  const byScope = (n) => CATEGORIES.filter((c) => c.scope === n);

  /* ============================================================
     1. TOAST NOTIFICATIONS
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

  const TOAST_ICONS = {
    success: "fa-circle-check",
    error: "fa-circle-exclamation",
    info: "fa-circle-info"
  };

  function toast(message, type) {
    type = type || "info";
    const container = toastContainer();
    const el = document.createElement("div");
    el.className = "nz-toast " + type;
    el.innerHTML =
      '<i class="fa-solid ' + TOAST_ICONS[type] + '"></i>' +
      '<span class="msg"></span>' +
      '<i class="fa-solid fa-xmark close"></i>';
    el.querySelector(".msg").textContent = message;
    container.appendChild(el);

    const remove = () => {
      el.classList.add("nz-toast-out");
      setTimeout(() => el.remove(), 200);
    };
    el.querySelector(".close").addEventListener("click", remove);
    setTimeout(remove, 4200);
  }

  /* ============================================================
     2. CONFIRM DIALOG (reusable modal)
     ============================================================ */
  function confirmDialog(opts) {
    const overlay = document.createElement("div");
    overlay.className = "nz-modal-overlay";

    const listHtml = opts.list && opts.list.length
      ? "<ul>" + opts.list.map((li) => "<li>" + li + "</li>").join("") + "</ul>"
      : "";

    overlay.innerHTML =
      '<div class="nz-modal-box">' +
        "<h4><i class=\"fa-solid fa-triangle-exclamation\"></i><span></span></h4>" +
        "<p></p>" +
        listHtml +
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

    function close() {
      overlay.remove();
    }
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector('[data-action="cancel"]').addEventListener("click", () => {
      close();
      if (opts.onCancel) opts.onCancel();
    });
    overlay.querySelector('[data-action="confirm"]').addEventListener("click", () => {
      close();
      if (opts.onConfirm) opts.onConfirm();
    });
  }

  /* ============================================================
     3. BUTTON LOADING STATE
     ============================================================ */
  function setButtonLoading(btn, loading, loadingText) {
    if (!btn) return;
    if (loading) {
      btn.dataset.originalHtml = btn.innerHTML;
      btn.classList.add("is-loading");
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner nz-spin"></i> ' + (loadingText || "Working…");
    } else {
      btn.classList.remove("is-loading");
      btn.disabled = false;
      if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
    }
  }

  /* ============================================================
     4. NUMBER HELPERS
     ============================================================ */
  function fmt(n) {
    return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function readValue(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const raw = el.value.trim();
    if (raw === "") return null;
    const n = parseFloat(raw);
    return isNaN(n) ? NaN : n;
  }

  /* ============================================================
     5. STATUS ICON PER ROW (valid / invalid / empty)
     ============================================================ */
  function updateRowStatus(input) {
    const row = input.closest("tr");
    if (!row) return;
    const statusEl = row.querySelector(".nz-status");
    const icon = statusEl ? statusEl.querySelector("i") : null;
    const raw = input.value.trim();

    input.classList.remove("is-valid", "is-invalid", "is-empty", "is-review");

    if (raw === "") {
      input.classList.add("is-empty");
      if (statusEl) {
        statusEl.className = "nz-status empty";
        statusEl.title = "Required";
      }
      if (icon) icon.className = "fa-solid fa-circle-minus";
      return;
    }

    const n = parseFloat(raw);
    if (isNaN(n) || n < 0) {
      input.classList.add("is-invalid");
      if (statusEl) {
        statusEl.className = "nz-status invalid";
        statusEl.title = isNaN(n) ? "Invalid number" : "Value cannot be negative";
      }
      if (icon) icon.className = "fa-solid fa-circle-xmark";
      return;
    }

    input.classList.add("is-valid");
    if (statusEl) {
      statusEl.className = "nz-status valid";
      statusEl.title = "Valid";
    }
    if (icon) icon.className = "fa-solid fa-circle-check";
  }

  /* ============================================================
     6. LIVE CALCULATIONS + SUMMARY
     ============================================================ */
  function scopeTotal(scope) {
    return byScope(scope).reduce((sum, cat) => {
      const n = readValue(cat.id);
      return sum + (typeof n === "number" && !isNaN(n) && n >= 0 ? n : 0);
    }, 0);
  }
  function scopeFilledCount(scope) {
    return byScope(scope).filter((cat) => {
      const el = document.getElementById(cat.id);
      return el && el.value.trim() !== "";
    }).length;
  }

  function recalcAll() {
    const t1 = scopeTotal(1);
    const t2 = scopeTotal(2);
    const t3 = scopeTotal(3);
    const grand = t1 + t2 + t3;

    const c1 = scopeFilledCount(1), n1 = byScope(1).length;
    const c2 = scopeFilledCount(2), n2 = byScope(2).length;
    const c3 = scopeFilledCount(3), n3 = byScope(3).length;

    setText("scope1-subtotal", fmt(t1) + " t");
    setText("scope2-subtotal", fmt(t2) + " t");
    setText("scope3-subtotal", fmt(t3) + " t");

    setCompletion("scope1-completion", c1, n1);
    setCompletion("scope2-completion", c2, n2);
    setCompletion("scope3-completion", c3, n3);

    setText("kpi-scope1-total", fmt(t1) + ' <small>tCO₂e</small>', true);
    setText("kpi-scope2-total", fmt(t2) + ' <small>tCO₂e</small>', true);
    setText("kpi-scope3-total", fmt(t3) + ' <small>tCO₂e</small>', true);
    setText("kpi-grand-total", fmt(grand) + ' <small>tCO₂e</small>', true);

    setScopeNote("scope1-note", t1, grand);
    setScopeNote("scope2-note", t2, grand);
    setScopeNote("scope3-note", t3, grand);

    const totalFilled = c1 + c2 + c3;
    const totalFields = n1 + n2 + n3;
    const grandNote = document.getElementById("grand-total-note");
    if (grandNote) {
      const icon = grandNote.querySelector("i");
      if (totalFilled === totalFields && totalFields > 0) {
        grandNote.classList.add("ok");
        if (icon) icon.className = "fa-solid fa-circle-check";
        grandNote.lastChild.textContent = " All " + totalFields + " categories entered";
      } else {
        grandNote.classList.remove("ok");
        if (icon) icon.className = "fa-solid fa-circle-exclamation";
        grandNote.lastChild.textContent = " " + totalFilled + " of " + totalFields + " categories entered";
      }
    }

    syncEmissionSnapshot();
  }

  /* ============================================================
     6b. EMISSION SNAPSHOT SYNC — Reduction Planner integration
     Writes { updatedAt, categories: [{id,label,scope,value}] } so
     the Reduction Planner module (a separate page) always reads
     the live, current state of Emission Upload — no hardcoded
     values are ever duplicated between the two modules.
     ============================================================ */
  function syncEmissionSnapshot() {
    try {
      const snapshot = {
        updatedAt: new Date().toISOString(),
        categories: CATEGORIES.map((cat) => ({
          id: cat.id,
          label: cat.label,
          scope: cat.scope,
          value: readValue(cat.id) // number, or null if left blank
        }))
      };
      sessionStorage.setItem(EMISSION_SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch (err) {
      /* sessionStorage unavailable — Reduction Planner will show its empty state */
    }
  }

  function setText(id, value, isHtml) {
    const el = document.getElementById(id);
    if (!el) return;
    if (isHtml) el.innerHTML = value;
    else el.textContent = value;
  }

  function setCompletion(id, filled, total) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = filled + " / " + total + " entered";
    el.classList.toggle("incomplete", filled < total);
  }

  function setScopeNote(id, scopeVal, grandVal) {
    const el = document.getElementById(id);
    if (!el) return;
    const icon = el.querySelector("i");
    if (grandVal > 0 && scopeVal >= 0) {
      const pct = ((scopeVal / grandVal) * 100).toFixed(1);
      el.classList.add("ok");
      if (icon) icon.className = "fa-solid fa-chart-pie";
      el.lastChild.textContent = " " + pct + "% of total emissions";
    } else {
      el.classList.remove("ok");
      if (icon) icon.className = "fa-solid fa-circle-exclamation";
      el.lastChild.textContent = " No data entered yet";
    }
  }

  function bindLiveCalculation() {
    CATEGORIES.forEach((cat) => {
      const input = document.getElementById(cat.id);
      if (!input) return;
      input.addEventListener("input", () => {
        updateRowStatus(input);
        recalcAll();
      });
    });
  }

  /* ============================================================
     7. COMPANY INFORMATION — EDIT / SAVE / CANCEL
     ============================================================ */
  const COMPANY_FIELDS = ["company-name", "reporting-year", "reporting-period", "industry", "country", "business-unit"];
  let companySnapshot = {};
  let isEditingCompany = false;

  function setCompanyEditable(editable) {
    COMPANY_FIELDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === "SELECT") el.disabled = !editable;
      else el.readOnly = !editable;
    });
  }

  function bindCompanyInfoEditing() {
    const editBtn = document.getElementById("btn-edit-company");
    const cancelBtn = document.getElementById("btn-cancel-company");
    if (!editBtn) return;

    editBtn.addEventListener("click", () => {
      if (!isEditingCompany) {
        // Enter edit mode
        companySnapshot = {};
        COMPANY_FIELDS.forEach((id) => {
          const el = document.getElementById(id);
          if (el) companySnapshot[id] = el.value;
        });
        setCompanyEditable(true);
        isEditingCompany = true;
        editBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Details';
        if (cancelBtn) cancelBtn.style.display = "inline-flex";
        const nameField = document.getElementById("company-name");
        if (nameField) nameField.focus();
      } else {
        // Validate + Save
        const missing = COMPANY_FIELDS.filter((id) => {
          const el = document.getElementById(id);
          return el && el.value.trim() === "";
        });
        if (missing.length) {
          toast("Please fill in every company detail field before saving.", "error");
          return;
        }
        setCompanyEditable(false);
        isEditingCompany = false;
        editBtn.innerHTML = '<i class="fa-solid fa-pen"></i> Edit details';
        if (cancelBtn) cancelBtn.style.display = "none";
        toast("Company details updated successfully.", "success");
      }
    });

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        COMPANY_FIELDS.forEach((id) => {
          const el = document.getElementById(id);
          if (el && id in companySnapshot) el.value = companySnapshot[id];
        });
        setCompanyEditable(false);
        isEditingCompany = false;
        editBtn.innerHTML = '<i class="fa-solid fa-pen"></i> Edit details';
        cancelBtn.style.display = "none";
        toast("Changes discarded.", "info");
      });
    }
  }

  /* ============================================================
     8. BULK UPLOAD TEMPLATE (XLSX + CSV download)
     ============================================================ */
  const TEMPLATE_HEADERS = ["Scope", "Category", "Activity Data", "Unit", "Emission Factor", "Calculated Emissions", "Comments"];

  const TEMPLATE_ROWS = [
    ["Scope 1", "Company-Owned Vehicles", 26500, "litres diesel", 2.31, 61215.0, "Fleet of 42 vehicles"],
    ["Scope 1", "Stationary Combustion", 18200, "m3 natural gas", 1.89, 34398.0, "Boilers, on-site furnaces"],
    ["Scope 1", "Refrigerant Leakage", 42, "kg R-410A", 21.3, 894.6, "Pending HVAC audit sign-off"],
    ["Scope 2", "Purchased Electricity", 68500000, "kWh", 0.42, 28770000.0, "12 facilities, grid-supplied"],
    ["Scope 2", "Renewable Electricity", 12000000, "kWh (REC-backed)", 0, 0.0, "100% REC-backed, zero factor"],
    ["Scope 3", "Business Flights", 1450000, "passenger km", 0.15, 217500.0, "Corporate travel program"],
    ["Scope 3", "Freight & Logistics", 3200000, "tonne-km", 0.11, 352000.0, "Global distribution network"],
    ["Scope 3", "Accommodation", 4200, "room-nights", 21.4, 89880.0, "Hotel stays, business travel"],
    ["Scope 3", "Waste Generated", 980, "tonnes landfill", 467.0, 457660.0, "Landfill + treatment"],
    ["Scope 3", "Employee Commuting", 2100000, "passenger km", 0.12, 252000.0, "Survey-based estimate"],
    ["Scope 3", "Water Consumption", 58000, "m3", 0.15, 8700.0, "Facility water usage"]
  ];

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildTemplateCsv() {
    const rows = [TEMPLATE_HEADERS].concat(TEMPLATE_ROWS);
    const csv = rows
      .map((row) => row.map((cell) => {
        const s = String(cell);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(","))
      .join("\r\n");
    return new Blob([csv], { type: "text/csv;charset=utf-8;" });
  }

  function buildTemplateXlsx() {
    if (typeof XLSX === "undefined") return null;
    const wsData = [TEMPLATE_HEADERS].concat(TEMPLATE_ROWS);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 9 }, { wch: 26 }, { wch: 15 }, { wch: 16 }, { wch: 15 }, { wch: 20 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Emission Upload Template");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    return new Blob([out], { type: "application/octet-stream" });
  }

  function bindTemplateDownload() {
    const link = document.getElementById("link-download-template");
    if (!link) return;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      downloadBlob(buildTemplateCsv(), "aurex-emission-upload-template.csv");
      const xlsxBlob = buildTemplateXlsx();
      if (xlsxBlob) {
        setTimeout(() => downloadBlob(xlsxBlob, "aurex-emission-upload-template.xlsx"), 300);
      }
      toast("Bulk upload template downloaded (CSV + Excel).", "success");
    });
  }

  /* ============================================================
     9. BULK FILE UPLOAD — parse, validate, map
     ============================================================ */
  function findCategory(scopeLabel, categoryLabel) {
    const scopeNum = parseInt(String(scopeLabel).replace(/[^0-9]/g, ""), 10);
    const catNorm = String(categoryLabel).trim().toLowerCase();
    return CATEGORIES.find((c) => c.scope === scopeNum && c.label.toLowerCase() === catNorm);
  }

  function processUploadRows(rows) {
    // rows: array of objects keyed by header name
    const seen = new Set();
    let mapped = 0, skippedEmpty = 0, skippedDuplicate = 0, skippedUnknown = 0, skippedMissing = 0;

    rows.forEach((row) => {
      const scope = (row["Scope"] || "").toString().trim();
      const category = (row["Category"] || "").toString().trim();
      const calc = row["Calculated Emissions"];
      const comments = (row["Comments"] || "").toString().trim();

      if (!scope && !category && (calc === undefined || calc === "")) {
        skippedEmpty++;
        return;
      }
      if (!scope || !category || calc === undefined || calc === "" || calc === null) {
        skippedMissing++;
        return;
      }

      const key = scope.toLowerCase() + "|" + category.toLowerCase();
      if (seen.has(key)) {
        skippedDuplicate++;
        return;
      }
      seen.add(key);

      const match = findCategory(scope, category);
      if (!match) {
        skippedUnknown++;
        return;
      }

      const value = parseFloat(calc);
      if (isNaN(value) || value < 0) {
        skippedMissing++;
        return;
      }

      const input = document.getElementById(match.id);
      if (input) {
        input.value = value.toFixed(2);
        updateRowStatus(input);
      }
      if (comments) {
        const commentInput = document.getElementById(match.comment);
        if (commentInput) commentInput.value = comments;
      }
      mapped++;
    });

    recalcAll();

    const parts = [mapped + " row(s) mapped"];
    if (skippedDuplicate) parts.push(skippedDuplicate + " duplicate(s) skipped");
    if (skippedUnknown) parts.push(skippedUnknown + " unrecognized categor" + (skippedUnknown === 1 ? "y" : "ies") + " skipped");
    if (skippedMissing) parts.push(skippedMissing + " row(s) with missing/invalid values skipped");
    if (skippedEmpty) parts.push(skippedEmpty + " empty row(s) ignored");

    if (mapped > 0) {
      toast("Upload complete — " + parts.join(", ") + ".", "success");
    } else {
      toast("No valid rows found in the uploaded file. " + parts.join(", ") + ".", "error");
    }
  }

  function validateHeaders(fields) {
    const missing = TEMPLATE_HEADERS.filter((h) => fields.indexOf(h) === -1);
    return missing;
  }

  function handleUploadedFile(file) {
    const name = file.name.toLowerCase();
    const isCsv = name.endsWith(".csv");
    const isXlsx = name.endsWith(".xlsx");

    if (!isCsv && !isXlsx) {
      toast("Unsupported file type. Please upload a .csv or .xlsx file.", "error");
      return;
    }

    if (isCsv) {
      if (typeof Papa === "undefined") {
        toast("CSV parser failed to load. Please check your connection and try again.", "error");
        return;
      }
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const missingCols = validateHeaders(results.meta.fields || []);
          if (missingCols.length) {
            toast("The file is missing required column(s): " + missingCols.join(", ") + ".", "error");
            return;
          }
          processUploadRows(results.data);
        },
        error: () => toast("Could not read the CSV file. Please check the format and try again.", "error")
      });
    } else {
      if (typeof XLSX === "undefined") {
        toast("Excel parser failed to load. Please check your connection and try again.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
          const fields = json.length ? Object.keys(json[0]) : [];
          const missingCols = validateHeaders(fields);
          if (missingCols.length) {
            toast("The file is missing required column(s): " + missingCols.join(", ") + ".", "error");
            return;
          }
          processUploadRows(json);
        } catch (err) {
          toast("Could not read the Excel file. Please check the format and try again.", "error");
        }
      };
      reader.onerror = () => toast("Could not read the Excel file.", "error");
      reader.readAsArrayBuffer(file);
    }
  }

  function bindBulkUpload() {
    const uploadBtn = document.getElementById("btn-upload-file");
    const fileInput = document.getElementById("file-upload-input");
    if (!uploadBtn || !fileInput) return;

    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleUploadedFile(file);
      fileInput.value = ""; // allow re-selecting the same file later
    });
  }

  function bindManualEntryShortcut() {
    const btn = document.getElementById("btn-manual-entry");
    const target = document.getElementById("scope-accordion");
    if (!btn || !target) return;
    btn.addEventListener("click", () => target.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  /* ============================================================
     10. RESET FORM
     ============================================================ */
  function bindResetForm() {
    const btn = document.getElementById("btn-reset-form");
    if (!btn) return;
    btn.addEventListener("click", () => {
      confirmDialog({
        title: "Reset the entire form?",
        message: "This clears every emission value and comment you've entered, and removes any saved draft. This action cannot be undone.",
        confirmLabel: "Yes, reset form",
        cancelLabel: "Keep my data",
        onConfirm: () => {
          CATEGORIES.forEach((cat) => {
            const input = document.getElementById(cat.id);
            const commentInput = document.getElementById(cat.comment);
            if (input) { input.value = ""; updateRowStatus(input); }
            if (commentInput) commentInput.value = "";
          });
          recalcAll();
          sessionStorage.removeItem(DRAFT_KEY);
          setText("last-saved-note", "No draft saved yet");
          const note = document.getElementById("last-saved-note");
          if (note) note.innerHTML = '<i class="fa-solid fa-circle-info"></i> No draft saved yet';
          toast("Form has been reset.", "success");
        }
      });
    });
  }

  /* ============================================================
     11. SAVE DRAFT (sessionStorage) + auto-restore
     ============================================================ */
  function collectDraft() {
    const emissions = {};
    const comments = {};
    CATEGORIES.forEach((cat) => {
      const input = document.getElementById(cat.id);
      const commentInput = document.getElementById(cat.comment);
      emissions[cat.id] = input ? input.value : "";
      comments[cat.comment] = commentInput ? commentInput.value : "";
    });
    return {
      savedAt: new Date().toISOString(),
      emissions: emissions,
      comments: comments
    };
  }

  function applyDraft(draft) {
    if (!draft) return;
    CATEGORIES.forEach((cat) => {
      const input = document.getElementById(cat.id);
      const commentInput = document.getElementById(cat.comment);
      if (input && draft.emissions && cat.id in draft.emissions) {
        input.value = draft.emissions[cat.id];
        updateRowStatus(input);
      }
      if (commentInput && draft.comments && cat.comment in draft.comments) {
        commentInput.value = draft.comments[cat.comment];
      }
    });
    recalcAll();
  }

  function updateLastSavedNote(isoDate) {
    const note = document.getElementById("last-saved-note");
    if (!note) return;
    const d = new Date(isoDate);
    const stamp = d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    note.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--forest);"></i> Draft saved ' + stamp;
  }

  function bindSaveDraft() {
    const btn = document.getElementById("btn-save-draft");
    if (!btn) return;
    btn.addEventListener("click", () => {
      setButtonLoading(btn, true, "Saving…");
      setTimeout(() => {
        const draft = collectDraft();
        try {
          sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
          updateLastSavedNote(draft.savedAt);
          toast("Draft Saved Successfully.", "success");
        } catch (err) {
          toast("Could not save draft to this browser's session storage.", "error");
        }
        setButtonLoading(btn, false);
      }, 450);
    });
  }

  function restoreDraftOnLoad() {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      applyDraft(draft);
      updateLastSavedNote(draft.savedAt);
      toast("Restored your previously saved draft.", "info");
    } catch (err) {
      /* corrupted draft — ignore */
    }
  }

  /* ============================================================
     12. VALIDATE DATA
     ============================================================ */
  function validateAll() {
    const errors = [];

    CATEGORIES.forEach((cat) => {
      const input = document.getElementById(cat.id);
      if (!input) return;
      const raw = input.value.trim();
      if (raw === "") return; // optional fields, missing is not itself an error
      const n = parseFloat(raw);
      if (isNaN(n)) errors.push(cat.label + ": value is not a valid number.");
      else if (n < 0) errors.push(cat.label + ": negative emissions are not allowed.");
      updateRowStatus(input);
    });

    REQUIRED_IDS.forEach((id) => {
      const cat = CATEGORIES.find((c) => c.id === id);
      const input = document.getElementById(id);
      if (input && input.value.trim() === "") {
        errors.push((cat ? cat.label : id) + " is a required category and must be entered.");
      }
    });

    return errors;
  }

  function bindValidateData() {
    const btn = document.getElementById("btn-validate-data");
    if (!btn) return;
    btn.addEventListener("click", () => {
      setButtonLoading(btn, true, "Validating…");
      setTimeout(() => {
        const errors = validateAll();
        setButtonLoading(btn, false);
        if (errors.length) {
          confirmDialog({
            title: errors.length + " validation issue(s) found",
            message: "Please resolve the following before submitting:",
            list: errors.slice(0, 12),
            confirmLabel: "Got it",
            cancelLabel: "Dismiss"
          });
          toast("Validation found " + errors.length + " issue(s).", "error");
        } else {
          toast("Data Validation Successful.", "success");
        }
      }, 500);
    });
  }

  /* ============================================================
     13. SUBMIT EMISSIONS
     ============================================================ */
  function buildSubmissionPayload() {
    const company = {};
    COMPANY_FIELDS.forEach((id) => {
      const el = document.getElementById(id);
      company[id] = el ? el.value : "";
    });

    const scopeData = (n) => byScope(n).map((cat) => ({
      category: cat.label,
      emission: readValue(cat.id) || 0,
      comments: (document.getElementById(cat.comment) || {}).value || ""
    }));

    const t1 = scopeTotal(1), t2 = scopeTotal(2), t3 = scopeTotal(3);

    return {
      company: company,
      reportingYear: document.getElementById("reporting-year") ? document.getElementById("reporting-year").value : "",
      scope1: scopeData(1),
      scope2: scopeData(2),
      scope3: scopeData(3),
      subtotals: { scope1: t1, scope2: t2, scope3: t3 },
      grandTotal: t1 + t2 + t3,
      submissionDate: new Date().toISOString()
    };
  }

  function bindSubmitEmissions() {
    const btn = document.getElementById("btn-submit-emissions");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const errors = validateAll();
      if (errors.length) {
        toast("Please resolve " + errors.length + " validation issue(s) before submitting.", "error");
        return;
      }

      const grand = scopeTotal(1) + scopeTotal(2) + scopeTotal(3);
      confirmDialog({
        title: "Submit emissions?",
        message: "You're about to submit " + fmt(grand) + " tCO₂e for " +
          (document.getElementById("reporting-year") ? document.getElementById("reporting-year").value : "the selected period") +
          ". This cannot be undone.",
        confirmLabel: "Submit Emissions",
        cancelLabel: "Go back",
        onConfirm: () => {
          setButtonLoading(btn, true, "Submitting…");
          setTimeout(() => {
            const payload = buildSubmissionPayload();
            // Backend/database integration can be wired in here later.
            console.log("Net Zero Platform — Emission Submission Payload", payload);
            setButtonLoading(btn, false);
            sessionStorage.removeItem(DRAFT_KEY);
            updateLastSavedNote(new Date().toISOString());
            const note = document.getElementById("last-saved-note");
            if (note) note.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--forest);"></i> Submitted ' + new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
            toast("Emissions submitted successfully.", "success");

            // ===== REDIRECT TO REDUCTION PLANNER =====
            window.location.href = 'reduction-planner.html';

          }, 700);
        }
      });
    });
  }

  /* ============================================================
     INIT
     ============================================================ */
  document.addEventListener("DOMContentLoaded", () => {
    CATEGORIES.forEach((cat) => {
      const input = document.getElementById(cat.id);
      if (input) updateRowStatus(input);
    });

    bindLiveCalculation();
    bindCompanyInfoEditing();
    bindTemplateDownload();
    bindBulkUpload();
    bindManualEntryShortcut();
    bindResetForm();
    bindSaveDraft();
    bindValidateData();
    bindSubmitEmissions();

    restoreDraftOnLoad();
    recalcAll();
  });
})();