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
      if (b.nights) {
        if (rs.nights === undefined) rs.nights = b.nights.default;
        if (rs.extraNightLoadingPct === undefined) rs.extraNightLoadingPct = b.nights.extraNightLoadingPct;
      }
      if (rs.loadingId === undefined) rs.loadingId = "single";
      if (rs.eligibleOverrideEnabled === undefined) rs.eligibleOverrideEnabled = false;
      if (rs.eligibleOverrideValue === undefined) rs.eligibleOverrideValue = 0;
    });
  }
  function loadingMultiplier(insurer, loadingId) {
    var opt = (insurer.familyLoading.options || []).find(function (o) { return o.id === loadingId; });
    return opt ? opt.multiplier : 1;
  }
  function nightsLoadFactor(b, rs, nights) {
    if (!b.nights) return 1;
    var extra = Math.max(0, (nights || b.nights.default) - b.nights.baseMax);
    return 1 + extra * (rs.extraNightLoadingPct || 0) / 100;
  }
  function basePerMember(b, rs, nights) {
    var base = b.rateBasis === "per_mille" ? (rs.sumAssured / 1000) * rs.rate : rs.rate;
    return base * nightsLoadFactor(b, rs, nights);
  }
  function computeBenefitRow(insurer, b) {
    var rs = rowState(b.id);
    var eligible = rs.eligibleOverrideEnabled ? rs.eligibleOverrideValue : eligibleCountFor(b.eligibility);
    var perMember = basePerMember(b, rs, rs.nights);
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
    ["employees", "spouses", "children"].forEach(function (key) {
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
      catRow.innerHTML = '<td colspan="8" class="category-row-cell">' + escapeHtml(cat) + "</td>";
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
      if (b.nights) {
        var nightsWrap = el("div", "nights-controls");
        var nightsLbl = el("label", "", "Nights at a stretch");
        var nightsSel = el("select");
        for (var n = b.nights.min; n <= b.nights.max; n++) {
          var no = document.createElement("option");
          no.value = n;
          no.textContent = n + (n > b.nights.baseMax ? " nights (extended)" : " nights");
          nightsSel.appendChild(no);
        }
        nightsSel.value = rs.nights;
        nightsSel.addEventListener("change", function () {
          rs.nights = parseInt(nightsSel.value, 10);
          updateBenefitsComputedCells(insurer);
        });
        nightsLbl.appendChild(nightsSel);
        var loadLbl = el("label", "", "Loading per night beyond " + b.nights.baseMax + " (%)");
        var loadInp = el("input");
        loadInp.type = "number"; loadInp.min = 0; loadInp.step = 1; loadInp.value = rs.extraNightLoadingPct;
        loadInp.addEventListener("input", function () {
          rs.extraNightLoadingPct = parseFloat(loadInp.value) || 0;
          updateBenefitsComputedCells(insurer);
        });
        loadLbl.appendChild(loadInp);
        nightsWrap.appendChild(nightsLbl);
        nightsWrap.appendChild(loadLbl);
        tdSA.appendChild(nightsWrap);
      }
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

  // One row per possible "nights at a stretch" setting for the daily-cash benefit.
  function nightsBreakdown(insurer, b) {
    var rs = rowState(b.id);
    var eligible = rs.eligibleOverrideEnabled ? rs.eligibleOverrideValue : eligibleCountFor(b.eligibility);
    var mult = loadingMultiplier(insurer, rs.loadingId);
    var rows = [];
    for (var n = b.nights.min; n <= b.nights.max; n++) {
      var perMember = basePerMember(b, rs, n) * mult;
      rows.push({
        nights: n,
        extended: n > b.nights.baseMax,
        selected: n === rs.nights,
        maxPayout: rs.sumAssured * n,
        perMember: perMember,
        perNight: perMember / n,
        total: perMember * eligible
      });
    }
    return rows;
  }
  function nightsTableHTML(rows, withTotal) {
    var h = '<table class="nights-table"><thead><tr><th>Nights at a stretch</th><th>Max payout / admission</th><th>Premium / member</th><th>Premium per night of cover</th>' +
      (withTotal ? "<th>Total (all members)</th>" : "") + "</tr></thead><tbody>";
    rows.forEach(function (r) {
      h += '<tr class="' + (r.selected ? "selected-night" : "") + '"><td>' + r.nights + (r.extended ? " (extended)" : "") + (r.selected ? " \u2713" : "") + "</td>" +
        "<td>" + fmt(r.maxPayout) + "</td><td>" + fmt(r.perMember) + "</td><td>" + fmt(r.perNight) + "</td>" +
        (withTotal ? "<td>" + fmt(r.total) + "</td>" : "") + "</tr>";
    });
    return h + "</tbody></table>";
  }
  function renderNightsPanel(insurer) {
    var host = document.getElementById("nights-breakdown");
    if (!host) return;
    var b = insurer.benefits.filter(function (x) { return x.nights; })[0];
    if (!b || !rowState(b.id).included) { host.innerHTML = ""; return; }
    var rs = rowState(b.id);
    host.innerHTML = '<h3>Hospital daily cash \u2014 cost by nights at a stretch</h3>' +
      '<p class="hint">Benefit of ' + fmt(rs.sumAssured) + " per night. 3\u2013" + b.nights.baseMax + " nights at the base rate; longer stays carry the extra-night loading. Selected option is ticked.</p>" +
      '<div class="table-scroll">' + nightsTableHTML(nightsBreakdown(insurer, b), true) + "</div>";
  }

  function updateBenefitsComputedCells(insurer) {
    insurer.benefits.forEach(function (b) {
      var tr = document.querySelector('tr[data-benefit-id="' + b.id + '"]');
      if (!tr) return;
      var computed = computeBenefitRow(insurer, b);
      var eligDisplay = tr.querySelector(".elig-display");
      eligDisplay.textContent = computed.eligible + " member(s)";
      tr.querySelector(".cell-per-member").textContent = fmt(computed.perMember);
      tr.querySelector(".cell-total").textContent = fmt(computed.total);
      tr.style.opacity = rowState(b.id).included ? "1" : "0.45";
    });
    document.getElementById("group-grand-total").textContent = fmt(groupGrandTotal());
    renderNightsPanel(insurer);
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
  // Quotation model (one source for the on-screen sheet, the PDF and the sendable text)
  // ---------------------------------------------------------------
  function fmtText(n) {
    return "BDT " + Math.round(n || 0).toLocaleString("en-US");
  }
  function pctOf(part, whole) {
    return whole ? Math.round((part / whole) * 100) : 0;
  }

  function groupBenefitDetails(insurer, b) {
    var rs = rowState(b.id);
    var c = computeBenefitRow(insurer, b);
    var sa = rs.sumAssured;
    var bullets = [];
    var table = null;
    switch (b.id) {
      case "life_natural_death":
        bullets.push("Lump sum of " + fmtText(sa) + " paid to the nominee on the death of an insured employee.");
        break;
      case "life_accidental_death":
        var base = rowState("life_natural_death").sumAssured;
        bullets.push(fmtText(sa) + " payable if death is caused by an accident" +
          (base ? " (" + pctOf(sa, base) + "% of the base life cover)." : "."));
        break;
      case "life_ptd_ppd":
        bullets.push("Permanent Total Disability: " + fmtText(sa) + ".");
        bullets.push("Permanent Partial Disability: up to " + fmtText(sa) + ", in proportion to the severity of the disability.");
        break;
      case "health_hospicash":
        bullets.push("Daily cash benefit of " + fmtText(sa) + " per night of hospital admission, regardless of the actual bill.");
        bullets.push("Covers " + b.nights.min + " to " + rs.nights + " nights at a stretch per admission; maximum payout " + fmtText(sa * rs.nights) + " per admission.");
        bullets.push("Multiple claims in a year are allowed, with a 30\u201345 day gap between admissions.");
        bullets.push("Longer stays (up to " + b.nights.max + " nights at a stretch) can be covered for a higher premium \u2014 see the table below.");
        table = nightsBreakdown(insurer, b);
        break;
      case "health_reimbursement":
        bullets.push("Up to " + fmtText(sa) + " per insured person per disability (illness or injury) for hospitalization expenses.");
        bullets.push("Room & board: up to 40% of the limit (" + fmtText(sa * 0.4) + ").");
        bullets.push("Doctor visits, investigations, medicines and consultancy during hospitalization: up to 60% of the limit (" + fmtText(sa * 0.6) + ").");
        break;
      case "health_opd":
        bullets.push("Up to " + fmtText(sa) + " per insured person per year for outpatient treatment.");
        bullets.push("Covers doctor consultations, investigations & tests, and prescription medicines.");
        break;
      case "critical_illness":
        bullets.push("Lump sum of " + fmtText(sa) + " on first diagnosis of any of the 18 covered critical illnesses.");
        break;
      default:
        if (b.rateBasis === "per_mille") bullets.push("Cover of " + fmtText(sa) + ".");
    }
    bullets.push("Covered members: " + c.eligible + (b.eligibility === "employees" ? " employees." : " insured lives (employees and enrolled dependants)."));
    if (rs.loadingId && rs.loadingId !== "single") {
      var opt = insurer.familyLoading.options.filter(function (o) { return o.id === rs.loadingId; })[0];
      if (opt) bullets.push("Premium includes family loading: " + opt.label + ".");
    }
    return { title: b.label, bullets: bullets, table: table };
  }

  function groupQuoteModel() {
    var insurer = currentInsurer();
    var m = state.meta;
    var sections = [], details = [], grand = 0;
    var categories = [];
    insurer.benefits.forEach(function (b) { if (categories.indexOf(b.category) === -1) categories.push(b.category); });
    categories.forEach(function (cat) {
      var rows = [];
      insurer.benefits.filter(function (b) { return b.category === cat && rowState(b.id).included; }).forEach(function (b) {
        var c = computeBenefitRow(insurer, b);
        grand += c.total;
        rows.push({
          label: b.label,
          cover: b.rateBasis === "per_mille" ? rowState(b.id).sumAssured : null,
          members: c.eligible,
          perMember: c.perMember,
          total: c.total
        });
        details.push(groupBenefitDetails(insurer, b));
      });
      if (rows.length) sections.push({ category: cat, rows: rows });
    });
    return {
      mode: "group",
      title: "Group Life & Health Insurance Quotation",
      facts: [
        ["Underwriting insurer", m.anonymize ? insurer.anonymizedLabel : insurer.displayName],
        ["Employees", String(state.census.employees)],
        ["Total insured lives", String(allInsuredCount())]
      ],
      sections: sections,
      grand: grand,
      details: details,
      terms: []
    };
  }

  function retailQuoteModel() {
    var m = state.meta;
    var rows = [], details = [], grand = 0;
    state.retail.roster.forEach(function (person) {
      var matches = matchPlans(person);
      var r = matches.find(function (mm) { return matchKey(mm) === person.selectedKey; });
      var price = r ? r.v.prices_by_insurance_for[person.insuranceFor].grand_total_customer_pays : 0;
      grand += price;
      var who = (person.name || "Team member") + " (age " + person.age + ", " + COMBO_LABELS[person.insuranceFor] + ")";
      var planLabel = "No plan selected";
      if (r) {
        planLabel = m.anonymize
          ? "Partner Insurer Plan \u2014 " + (r.plan.is_accident_insurance ? "Accident" : "Health") + " Cover"
          : r.plan.company + " \u2014 " + r.plan.title + (r.v.variation_title ? " (" + r.v.variation_title + ")" : "");
      }
      rows.push({
        label: who,
        cover: r ? r.v.coverage_amount : null,
        plan: planLabel,
        total: price
      });
      if (r) {
        var bullets = [];
        bullets.push("Total cover: " + fmtText(r.v.coverage_amount) + " for " + (r.v.policy_period_text || "1 year") + ".");
        (r.v.benefits || []).forEach(function (bn) {
          bullets.push(bn.benefit + (bn.amount ? ": " + fmtText(bn.amount) : "") + (bn.is_extra ? " (additional benefit)" : ""));
        });
        details.push({ title: who + " \u2014 " + planLabel, bullets: bullets, table: null });
      }
    });
    return {
      mode: "retail",
      title: "Life & Health Insurance Quotation",
      facts: [["Team members", String(state.retail.roster.length)]],
      retailRows: rows,
      sections: [],
      grand: grand,
      details: details,
      terms: ["Retail plans are individually underwritten products; coverage terms follow each selected plan's own policy wording."]
    };
  }

  var STANDARD_TERMS = [
    "Payment mode: yearly in advance, unless otherwise agreed.",
    "Prices shown are exclusive of applicable tax/VAT unless stated.",
    "Other standard terms, conditions and exclusions of the underwriting insurer apply.",
    "This quotation is indicative and subject to final underwriting confirmation."
  ];

  // ---------------------------------------------------------------
  // Quotation rendering: on-screen sheet / print view
  // ---------------------------------------------------------------
  var currentQuote = null;

  function quoteHTML(q) {
    var m = state.meta;
    var h = "<h1>" + escapeHtml(q.title) + "</h1>" +
      '<div class="q-subtitle">Prepared via Bimafy internal proposal tool</div>' +
      '<div class="quotation-meta-grid">' +
        "<div><span>Client:</span> <strong>" + escapeHtml(m.client || "\u2014") + "</strong></div>" +
        "<div><span>Prepared by:</span> " + escapeHtml(m.preparedBy || "\u2014") + "</div>" +
        "<div><span>Date:</span> " + fmtDatePretty(m.date) + "</div>" +
        "<div><span>Valid until:</span> " + fmtDatePretty(m.validUntil) + "</div>" +
        q.facts.map(function (f) { return "<div><span>" + escapeHtml(f[0]) + ":</span> " + escapeHtml(f[1]) + "</div>"; }).join("") +
      "</div>";

    if (q.mode === "group") {
      q.sections.forEach(function (s) {
        h += '<div class="q-section-title">' + escapeHtml(s.category) + "</div>" +
          "<table><thead><tr><th>Benefit</th><th>Cover (BDT)</th><th>Members</th><th>Premium / member</th><th>Total premium</th></tr></thead><tbody>";
        s.rows.forEach(function (r) {
          h += "<tr><td>" + escapeHtml(r.label) + "</td><td>" + (r.cover !== null ? fmt(r.cover) : "\u2014") + "</td><td>" + r.members +
            "</td><td>" + fmt(r.perMember) + "</td><td>" + fmt(r.total) + "</td></tr>";
        });
        h += "</tbody></table>";
      });
    } else {
      h += '<div class="q-section-title">Individual / Family Retail Plans</div>' +
        "<table><thead><tr><th>Person</th><th>Cover</th><th>Plan</th><th>Premium</th></tr></thead><tbody>";
      q.retailRows.forEach(function (r) {
        h += "<tr><td>" + escapeHtml(r.label) + "</td><td>" + (r.cover !== null ? fmt(r.cover) : "\u2014") + "</td><td>" +
          escapeHtml(r.plan) + "</td><td>" + fmt(r.total) + "</td></tr>";
      });
      h += "</tbody></table>";
    }
    h += '<div class="q-grand-total">Grand Total (annual): ' + fmt(q.grand) + "</div>";

    if (q.details.length) {
      h += '<div class="q-section-title q-details-title">Coverage details</div>';
      q.details.forEach(function (d) {
        h += '<div class="q-detail"><div class="q-detail-title">' + escapeHtml(d.title) + "</div><ul>" +
          d.bullets.map(function (b) { return "<li>" + escapeHtml(b) + "</li>"; }).join("") + "</ul>";
        if (d.table) h += nightsTableHTML(d.table, false);
        h += "</div>";
      });
    }

    h += '<div class="q-terms">' + STANDARD_TERMS.concat(q.terms).map(function (t) { return "<div>* " + escapeHtml(t) + "</div>"; }).join("") + "</div>" +
      '<div class="q-footer">Bimafy Ltd \u2014 this quotation is generated for proposal purposes and is not a policy document.</div>';
    return h;
  }

  function quoteText(q, withDetails) {
    var m = state.meta;
    var L = [];
    L.push(q.title);
    L.push("Client: " + (m.client || "-"));
    L.push("Prepared by: " + (m.preparedBy || "-") + " | Date: " + fmtDatePretty(m.date) + " | Valid until: " + fmtDatePretty(m.validUntil));
    q.facts.forEach(function (f) { L.push(f[0] + ": " + f[1]); });
    L.push("");
    L.push("PREMIUM SUMMARY (annual)");
    if (q.mode === "group") {
      q.sections.forEach(function (s) {
        s.rows.forEach(function (r) {
          L.push("\u2022 " + r.label + (r.cover !== null ? " (cover " + fmtText(r.cover) + ")" : "") + ": " + r.members + " x " + fmtText(r.perMember) + " = " + fmtText(r.total));
        });
      });
    } else {
      q.retailRows.forEach(function (r) {
        L.push("\u2022 " + r.label + " - " + r.plan + (r.cover !== null ? " (cover " + fmtText(r.cover) + ")" : "") + ": " + fmtText(r.total));
      });
    }
    L.push("GRAND TOTAL (annual): " + fmtText(q.grand));
    if (withDetails && q.details.length) {
      L.push("");
      L.push("COVERAGE DETAILS");
      q.details.forEach(function (d) {
        L.push(d.title);
        d.bullets.forEach(function (b) { L.push("  - " + b); });
        if (d.table) {
          d.table.forEach(function (r) {
            L.push("  - " + r.nights + " nights at a stretch: max " + fmtText(r.maxPayout) + " per admission, premium " + fmtText(r.perMember) + " per member (" + fmtText(r.perNight) + " per night of cover)" + (r.selected ? " [selected]" : ""));
          });
        }
      });
    }
    L.push("");
    STANDARD_TERMS.concat(q.terms).forEach(function (t) { L.push("* " + t); });
    return L.join("\n");
  }

  function showQuotation(q) {
    currentQuote = q;
    document.getElementById("quotation-sheet").innerHTML = quoteHTML(q);
    document.getElementById("send-status").textContent = "";
    document.querySelector("main.app-shell").classList.add("hidden");
    document.getElementById("quotation-view").classList.remove("hidden");
    window.scrollTo(0, 0);
  }
  function hideQuotation() {
    document.getElementById("quotation-view").classList.add("hidden");
    document.querySelector("main.app-shell").classList.remove("hidden");
  }

  // ---------------------------------------------------------------
  // Sending the quotation (email / WhatsApp / copy)
  // ---------------------------------------------------------------
  function sendStatus(msg) {
    document.getElementById("send-status").textContent = msg;
  }
  function recipientName() {
    return document.getElementById("send-name").value.trim();
  }
  function composeMessage(maxLen) {
    var name = recipientName();
    var greeting = (name ? "Dear " + name + ",\n\n" : "Hello,\n\n") + "Please find our insurance quotation below.\n\n";
    var full = greeting + quoteText(currentQuote, true);
    if (encodeURIComponent(full).length <= maxLen) return { text: full, shortened: false };
    return { text: greeting + quoteText(currentQuote, false) + "\n\nFull coverage details are in the PDF quotation.", shortened: true };
  }
  function sendByEmail() {
    var to = document.getElementById("send-email").value.trim();
    if (!to) { sendStatus("Enter the recipient's email address first."); return; }
    var msg = composeMessage(1800);
    var subject = "Insurance quotation" + (state.meta.client ? " for " + state.meta.client : "");
    window.location.href = "mailto:" + encodeURIComponent(to) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(msg.text);
    sendStatus("Your email app should open with the quotation filled in" + (msg.shortened ? " (summary only because of email length limits \u2014 attach the PDF for full details)." : "."));
  }
  function sendByWhatsApp() {
    var digits = document.getElementById("send-phone").value.replace(/\D/g, "");
    if (/^0\d{10}$/.test(digits)) digits = "88" + digits;
    var msg = composeMessage(6000);
    var url = "https://wa.me/" + digits + "?text=" + encodeURIComponent(msg.text);
    window.open(url, "_blank");
    sendStatus(digits ? "WhatsApp should open with the quotation filled in." : "WhatsApp should open so you can choose the recipient.");
  }
  function copyQuoteText() {
    var text = composeMessage(1e9).text;
    var done = function () { sendStatus("Quotation text copied. Paste it into any email or chat."); };
    var fallback = function () {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { sendStatus("Copy failed \u2014 select the quotation on the page and copy it manually."); }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
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
      showQuotation(groupQuoteModel());
    });
    document.getElementById("retail-generate-btn").addEventListener("click", function () {
      showQuotation(retailQuoteModel());
    });
    document.getElementById("quotation-back-btn").addEventListener("click", hideQuotation);
    document.getElementById("quotation-print-btn").addEventListener("click", function () { window.print(); });
    document.getElementById("send-email-btn").addEventListener("click", sendByEmail);
    document.getElementById("send-wa-btn").addEventListener("click", sendByWhatsApp);
    document.getElementById("send-copy-btn").addEventListener("click", copyQuoteText);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
