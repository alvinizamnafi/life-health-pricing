// Group insurance rate card(s) \u2014 hand-maintained.
// Source for "pragati" entries: Bimafy_Insurer_Pricing_Input_Template_FirstModuleGemini.xlsx,
// sheet "Pragati Pricing" (first custom rate card received, 2026-09-28).
// Every `note` field is the ORIGINAL raw text from that sheet, kept verbatim so the
// person building a quote can see exactly what was negotiated before overriding anything.
//
// rateBasis:
//   "per_mille"    -> premium per member = (sumAssured / 1000) * rate
//   "flat_member"  -> premium per member = rate (a straight per-head annual premium)
//
// eligibility maps to a census field computed in app.js:
//   "employees", "all_insured", "maternity_eligible", "custom"

window.GROUP_RATE_CARDS = {
  insurers: [
    {
      id: "pragati",
      displayName: "Pragati Insurance",
      anonymizedLabel: "Partner Insurer A",
      lastUpdated: "2026-09-28",
      sourceNote: "First custom group rate card received directly from Pragati Insurance. Several figures are ranges under negotiation, not final locked rates.",
      benefits: [
        {
          id: "life_natural_death",
          category: "Life & Disability",
          label: "Group Term Life \u2014 Natural Death",
          eligibility: "employees",
          rateBasis: "per_mille",
          rate: { min: 1.6, max: 2.0, default: 1.8 },
          sumAssured: { default: 300000, min: 100000, max: 2000000, step: 50000 },
          note: "Raw source: \"2tk to 1.6 taka per thousand\". Read as a 1.6\u20132.0 per-mille range."
        },
        {
          id: "life_accidental_death",
          category: "Life & Disability",
          label: "Accidental Death (AD)",
          eligibility: "employees",
          rateBasis: "per_mille",
          rate: { min: 0.5, max: 0.75, default: 0.6 },
          sumAssured: { default: 600000, min: 100000, max: 4000000, step: 50000, linkedTo: "life_natural_death", linkedMultiplier: 2 },
          note: "Raw source: \".6 to .75\" with a \"starting .50\" note. Sum assured defaults to 200% of the Natural Death base, matching the BAT proposal pattern \u2014 override freely."
        },
        {
          id: "life_ptd_ppd",
          category: "Life & Disability",
          label: "Permanent Total & Partial Disability (PTD / PPD)",
          eligibility: "employees",
          rateBasis: "per_mille",
          rate: { min: 0.35, max: 0.5, default: 0.4 },
          sumAssured: { default: 300000, min: 100000, max: 2000000, step: 50000, linkedTo: "life_natural_death", linkedMultiplier: 1 },
          note: "Raw source: \".35 and .35\" per benefit \"together .50\" combined. Modelled as one combined PTD+PPD rider \u2014 split it into two rows later if Pragati prices them separately."
        },
        {
          id: "health_hospicash",
          category: "Health",
          label: "Hospitalization \u2014 Daily Cash Benefit",
          eligibility: "all_insured",
          rateBasis: "per_mille",
          rate: { min: 0.9, max: 1.5, default: 1.2 },
          sumAssured: { default: 5000, min: 1000, max: 5000, step: 500 },
          note: "Raw source: \"Hospicash (min 1k max 5k)\" benefit amount, \".9 to 1.5k per thousand\" rate, \"min 3 nights max 10 nights at a stretch, 30 to 45 days between claims, multiple times possible\". Sum-assured field here is the per-night cash benefit."
        },
        {
          id: "health_reimbursement",
          category: "Health",
          label: "Hospitalization \u2014 Reimbursement (IPD)",
          eligibility: "all_insured",
          rateBasis: "per_mille",
          rate: { min: 20, max: 25, default: 22.5 },
          sumAssured: { default: 150000, min: 50000, max: 500000, step: 10000 },
          note: "Raw source: \"Doctor visit, Medicine, 40% room, 60% investigation/medicine/consultancy\", rate \"20-25tk per thousand\". Note also flags a cheaper rate for larger groups \u2014 not quantified, renegotiate the slider for big census counts."
        },
        {
          id: "health_opd",
          category: "Health",
          label: "Outpatient (OPD)",
          eligibility: "all_insured",
          rateBasis: "flat_member",
          rate: { min: 2500, max: 8000, default: 4000 },
          note: "Raw source: small-group rate \"250tk per thousand\" vs. large-group (~100+) rate \"80tk per thousand\", plus an unlabeled \"0.5\" figure. Numbers didn't resolve cleanly to a per-mille formula against any stated sum assured, so this is modelled as a flat per-member annual premium range \u2014 re-derive from the per-mille figures once the OPD sum-assured basis is confirmed with Pragati."
        },
        {
          id: "maternity",
          category: "Maternity",
          label: "Maternity",
          eligibility: "maternity_eligible",
          rateBasis: "flat_member",
          rate: { min: 4000, max: 8000, default: 5500 },
          minEligible: 20,
          note: "Raw source: \"90-12 days waiting period, normal delivery, c-sec 1 lakh\", rate \"800 per thousand\", \"minimum to 20 to 50 peep[le]\". The 800/thousand figure didn't scale consistently against the stated 100,000 C-section limit, so this is modelled as a flat per-eligible-member premium (matches how your BAT/Employee Benefit Table examples actually rate maternity: ~5,250\u20135,525/member). Minimum group size for this rider: ~20\u201350 maternity-eligible members \u2014 flagged below that."
        },
        {
          id: "critical_illness",
          category: "Critical Illness",
          label: "Critical Illness (18 conditions)",
          eligibility: "employees",
          optional: true,
          rateBasis: "per_mille",
          rate: { min: 0.3, max: 0.4, default: 0.35 },
          sumAssured: { default: 300000, min: 100000, max: 1000000, step: 50000 },
          note: "Raw source: \"18 critical illnesses\", rate \".4tk per thousand, can be reduced to .3\"."
        }
      ],
      familyLoading: {
        note: "Raw source: \"Family included: 1 person (base) | 4 person 65% loading | 1 person 30% loading\". Ambiguous which benefits this applies to \u2014 exposed as a manual multiplier the quote-builder can switch on per benefit rather than hard-wired.",
        options: [
          { id: "single", label: "Employee only", multiplier: 1.0 },
          { id: "plus_one", label: "Employee + 1 dependent (~30% loading)", multiplier: 1.3 },
          { id: "family4", label: "Employee + family up to 4 (~65% loading)", multiplier: 1.65 }
        ]
      },
      minGroupSize: 10
    }
  ]
};
