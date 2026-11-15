// Ready-made Bimafy health plans shown on plans.html.
// Source: "Health Insurance Coverage Details - Bimafy Plans.xlsx" (sheet "Coverage Details",
// verified against bimafy.com product pages on 9 Nov 2026). Plan names and the `extras`
// benefits come from the Bimafy retail catalog (data/retail-pricing-data.js) where the plan
// matched by company and premium.
//
// Amounts are BDT. A null amount means the benefit was not listed for that plan in the
// source sheet — it does NOT necessarily mean "not covered" (see the sheet's notes).
// `cashless: true` only where the plan page expressly states cashless / direct payment.
// premium = per person; periodYears = policy term the premium buys (1 unless stated).

window.BIMAFY_PLANS = {
  sourceNote: "Health Insurance Coverage Details - Bimafy Plans.xlsx, verified 9 Nov 2026",
  plans: [
    {
      id: "chartered-cashless-100k", company: "Chartered Life Insurance", name: null,
      premium: 3995, periodYears: 1,
      ipd: 100000, opd: null, life: 100000, ci: 100000, disability: null, cashless: true
    },
    {
      id: "chartered-cashless-150k", company: "Chartered Life Insurance", name: null,
      premium: 5795, periodYears: 1,
      ipd: 150000, opd: null, life: 150000, ci: 150000, disability: null, cashless: true
    },
    {
      id: "chartered-cashless-250k", company: "Chartered Life Insurance", name: null,
      premium: 9995, periodYears: 1,
      ipd: 250000, opd: null, life: 250000, ci: 250000, disability: null, cashless: true
    },
    {
      id: "chartered-nirapotta", company: "Chartered Life Insurance", name: "Chartered Nirapotta",
      premium: 5000, periodYears: 5,
      ipd: null, opd: null, life: 50000, ci: null, disability: null, cashless: false,
      extras: [
        ["Hospitalization allowance", 50000],
        ["Accidental death", 150000],
        ["Accidental injury", 40000],
        ["Surgery", 40000],
        ["Ambulance fare", 20000]
      ]
    },
    {
      id: "pragati-option-a", company: "Pragati Life Insurance", name: "Option A",
      premium: 19866, periodYears: 1,
      ipd: 300000, opd: 20000, life: 1000000, ci: null, disability: 1000000, cashless: true
    },
    {
      id: "pragati-option-b", company: "Pragati Life Insurance", name: "Option B",
      premium: 14409, periodYears: 1,
      ipd: 200000, opd: 15000, life: 800000, ci: null, disability: 800000, cashless: true
    },
    {
      id: "pragati-option-c", company: "Pragati Life Insurance", name: "Option C",
      premium: 9965, periodYears: 1,
      ipd: 150000, opd: 10000, life: 500000, ci: null, disability: 500000, cashless: true
    },
    {
      id: "pragati-501-plan-1", company: "Pragati Life Insurance", name: "Health Insurance (501) — Plan 1",
      premium: 10785, periodYears: 1,
      ipd: 500000, opd: null, life: 500000, ci: null, disability: null, cashless: true
    },
    {
      id: "pragati-501-plan-2", company: "Pragati Life Insurance", name: "Health Insurance (501) — Plan 2",
      premium: 18275, periodYears: 1,
      ipd: 1000000, opd: null, life: 1000000, ci: null, disability: null, cashless: true
    },
    {
      id: "pragati-hospital-cash-bronze", company: "Pragati Life Insurance", name: "Hospital Cash — Bronze",
      premium: 1399, periodYears: 1,
      ipd: null, opd: 2000, life: 40000, ci: null, disability: null, cashless: false,
      extras: [
        ["Hospital cash", 30000],
        ["Doctor consultation", 1000],
        ["Diagnostic tests", 1000],
        ["Viral & bacterial disease", 5000]
      ]
    },
    {
      id: "pragati-hospital-cash-gold", company: "Pragati Life Insurance", name: "Hospital Cash — Gold",
      premium: 3799, periodYears: 1,
      ipd: null, opd: 5000, life: 200000, ci: 100000, disability: null, cashless: false,
      ciNote: "8 critical illnesses",
      extras: [
        ["Hospital cash", 90000],
        ["Doctor consultation", 2000],
        ["Diagnostic tests", 3000],
        ["Viral & bacterial disease", 10000]
      ]
    },
    {
      id: "guardian-assurance", company: "Guardian Life Insurance", name: "Guardian Assurance",
      premium: 825, periodYears: 1,
      ipd: 20000, opd: 3000, life: 50000, ci: null, disability: null, cashless: false,
      extras: [
        ["Doctor consultation", null],
        ["Diagnostic tests", null]
      ]
    },
    {
      id: "guardian-assurance-ultra", company: "Guardian Life Insurance", name: "Guardian Assurance Ultra",
      premium: 2725, periodYears: 1,
      ipd: 50000, opd: 10000, life: 200000, ci: 200000, disability: null, cashless: false,
      ciNote: "5 critical illnesses",
      extras: [
        ["Doctor consultation", null],
        ["Diagnostic tests", null]
      ]
    },
    {
      id: "green-delta-ghi-basic", company: "Green Delta Insurance", name: "GHI Basic",
      premium: 1052, periodYears: 1,
      ipd: 50000, opd: null, life: null, ci: null, disability: null, cashless: false
    },
    {
      id: "green-delta-ghi-standard", company: "Green Delta Insurance", name: "GHI Standard",
      premium: 1355, periodYears: 1,
      ipd: 75000, opd: null, life: null, ci: null, disability: null, cashless: false
    },
    {
      id: "green-delta-ghi-advanced", company: "Green Delta Insurance", name: "GHI Advanced",
      premium: 2104, periodYears: 1,
      ipd: 100000, opd: null, life: null, ci: null, disability: null, cashless: false
    }
  ]
};
