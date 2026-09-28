(function () {
  "use strict";

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return "\u09F30";
    return "\u09F3" + Math.round(n).toLocaleString("en-US");
  }
  function fmt2(n) {
    if (n === null || n === undefined || isNaN(n)) return "0";
    return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function parseAgeYears(text) {
    if (!text) return null;
    var y = 0, m = 0, d = 0;
    var my = text.match(/(\d+)\s*y/);
    var mm = text.match(/(\d+)\s*m/);
    var md = text.match(/(\d+)\s*d/);
    if (my) y = parseInt(my[1], 10);
    if (mm) m = parseInt(mm[1], 10);
    if (md) d = parseInt(md[1], 10);
    return y + m / 12 + d / 365;
  }
  function todayISO() {
    var d = new Date();
    return d.toISOString().slice(0, 10);
  }
  function addDaysISO(iso, days) {
    var d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function fmtDatePretty(iso) {
    if (!iso) return "\u2014";
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  }

  var COMBO_LABELS = {
    one_adult: "Self only",
    two_adult: "Self + Spouse",
    one_adult_one_child: "Self + 1 Child",
    one_adult_two_child: "Self + 2 Children",
    two_adult_one_child: "Self + Spouse + 1 Child",
    two_adult_two_child: "Self + Spouse + 2 Children",
    one_adult_father: "Father",
    one_adult_mother: "Mother",
    two_adult_parents: "Parents"
  };
  var COMBO_ORDER = Object.keys(COMBO_LABELS);

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  var state = {
    meta: {
      client: "",
      preparedBy: "",
      date: todayISO(),
      validUntil: addDaysISO(todayISO(), 30),
      anonymize: true,
      threshold: 10
    },
    census: {
      employees: 0,
      spouses: 0,
      children: 0,
      maternity: 0,
      overrideEnabled: false,
      overrideValue: 0
    },
    mode: "group",
    group: {
      insurerId: null,
      benefits: {} // benefitId -> { included, sumAssured, rate, loadingId, eligibleOverrideEnabled, eligibleOverrideValue }
    },
    retail: {
      roster: [] // { id, name, age, insuranceFor, productType, minCoverage, selectedKey }
    }
  };
  var rosterSeq = 1;

  // ---------------------------------------------------------------
  // Census computations
  // ---------------------------------------------------------------
  function allInsuredCount() {
    if (state.census.overrideEnabled) return state.census.overrideValue;
    return (state.census.employees || 0) + (state.census.spouses || 0) + (state.census.children || 0);
  }
  function eligibleCountFor(eligibility) {
    switch (eligibility) {
      case "employees": return state.census.employees || 0;
      case "all_insured": return allInsuredCount();
      case "maternity_eligible": return state.census.maternity || 0;
      default: return 0;
    }
  }
  function totalHeadcount() {
    return (state.census.employees || 0);
  }

  // ---------------------------------------------------------------
  // Group mode: benefit row calculations
  // ---------------------------------------------------------------
  function currentInsurer() {
    var list = (window.GROUP_RATE_CARDS && window.GROUP_RATE_CARDS.insurers) || [];
    return list.find(function (i) { return i.id === state.group.insurerId; }) || list[0];
  }
  function rowState(benefitId) {
    if (!state.group.benefits[benefitId]) state.group.benefits[benefitId] = {};
    return state.group.benefits[benefitId];
  }
  function initRowDefaults(insurer) {
    insurer.benefits.forEach(function (b) {
      var rs = rowState(b.id);
      if (rs.included === undefined) rs.included = !b.optional;
      if (rs.sumAssured === undefined && b.sumAssured) rs.sumAssured = b.sumAssured.default;
      if (rs.rate === undefined) rs.rate = b.rate.default;
      if (rs.loadingId === undefined) rs.loadingId = "single";
      if (rs.eligibleOverrideEnabled === undefined) rs.eligibleOverrideEnabled = false;
      if (rs.eligibleOverrideValue === undefined) rs.eligibleOverrideValue = 0;
    });
  }
  function loadingMultiplier(insurer, loadingId) {
    var opt = (insurer.familyLoading.options || []).find(function (o) { return o.id === loadingId; });
    return opt ? opt.multiplier : 1;
  }
  function computeBenefitRow(insurer, b) {
    var rs = rowState(b.id);
    var eligible = rs.eligibleOverrideEnabled ? rs.eligibleOverrideValue : eligibleCountFor(b.eligibility);
    var perMember;
    if (b.rateBasis === "per_mille") {
      perMember = (rs.sumAssured / 1000) * rs.rate;
    } else {
      perMember = rs.rate;
    }
    var mult = loadingMultiplier(insurer, rs.loadingId);
    var perMemberLoaded = perMember * mult;
    var total = rs.included ? perMemberLoaded * eligible : 0;
    return { eligible: eligible, perMember: perMemberLoaded, total: total };
  }
  function groupGrandTotal() {
    var insurer = currentInsurer();
    if (!insurer) return 0;
    var sum = 0;
    insurer.benefits.forEach(function (b) {
      sum += computeBenefitRow(insurer, b).total;
    });
    return sum;
  }

  // ---------------------------------------------------------------
  // Rendering: proposal meta / mode tabs / census
  // ---------------------------------------------------------------
  function bindMeta() {
    var ids = ["client", "preparedby", "date", "validuntil"];
    document.getElementById("meta-client").value = state.meta.client;
    document.getElementById("meta-preparedby").value = state.meta.preparedBy;
    document.getElementById("meta-date").value = state.meta.date;
    document.getElementById("meta-validuntil").value = state.meta.validUntil;
    document.getElementById("meta-anonymize").checked = state.meta.anonymize;
    document.getElementById("meta-threshold").value = state.meta.threshold;

    document.getElementById("meta-client").addEventListener("input", function (e) { state.meta.client = e.target.value; });
    document.getElementById("meta-preparedby").addEventListener("input", function (e) { state.meta.preparedBy = e.target.value; });
    document.getElementById("meta-date").addEventListener("input", function (e) { state.meta.date = e.target.value; });
    document.getElementById("meta-validuntil").addEventListener("input", function (e) { state.meta.validUntil = e.target.value; });
    document.getElementById("meta-anonymize").addEventListener("change", function (e) { state.meta.anonymize = e.target.checked; });
    document.getElementById("meta-threshold").addEventListener("input", function (e) {
      state.meta.threshold = parseInt(e.target.value, 10) || 1;
      updateModeSuggestion();
    });
  }

  function updateModeSuggestion() {
    var n = totalHeadcount();
    var suggested = n >= state.meta.threshold ? "Group Proposal" : "Retail Quote";
    document.getElementById("mode-suggestion").textContent =
      n > 0 ? suggested + " (" + n + " employees entered)" : "\u2014 enter employee count \u2014";
  }

  function switchMode(mode) {
    state.mode = mode;
    document.querySelectorAll(".mode-tab").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    document.getElementById("mode-group").classList.toggle("hidden", mode !== "group");
    document.getElementById("mode-retail").classList.toggle("hidden", mode !== "retail");
  }

  function bindCensus() {
    ["employees", "spouses", "children", "maternity"].forEach(function (key) {
      var input = document.getElementById("census-" + key);
      input.value = state.census[key];
      input.addEventListener("input", function () {
        state.census[key] = parseInt(input.value, 10) || 0;
        renderCensusTotals();
        renderBenefitsTable();
        updateModeSuggestion();
      });
    });
    var overrideToggle = document.getElementById("census-override-toggle");
    var overrideWrap = document.getElementById("census-override-wrap");
    var overrideInput = document.getElementById("census-override");
    overrideToggle.addEventListener("change", function () {
      state.census.overrideEnabled = overrideToggle.checked;
      overrideWrap.classList.toggle("hidden", !overrideToggle.checked);
      renderCensusTotals();
      renderBenefitsTable();
    });
    overrideInput.addEventListener("input", function () {
      state.census.overrideValue = parseInt(overrideInput.value, 10) || 0;
      renderCensusTotals();
      renderBenefitsTable();
    });
  }
  function renderCensusTotals() {
    document.getElementById("census-total-insured").textContent = allInsuredCount();
  }

  // ---------------------------------------------------------------
  // Rendering: insurer select + benefits table
  // ---------------------------------------------------------------
  function renderInsurerSelect() {
    var sel = document.getElementById("insurer-select");
    var list = (window.GROUP_RATE_CARDS && window.GROUP_RATE_CARDS.insurers) || [];
    sel.innerHTML = "";
    list.forEach(function (i) {
      var o = document.createElement("option");
      o.value = i.id;
      o.textContent = i.displayName + " (internal label \u2014 hidden from client if anonymized)";
      sel.appendChild(o);
    });
    if (!state.group.insurerId && list.length) state.group.insurerId = list[0].id;
    sel.value = state.group.insurerId;
    sel.addEventListener("change", function () {
      state.group.insurerId = sel.value;
      var insurer = currentInsurer();
      initRowDefaults(insurer);
      renderInsurerNote();
      renderBenefitsTable();
    });
    renderInsurerNote();
  }
  function renderInsurerNote() {
    var insurer = currentInsurer();
    document.getElementById("insurer-note").textContent = insurer ? insurer.sourceNote : "";
  }

  function renderBenefitsTable() {
    var insurer = currentInsurer();
    if (!insurer) return;
    initRowDefaults(insurer);
    var tbody = document.getElementById("benefits-body");
    tbody.innerHTML = "";

    var categories = [];
    insurer.benefits.forEach(function (b) { if (categories.indexOf(b.category) === -1) categories.push(b.category); });

    categories.forEach(function (cat) {
      var catRow = el("tr", "");
      catRow.innerHTML = '<td colspan="8" style="background:#f7fafc;font-weight:700;color:#0f766e;">' + escapeHtml(cat) + "</td>";
      tbody.appendChild(catRow);

      insurer.benefits.filter(function (b) { return b.category === cat; }).forEach(function (b) {
        tbody.appendChild(buildBenefitRow(insurer, b));
      });
    });

    updateBenefitsComputedCells(insurer);
  }

  function buildBenefitRow(insurer, b) {
    var rs = rowState(b.id);
    var tr = el("tr");
    tr.dataset.benefitId = b.id;

    // include checkbox
    var tdCheck = el("td");
    var chk = el("input");
    chk.type = "checkbox";
    chk.checked = rs.included;
    chk.addEventListener("change", function () { rs.included = chk.checked; updateBenefitsComputedCells(insurer); });
    tdCheck.appendChild(chk);
    tr.appendChild(tdCheck);

    // label + note
    var tdLabel = el("td");
    var wrap = el("div", "benefit-label-cell");
    wrap.appendChild(el("div", "", "<strong>" + escapeHtml(b.label) + "</strong>" + (b.optional ? ' <span style="color:#6b7684;font-weight:400;">(optional rider)</span>' : "")));
    var toggle = el("div", "note-toggle", "why this range?");
    var noteBox = el("div", "benefit-note hidden", escapeHtml(b.note));
    toggle.addEventListener("click", function () { noteBox.classList.toggle("hidden"); });
    wrap.appendChild(toggle);
    wrap.appendChild(noteBox);
    tdLabel.appendChild(wrap);
    tr.appendChild(tdLabel);

    // sum assured
    var tdSA = el("td");
    if (b.rateBasis === "per_mille") {
      var saInput = el("input");
      saInput.type = "number";
      saInput.min = b.sumAssured.min;
      saInput.max = b.sumAssured.max;
      saInput.step = b.sumAssured.step || 1000;
      saInput.value = rs.sumAssured;
      saInput.addEventListener("input", function () {
        rs.sumAssured = parseFloat(saInput.value) || 0;
        updateBenefitsComputedCells(insurer);
      });
      tdSA.appendChild(saInput);
    } else {
      tdSA.innerHTML = '<span style="color:#6b7684;">flat rate</span>';
    }
    tr.appendChild(tdSA);

    // rate slider
    var tdRate = el("td");
    var rateCell = el("div", "rate-cell");
    var slider = el("input");
    slider.type = "range";
    slider.min = b.rate.min;
    slider.max = b.rate.max;
    slider.step = (b.rate.max - b.rate.min) > 20 ? 1 : 0.01;
    slider.value = rs.rate;
    var num = el("input");
    num.type = "number";
    num.min = b.rate.min;
    num.max = b.rate.max;
    num.step = slider.step;
    num.value = rs.rate;
    slider.addEventListener("input", function () { rs.rate = parseFloat(slider.value); num.value = rs.rate; updateBenefitsComputedCells(insurer); });
    num.addEventListener("input", function () { rs.rate = parseFloat(num.value) || 0; slider.value = rs.rate; updateBenefitsComputedCells(insurer); });
    rateCell.appendChild(slider);
    rateCell.appendChild(num);
    tdRate.appendChild(rateCell);
    var rangeHint = el("div", "", '<span style="font-size:10px;color:#6b7684;">range ' + fmt2(b.rate.min) + '\u2013' + fmt2(b.rate.max) + (b.rateBasis === "per_mille" ? " /mille" : " flat/member") + '</span>');
    tdRate.appendChild(rangeHint);
    tr.appendChild(tdRate);

    // family loading
    var tdLoad = el("td");
    var loadSel = el("select");
    insurer.familyLoading.options.forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o.id; opt.textContent = o.label;
      loadSel.appendChild(opt);
    });
    loadSel.value = rs.loadingId;
    loadSel.addEventListener("change", function () { rs.loadingId = loadSel.value; updateBenefitsComputedCells(insurer); });
    tdLoad.appendChild(loadSel);
    tr.appendChild(tdLoad);

    // eligible members
    var tdElig = el("td");
    var eligDisplay = el("div", "elig-display");
    tdElig.appendChild(eligDisplay);
    var overrideLbl = el("label", "checkbox-row", "");
    overrideLbl.style.fontSize = "11px";
    var overrideChk = el("input");
    overrideChk.type = "checkbox";
    overrideChk.checked = rs.eligibleOverrideEnabled;
    var overrideNum = el("input");
    overrideNum.type = "number";
    overrideNum.min = 0;
    overrideNum.value = rs.eligibleOverrideValue;
    overrideNum.style.width = "70px";
    overrideNum.style.display = rs.eligibleOverrideEnabled ? "inline-block" : "none";
    overrideChk.addEventListener("change", function () {
      rs.eligibleOverrideEnabled = overrideChk.checked;
      overrideNum.style.display = rs.eligibleOverrideEnabled ? "inline-block" : "none";
      updateBenefitsComputedCells(insurer);
    });
    overrideNum.addEventListener("input", function () {
      rs.eligibleOverrideValue = parseInt(overrideNum.value, 10) || 0;
      updateBenefitsComputedCells(insurer);
    });
    overrideLbl.appendChild(overrideChk);
    overrideLbl.appendChild(document.createTextNode(" override"));
    tdElig.appendChild(overrideLbl);
    tdElig.appendChild(overrideNum);
    tr.appendChild(tdElig);

    // premium per member
    var tdPerMember = el("td", "cell-per-member");
    tr.appendChild(tdPerMember);

    // total premium
    var tdTotal = el("td", "cell-total");
    tr.appendChild(tdTotal);

    return tr;
  }

  function updateBenefitsComputedCells(insurer) {
    insurer.benefits.forEach(function (b) {
      var tr = document.querySelector('tr[data-benefit-id="' + b.id + '"]');
      if (!tr) return;
      var computed = computeBenefitRow(insurer, b);
      var eligDisplay = tr.querySelector(".elig-display");
      var warnText = (b.minEligible && computed.eligible > 0 && computed.eligible < b.minEligible)
        ? " ⚠ below usual min. of " + b.minEligible : "";
      eligDisplay.innerHTML = computed.eligible + " member(s)" + (warnText ? '<div style="color:#b3261e;font-size:10px;">' + escapeHtml(warnText) + "</div>" : "");
      tr.querySelector(".cell-per-member").textContent = fmt(computed.perMember);
      tr.querySelector(".cell-total").textContent = fmt(computed.total);
      tr.style.opacity = rowState(b.id).included ? "1" : "0.45";
    });
    document.getElementById("group-grand-total").textContent = fmt(groupGrandTotal());
  }

  // ---------------------------------------------------------------
  // Retail mode
  // ---------------------------------------------------------------
  function retailCatalog(productType) {
    var d = window.PRICING_DATA;
    if (!d) return [];
    var block = productType === "accident" ? d.accident_insurance : d.health_insurance;
    var rows = [];
    (block.plans || []).forEach(function (plan) {
      if (!plan.is_live_on_public_site) return;
      plan.variations.forEach(function (v) { rows.push({ plan: plan, v: v }); });
    });
    return rows;
  }
  function matchPlans(person) {
    var rows = retailCatalog(person.productType);
    var matches = rows.filter(function (r) {
      var p = r.v.prices_by_insurance_for[person.insuranceFor];
      if (!p) return false;
      var minAge = parseAgeYears(r.v.min_age) || 0;
      var maxAge = r.v.max_age ? parseAgeYears(r.v.max_age) : 999;
      if (person.age < minAge || person.age >= maxAge) return false;
      if (person.minCoverage && r.v.coverage_amount < person.minCoverage) return false;
      return true;
    });
    matches.sort(function (a, b) {
      return a.v.prices_by_insurance_for[person.insuranceFor].grand_total_customer_pays -
             b.v.prices_by_insurance_for[person.insuranceFor].grand_total_customer_pays;
    });
    return matches;
  }
  function matchKey(r) { return r.plan.plan_id + ":" + r.v.variation_id; }

  function addRosterRow() {
    var person = {
      id: rosterSeq++,
      name: "",
      age: 30,
      insuranceFor: "one_adult",
      productType: "health",
      minCoverage: 0,
      selectedKey: null
    };
    state.retail.roster.push(person);
    renderRoster();
  }
  function removeRosterRow(id) {
    state.retail.roster = state.retail.roster.filter(function (p) { return p.id !== id; });
    renderRoster();
  }

  function renderRoster() {
    var tbody = document.getElementById("roster-body");
    tbody.innerHTML = "";
    state.retail.roster.forEach(function (person) {
      tbody.appendChild(buildRosterRow(person));
    });
    updateRetailTotals();
  }

  function buildRosterRow(person) {
    var tr = el("tr");
    tr.dataset.id = person.id;

    var tdName = el("td");
    var nameInput = el("input"); nameInput.type = "text"; nameInput.value = person.name; nameInput.placeholder = "e.g. Employee 1";
    nameInput.addEventListener("input", function () { person.name = nameInput.value; });
    tdName.appendChild(nameInput);
    tr.appendChild(tdName);

    var tdAge = el("td");
    var ageInput = el("input"); ageInput.type = "number"; ageInput.min = 18; ageInput.max = 70; ageInput.value = person.age;
    ageInput.addEventListener("input", function () { person.age = parseInt(ageInput.value, 10) || 0; refreshMatchCell(person, tr); });
    tdAge.appendChild(ageInput);
    tr.appendChild(tdAge);

    var tdCombo = el("td");
    var comboSel = el("select");
    COMBO_ORDER.forEach(function (c) {
      var o = document.createElement("option"); o.value = c; o.textContent = COMBO_LABELS[c];
      comboSel.appendChild(o);
    });
    comboSel.value = person.insuranceFor;
    comboSel.addEventListener("change", function () { person.insuranceFor = comboSel.value; refreshMatchCell(person, tr); });
    tdCombo.appendChild(comboSel);
    tr.appendChild(tdCombo);

    var tdType = el("td");
    var typeSel = el("select");
    [["health", "Health Insurance"], ["accident", "Accident Insurance"]].forEach(function (pair) {
      var o = document.createElement("option"); o.value = pair[0]; o.textContent = pair[1];
      typeSel.appendChild(o);
    });
    typeSel.value = person.productType;
    typeSel.addEventListener("change", function () { person.productType = typeSel.value; person.selectedKey = null; refreshMatchCell(person, tr); });
    tdType.appendChild(typeSel);
    tr.appendChild(tdType);

    var tdCov = el("td");
    var covInput = el("input"); covInput.type = "number"; covInput.min = 0; covInput.step = 5000; covInput.value = person.minCoverage;
    covInput.addEventListener("input", function () { person.minCoverage = parseFloat(covInput.value) || 0; refreshMatchCell(person, tr); });
    tdCov.appendChild(covInput);
    tr.appendChild(tdCov);

    var tdMatch = el("td", "match-cell");
    tr.appendChild(tdMatch);

    var tdPremium = el("td", "premium-cell");
    tr.appendChild(tdPremium);

    var tdRemove = el("td");
    var rmBtn = el("button", "remove-row-btn", "\u2715");
    rmBtn.addEventListener("click", function () { removeRosterRow(person.id); });
    tdRemove.appendChild(rmBtn);
    tr.appendChild(tdRemove);

    refreshMatchCell(person, tr);
    return tr;
  }

  function refreshMatchCell(person, tr) {
    var matches = matchPlans(person);
    var matchCell = tr.querySelector(".match-cell");
    var premiumCell = tr.querySelector(".premium-cell");
    matchCell.innerHTML = "";

    if (!matches.length) {
      matchCell.innerHTML = '<span style="color:#b3261e;">No matching live plan</span>';
      premiumCell.textContent = fmt(0);
      person.selectedKey = null;
      updateRetailTotals();
      return;
    }
    var sel = el("select");
    matches.forEach(function (r) {
      var key = matchKey(r);
      var price = r.v.prices_by_insurance_for[person.insuranceFor].grand_total_customer_pays;
      var o = document.createElement("option");
      o.value = key;
      o.textContent = r.plan.company + " \u2014 " + r.plan.title + (r.v.variation_title ? " (" + r.v.variation_title + ")" : "") +
        " \u2014 " + (r.v.coverage_text || r.v.coverage_amount) + " \u2014 " + fmt(price);
      sel.appendChild(o);
    });
    var wanted = person.selectedKey && matches.some(function (r) { return matchKey(r) === person.selectedKey; });
    sel.value = wanted ? person.selectedKey : matchKey(matches[0]);
    person.selectedKey = sel.value;
    sel.addEventListener("change", function () {
      person.selectedKey = sel.value;
      updatePremiumCell(person, matches, premiumCell);
      updateRetailTotals();
    });
    matchCell.appendChild(sel);
    updatePremiumCell(person, matches, premiumCell);
    updateRetailTotals();
  }
  function updatePremiumCell(person, matches, premiumCell) {
    var r = matches.find(function (m) { return matchKey(m) === person.selectedKey; });
    var price = r ? r.v.prices_by_insurance_for[person.insuranceFor].grand_total_customer_pays : 0;
    premiumCell.textContent = fmt(price);
  }
  function personPremium(person) {
    var matches = matchPlans(person);
    var r = matches.find(function (m) { return matchKey(m) === person.selectedKey; });
    return r ? r.v.prices_by_insurance_for[person.insuranceFor].grand_total_customer_pays : 0;
  }
  function updateRetailTotals() {
    var total = state.retail.roster.reduce(function (sum, p) { return sum + personPremium(p); }, 0);
    document.getElementById("retail-grand-total").textContent = fmt(total);
  }

  // ---------------------------------------------------------------
  // Quotation (print) view
  // ---------------------------------------------------------------
  function showQuotation(html) {
    document.getElementById("quotation-sheet").innerHTML = html;
    document.querySelector("main.app-shell").classList.add("hidden");
    document.getElementById("quotation-view").classList.remove("hidden");
  }
  function hideQuotation() {
    document.getElementById("quotation-view").classList.add("hidden");
    document.querySelector("main.app-shell").classList.remove("hidden");
  }

  function quotationHeader(title) {
    var m = state.meta;
    return "" +
      "<h1>" + escapeHtml(title) + "</h1>" +
      '<div class="q-subtitle">Prepared via Bimafy internal proposal tool</div>' +
      '<div class="quotation-meta-grid">' +
        "<div><span>Client:</span> <strong>" + escapeHtml(m.client || "\u2014") + "</strong></div>" +
        "<div><span>Prepared by:</span> " + escapeHtml(m.preparedBy || "\u2014") + "</div>" +
        "<div><span>Date:</span> " + fmtDatePretty(m.date) + "</div>" +
        "<div><span>Valid until:</span> " + fmtDatePretty(m.validUntil) + "</div>" +
      "</div>";
  }
  function quotationTerms(extra) {
    return '<div class="q-terms">' +
      "<div>* Payment mode: Yearly in advance, unless otherwise agreed.</div>" +
      "<div>* Prices shown are exclusive of applicable tax/VAT unless stated.</div>" +
      "<div>* Other standard terms, conditions and exclusions of the underwriting insurer apply.</div>" +
      "<div>* This quotation is indicative and subject to final underwriting confirmation.</div>" +
      (extra ? "<div>* " + escapeHtml(extra) + "</div>" : "") +
      "</div>" +
      '<div class="q-footer">Bimafy Ltd \u2014 this quotation is generated for proposal purposes and is not a policy document.</div>';
  }

  function buildGroupQuotation() {
    var insurer = currentInsurer();
    var m = state.meta;
    var insurerLabel = m.anonymize ? insurer.anonymizedLabel : insurer.displayName;
    var rowsHtml = "";
    var categories = [];
    insurer.benefits.forEach(function (b) { if (categories.indexOf(b.category) === -1) categories.push(b.category); });

    var grand = 0;
    categories.forEach(function (cat) {
      var catBenefits = insurer.benefits.filter(function (b) { return b.category === cat && rowState(b.id).included; });
      if (!catBenefits.length) return;
      rowsHtml += '<div class="q-section-title">' + escapeHtml(cat) + "</div>";
      rowsHtml += "<table><thead><tr><th>Benefit</th><th>Sum assured</th><th>Members</th><th>Premium / member</th><th>Total premium</th></tr></thead><tbody>";
      catBenefits.forEach(function (b) {
        var c = computeBenefitRow(insurer, b);
        grand += c.total;
        rowsHtml += "<tr><td>" + escapeHtml(b.label) + "</td>" +
          "<td>" + (b.rateBasis === "per_mille" ? fmt(rowState(b.id).sumAssured) : "\u2014") + "</td>" +
          "<td>" + c.eligible + "</td>" +
          "<td>" + fmt(c.perMember) + "</td>" +
          "<td>" + fmt(c.total) + "</td></tr>";
      });
      rowsHtml += "</tbody></table>";
    });

    var html = quotationHeader("Group Life & Health Insurance Quotation") +
      '<div class="quotation-meta-grid">' +
        "<div><span>Underwriting insurer:</span> <strong>" + escapeHtml(insurerLabel) + "</strong></div>" +
        "<div><span>Employees:</span> " + state.census.employees + "</div>" +
        "<div><span>Total insured lives:</span> " + allInsuredCount() + "</div>" +
        "<div><span>Maternity-eligible members:</span> " + state.census.maternity + "</div>" +
      "</div>" +
      rowsHtml +
      '<div class="q-grand-total">Grand Total (annual): ' + fmt(grand) + "</div>" +
      quotationTerms();
    return html;
  }

  function buildRetailQuotation() {
    var m = state.meta;
    var rowsHtml = "<table><thead><tr><th>Person</th><th>Coverage</th><th>Plan</th><th>Premium</th></tr></thead><tbody>";
    var grand = 0;
    state.retail.roster.forEach(function (person) {
      var matches = matchPlans(person);
      var r = matches.find(function (mm) { return matchKey(mm) === person.selectedKey; });
      var price = r ? r.v.prices_by_insurance_for[person.insuranceFor].grand_total_customer_pays : 0;
      grand += price;
      var planLabel = "No plan selected";
      if (r) {
        planLabel = m.anonymize
          ? "Partner Insurer Plan \u2014 " + (r.plan.is_accident_insurance ? "Accident" : "Health") + " Cover"
          : r.plan.company + " \u2014 " + r.plan.title + (r.v.variation_title ? " (" + r.v.variation_title + ")" : "");
      }
      rowsHtml += "<tr><td>" + escapeHtml(person.name || "Team member") + " (age " + person.age + ")</td>" +
        "<td>" + (r ? escapeHtml(r.v.coverage_text || String(r.v.coverage_amount)) : "\u2014") + "</td>" +
        "<td>" + escapeHtml(planLabel) + "</td>" +
        "<td>" + fmt(price) + "</td></tr>";
    });
    rowsHtml += "</tbody></table>";

    var html = quotationHeader("Life & Health Insurance Quotation") +
      '<div class="q-section-title">Individual / Family Retail Plans</div>' +
      rowsHtml +
      '<div class="q-grand-total">Grand Total (annual): ' + fmt(grand) + "</div>" +
      quotationTerms("Retail plans are individually underwritten products; coverage terms follow each selected plan's own policy wording.");
    return html;
  }

  // ---------------------------------------------------------------
  // Wire up
  // ---------------------------------------------------------------
  function init() {
    bindMeta();
    bindCensus();
    renderCensusTotals();
    updateModeSuggestion();
    renderInsurerSelect();
    renderBenefitsTable();

    document.querySelectorAll(".mode-tab").forEach(function (btn) {
      btn.addEventListener("click", function () { switchMode(btn.dataset.mode); });
    });

    document.getElementById("roster-add-btn").addEventListener("click", addRosterRow);
    addRosterRow(); // start with one row

    document.getElementById("group-generate-btn").addEventListener("click", function () {
      showQuotation(buildGroupQuotation());
    });
    document.getElementById("retail-generate-btn").addEventListener("click", function () {
      showQuotation(buildRetailQuotation());
    });
    document.getElementById("quotation-back-btn").addEventListener("click", hideQuotation);
    document.getElementById("quotation-print-btn").addEventListener("click", function () { window.print(); });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
