(function () {
  "use strict";

  var DATA = window.BIMAFY_PLANS || { plans: [] };
  var PLANS = DATA.plans;

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  function fmt(n) { return "৳" + Math.round(n || 0).toLocaleString("en-US"); }
  function fmtText(n) { return "BDT " + Math.round(n || 0).toLocaleString("en-US"); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function addDaysISO(iso, days) { var d = new Date(iso); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
  function fmtDatePretty(iso) {
    if (!iso) return "—";
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  }
  function lakh(n) {
    // 100000 -> "1 Lakh", 150000 -> "1.5 Lakh", 50000 -> "50,000"
    if (n >= 100000) return (n / 100000).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " Lakh";
    return n.toLocaleString("en-US");
  }

  var COMPANY_COLORS = {
    "Chartered Life Insurance": "#1d5fa7",
    "Pragati Life Insurance": "#0f766e",
    "Guardian Life Insurance": "#b45309",
    "Green Delta Insurance": "#15803d"
  };
  function companyInitials(name) {
    return name.split(/\s+/).filter(function (w) { return /^[A-Z]/.test(w) && !/^(Life|Insurance|PLC)/.test(w); })
      .slice(0, 2).map(function (w) { return w[0]; }).join("");
  }
  function planName(p) { return p.name || "Cashless Health Plan — " + lakh(p.ipd); }
  function premiumPerYear(p) { return p.premium / (p.periodYears || 1); }
  function termText(p) { return p.periodYears > 1 ? p.periodYears + " years" : "1 year"; }

  // Core benefits, in display order. Blank means "not listed", not "not covered".
  var BENEFITS = [
    { key: "ipd", label: "Hospitalization (IPD)", sub: "per insured, per year" },
    { key: "opd", label: "Outpatient (OPD)", sub: "doctor visits, tests, medicines" },
    { key: "life", label: "Term life", sub: "paid to nominee on death" },
    { key: "ci", label: "Critical illness", noteKey: "ciNote" },
    { key: "disability", label: "Disability", sub: "permanent total / partial" }
  ];
  var FILTERS = [
    { key: "ipd", label: "Hospitalization" },
    { key: "opd", label: "OPD" },
    { key: "life", label: "Term life" },
    { key: "ci", label: "Critical illness" },
    { key: "disability", label: "Disability" },
    { key: "cashless", label: "Cashless" }
  ];
  function hasBenefit(p, key) { return key === "cashless" ? !!p.cashless : !!p[key]; }

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  var state = {
    company: "",
    sort: "premium-asc",
    mustHave: {},
    selected: [], // plan ids in the order they were picked
    meta: { client: "", preparedBy: "", date: todayISO(), validUntil: addDaysISO(todayISO(), 30), persons: 1 }
  };
  var currentQuote = null;

  // ---------------------------------------------------------------
  // Plan cards
  // ---------------------------------------------------------------
  function visiblePlans() {
    var list = PLANS.filter(function (p) {
      if (state.company && p.company !== state.company) return false;
      return Object.keys(state.mustHave).every(function (k) { return !state.mustHave[k] || hasBenefit(p, k); });
    });
    var s = state.sort;
    list.sort(function (a, b) {
      if (s === "premium-desc") return premiumPerYear(b) - premiumPerYear(a);
      if (s === "ipd-desc") return (b.ipd || 0) - (a.ipd || 0) || premiumPerYear(a) - premiumPerYear(b);
      if (s === "life-desc") return (b.life || 0) - (a.life || 0) || premiumPerYear(a) - premiumPerYear(b);
      return premiumPerYear(a) - premiumPerYear(b);
    });
    return list;
  }

  function highlightsHTML(p) {
    var h = "";
    BENEFITS.forEach(function (b) {
      if (!p[b.key]) return;
      var sub = b.noteKey && p[b.noteKey] ? p[b.noteKey] : b.sub;
      h += '<li><span class="h-label">' + escapeHtml(b.label) + (sub ? "<small>" + escapeHtml(sub) + "</small>" : "") +
        '</span><span class="h-value">' + fmt(p[b.key]) + "</span></li>";
    });
    (p.extras || []).forEach(function (x) {
      h += '<li class="h-extra"><span class="h-label">' + escapeHtml(x[0]) + '</span><span class="h-value">' +
        (x[1] ? fmt(x[1]) : "Included") + "</span></li>";
    });
    return h;
  }

  function cardHTML(p) {
    var sel = state.selected.indexOf(p.id) !== -1;
    var color = COMPANY_COLORS[p.company] || "#12283f";
    var price = p.periodYears > 1
      ? '<span class="amount">' + fmt(p.premium) + '</span><span class="period">for ' + p.periodYears + " years</span>" +
        '<div class="per-year">≈ ' + fmt(premiumPerYear(p)) + " per year, per person</div>"
      : '<span class="amount">' + fmt(p.premium) + '</span><span class="period">/ year</span><div class="per-year">per person</div>';
    var badges = "";
    if (p.cashless) badges += '<span class="badge badge-cashless">Cashless hospital service</span>';
    if (p.periodYears > 1) badges += '<span class="badge badge-term">' + p.periodYears + "-year policy</span>";
    return '<article class="plan-card' + (sel ? " selected" : "") + '" data-id="' + p.id + '">' +
      '<div class="plan-head"><div class="company-mark" style="background:' + color + '">' + escapeHtml(companyInitials(p.company)) + "</div>" +
        '<div><div class="plan-company">' + escapeHtml(p.company) + '</div><div class="plan-name">' + escapeHtml(planName(p)) + "</div></div></div>" +
      '<div class="plan-price">' + price + "</div>" +
      (badges ? '<div class="badges">' + badges + "</div>" : "") +
      '<ul class="highlights">' + highlightsHTML(p) + "</ul>" +
      '<button type="button" class="select-btn" aria-pressed="' + sel + '">' + (sel ? "✓ Selected" : "Select for quotation") + "</button>" +
      "</article>";
  }

  function renderGrid() {
    var list = visiblePlans();
    var grid = document.getElementById("plans-grid");
    grid.innerHTML = list.length
      ? list.map(cardHTML).join("")
      : '<div class="empty-state">No plans match these filters. Try removing a "Must include" option.</div>';
    document.getElementById("results-line").textContent =
      "Showing " + list.length + " of " + PLANS.length + " plans. Premiums are per person.";
    renderTray();
  }

  function toggleSelect(id) {
    var i = state.selected.indexOf(id);
    if (i === -1) state.selected.push(id); else state.selected.splice(i, 1);
    var card = document.querySelector('.plan-card[data-id="' + id + '"]');
    if (card) card.outerHTML = cardHTML(PLANS.filter(function (p) { return p.id === id; })[0]);
    renderTray();
  }

  function renderTray() {
    var n = state.selected.length;
    document.getElementById("select-tray").classList.toggle("hidden", n === 0);
    document.getElementById("tray-count").textContent = n;
    document.getElementById("tray-label").textContent = n === 1 ? "plan selected" : "plans selected";
  }

  function selectedPlans() {
    return state.selected.map(function (id) { return PLANS.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean);
  }

  // ---------------------------------------------------------------
  // Toolbar
  // ---------------------------------------------------------------
  function initToolbar() {
    var companySel = document.getElementById("filter-company");
    PLANS.map(function (p) { return p.company; })
      .filter(function (c, i, arr) { return arr.indexOf(c) === i; })
      .sort()
      .forEach(function (c) {
        var o = document.createElement("option"); o.value = c; o.textContent = c; companySel.appendChild(o);
      });
    companySel.addEventListener("change", function () { state.company = companySel.value; renderGrid(); });
    document.getElementById("sort-by").addEventListener("change", function (e) { state.sort = e.target.value; renderGrid(); });

    var chips = document.getElementById("must-have-chips");
    FILTERS.forEach(function (f) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = f.label; b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () {
        state.mustHave[f.key] = !state.mustHave[f.key];
        b.setAttribute("aria-pressed", String(!!state.mustHave[f.key]));
        renderGrid();
      });
      chips.appendChild(b);
    });

    document.getElementById("plans-grid").addEventListener("click", function (e) {
      var btn = e.target.closest(".select-btn");
      if (!btn) return;
      toggleSelect(btn.closest(".plan-card").dataset.id);
    });
    document.getElementById("source-note").textContent =
      "Source: " + (DATA.sourceNote || "Bimafy plan list") + ". A benefit that is not shown was not listed for that plan — confirm with the insurer before promising it.";
  }

  // ---------------------------------------------------------------
  // Quotation details dialog
  // ---------------------------------------------------------------
  function openModal() {
    var plans = selectedPlans();
    document.getElementById("quote-modal-summary").textContent =
      plans.length + (plans.length === 1 ? " plan" : " plans") + " selected: " + plans.map(planName).join(", ") + ".";
    var m = state.meta;
    document.getElementById("q-client").value = m.client;
    document.getElementById("q-preparedby").value = m.preparedBy;
    document.getElementById("q-date").value = m.date;
    document.getElementById("q-validuntil").value = m.validUntil;
    document.getElementById("q-persons").value = m.persons;
    document.getElementById("quote-modal").classList.remove("hidden");
    document.getElementById("q-client").focus();
  }
  function closeModal() { document.getElementById("quote-modal").classList.add("hidden"); }
  function readModal() {
    var m = state.meta;
    m.client = document.getElementById("q-client").value.trim();
    m.preparedBy = document.getElementById("q-preparedby").value.trim();
    m.date = document.getElementById("q-date").value;
    m.validUntil = document.getElementById("q-validuntil").value;
    m.persons = Math.max(1, parseInt(document.getElementById("q-persons").value, 10) || 1);
  }

  // ---------------------------------------------------------------
  // Quotation
  // ---------------------------------------------------------------
  function planBullets(p) {
    var out = [];
    BENEFITS.forEach(function (b) {
      if (!p[b.key]) return;
      out.push(b.label + ": " + fmtText(p[b.key]) + (b.noteKey && p[b.noteKey] ? " (" + p[b.noteKey] + ")" : ""));
    });
    (p.extras || []).forEach(function (x) { out.push(x[0] + (x[1] ? ": " + fmtText(x[1]) : ": included")); });
    if (p.cashless) out.push("Cashless hospital service available");
    out.push("Policy term: " + termText(p));
    return out;
  }

  function quoteHTML() {
    var m = state.meta, plans = selectedPlans(), n = m.persons;
    var h = "<h1>Health Insurance Plan Options</h1>" +
      '<div class="q-subtitle">Prepared by Bimafy</div>' +
      '<div class="quotation-meta-grid">' +
        "<div><span>Client:</span> <strong>" + escapeHtml(m.client || "—") + "</strong></div>" +
        "<div><span>Prepared by:</span> " + escapeHtml(m.preparedBy || "—") + "</div>" +
        "<div><span>Date:</span> " + fmtDatePretty(m.date) + "</div>" +
        "<div><span>Valid until:</span> " + fmtDatePretty(m.validUntil) + "</div>" +
        "<div><span>Persons to insure:</span> " + n + "</div>" +
        "<div><span>Options offered:</span> " + plans.length + "</div>" +
      "</div>";

    // Comparison table
    h += '<div class="q-section-title">Plan comparison</div><div class="cmp-wrap"><table class="cmp-table' + (plans.length > 4 ? " cmp-many" : "") + '"><thead><tr><th></th>';
    plans.forEach(function (p, i) {
      h += '<th><span class="cmp-company">Option ' + (i + 1) + " · " + escapeHtml(p.company) + '</span><span class="cmp-plan">' + escapeHtml(planName(p)) + "</span></th>";
    });
    h += "</tr></thead><tbody>";
    h += '<tr class="cmp-premium"><td>Premium per person</td>' + plans.map(function (p) {
      return "<td>" + fmt(p.premium) + (p.periodYears > 1 ? "<br><small>for " + p.periodYears + " years</small>" : "<br><small>per year</small>") + "</td>";
    }).join("") + "</tr>";
    BENEFITS.forEach(function (b) {
      if (!plans.some(function (p) { return p[b.key]; })) return;
      h += "<tr><td>" + escapeHtml(b.label) + "</td>" + plans.map(function (p) {
        return "<td>" + (p[b.key] ? fmt(p[b.key]) + (b.noteKey && p[b.noteKey] ? "<br><small>" + escapeHtml(p[b.noteKey]) + "</small>" : "") : "—") + "</td>";
      }).join("") + "</tr>";
    });
    if (plans.some(function (p) { return p.cashless; })) {
      h += "<tr><td>Cashless hospital service</td>" + plans.map(function (p) { return "<td>" + (p.cashless ? "Yes" : "—") + "</td>"; }).join("") + "</tr>";
    }
    if (plans.some(function (p) { return p.periodYears > 1; })) {
      h += "<tr><td>Policy term</td>" + plans.map(function (p) { return "<td>" + termText(p) + "</td>"; }).join("") + "</tr>";
    }
    h += '<tr class="cmp-total"><td>Total premium for ' + n + (n === 1 ? " person" : " persons") + "</td>" +
      plans.map(function (p) { return "<td>" + fmt(p.premium * n) + "</td>"; }).join("") + "</tr>";
    h += "</tbody></table></div>";

    // Per-plan highlight boxes
    h += '<div class="q-section-title q-details-title">Coverage highlights</div><div class="q-plan-boxes">';
    plans.forEach(function (p, i) {
      h += '<div class="q-plan-box"><div class="q-detail-title">Option ' + (i + 1) + ": " + escapeHtml(p.company) + " — " + escapeHtml(planName(p)) + "</div>" +
        '<div class="q-plan-price">' + fmt(p.premium) + " per person " + (p.periodYears > 1 ? "for " + p.periodYears + " years" : "per year") + "</div>" +
        "<ul>" + planBullets(p).map(function (b) { return "<li>" + escapeHtml(b) + "</li>"; }).join("") + "</ul></div>";
    });
    h += "</div>";

    h += '<div class="q-terms">' + TERMS.map(function (t) { return "<div>* " + escapeHtml(t) + "</div>"; }).join("") + "</div>" +
      '<div class="q-footer">Bimafy Ltd — this quotation is generated for proposal purposes and is not a policy document.</div>';
    return h;
  }

  var TERMS = [
    "Premiums are per person and payable in advance for the policy term shown.",
    "“—” means the benefit is not listed for that plan; it may still be available — please ask us to confirm.",
    "Coverage is subject to each insurer's policy wording, waiting periods and exclusions (e.g. pre-existing conditions).",
    "Prices shown are exclusive of applicable tax/VAT unless stated. This quotation is indicative and subject to the insurer's acceptance."
  ];

  function quoteText(withDetails) {
    var m = state.meta, plans = selectedPlans(), n = m.persons, L = [];
    L.push("Health Insurance Plan Options");
    L.push("Client: " + (m.client || "-"));
    L.push("Prepared by: " + (m.preparedBy || "-") + " | Date: " + fmtDatePretty(m.date) + " | Valid until: " + fmtDatePretty(m.validUntil));
    L.push("Persons to insure: " + n);
    L.push("");
    plans.forEach(function (p, i) {
      L.push("OPTION " + (i + 1) + ": " + p.company + " — " + planName(p));
      L.push("Premium: " + fmtText(p.premium) + " per person " + (p.periodYears > 1 ? "for " + p.periodYears + " years" : "per year") +
        (n > 1 ? " (total " + fmtText(p.premium * n) + " for " + n + " persons)" : ""));
      if (withDetails) planBullets(p).forEach(function (b) { L.push("  - " + b); });
      L.push("");
    });
    TERMS.forEach(function (t) { L.push("* " + t); });
    return L.join("\n");
  }

  // Browsers use document.title as the default "Save as PDF" file name.
  var APP_TITLE = document.title;
  function quoteFileName() {
    var c = (state.meta.client || "").replace(/[\\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
    return (c ? c + " - " : "") + "Health Insurance Plan Options" + (state.meta.date ? " - " + state.meta.date : "");
  }

  function showQuotation() {
    currentQuote = true;
    document.title = quoteFileName();
    document.getElementById("quotation-sheet").innerHTML = quoteHTML();
    document.getElementById("send-status").textContent = "";
    document.getElementById("plans-shell").classList.add("hidden");
    document.getElementById("select-tray").classList.add("hidden");
    document.getElementById("quotation-view").classList.remove("hidden");
    window.scrollTo(0, 0);
  }
  function hideQuotation() {
    document.title = APP_TITLE;
    document.getElementById("quotation-view").classList.add("hidden");
    document.getElementById("plans-shell").classList.remove("hidden");
    renderTray();
  }

  // ---------------------------------------------------------------
  // Sending (email / WhatsApp / copy)
  // ---------------------------------------------------------------
  function sendStatus(msg) { document.getElementById("send-status").textContent = msg; }
  function composeMessage(maxLen) {
    var name = document.getElementById("send-name").value.trim();
    var greeting = (name ? "Dear " + name + ",\n\n" : "Hello,\n\n") + "Please find the health insurance options we recommend below.\n\n";
    var full = greeting + quoteText(true);
    if (encodeURIComponent(full).length <= maxLen) return { text: full, shortened: false };
    return { text: greeting + quoteText(false) + "\n\nFull coverage details are in the PDF quotation.", shortened: true };
  }
  function sendByEmail() {
    var to = document.getElementById("send-email").value.trim();
    if (!to) { sendStatus("Enter the recipient's email address first."); return; }
    var msg = composeMessage(1800);
    var subject = "Health insurance options" + (state.meta.client ? " for " + state.meta.client : "");
    window.location.href = "mailto:" + encodeURIComponent(to) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(msg.text);
    sendStatus("Your email app should open with the quotation filled in" + (msg.shortened ? " (summary only because of email length limits — attach the PDF for full details)." : "."));
  }
  function sendByWhatsApp() {
    var digits = document.getElementById("send-phone").value.replace(/\D/g, "");
    if (/^0\d{10}$/.test(digits)) digits = "88" + digits;
    var msg = composeMessage(6000);
    window.open("https://wa.me/" + digits + "?text=" + encodeURIComponent(msg.text), "_blank");
    sendStatus(digits ? "WhatsApp should open with the quotation filled in." : "WhatsApp should open so you can choose the recipient.");
  }
  function copyQuoteText() {
    var text = composeMessage(1e9).text;
    var done = function () { sendStatus("Quotation text copied. Paste it into any email or chat."); };
    var fallback = function () {
      var ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { sendStatus("Copy failed — select the quotation and copy it manually."); }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  // ---------------------------------------------------------------
  // Wire up
  // ---------------------------------------------------------------
  function init() {
    initToolbar();
    renderGrid();
    document.getElementById("tray-clear").addEventListener("click", function () { state.selected = []; renderGrid(); });
    document.getElementById("tray-build").addEventListener("click", openModal);
    document.getElementById("quote-modal-cancel").addEventListener("click", closeModal);
    document.getElementById("quote-modal").addEventListener("click", function (e) { if (e.target.id === "quote-modal") closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
    document.getElementById("quote-modal-go").addEventListener("click", function () { readModal(); closeModal(); showQuotation(); });
    document.getElementById("quotation-back-btn").addEventListener("click", hideQuotation);
    document.getElementById("quotation-print-btn").addEventListener("click", function () { window.print(); });
    document.getElementById("send-email-btn").addEventListener("click", sendByEmail);
    document.getElementById("send-wa-btn").addEventListener("click", sendByWhatsApp);
    document.getElementById("send-copy-btn").addEventListener("click", copyQuoteText);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
