// Group insurance rate card(s) — hand-maintained.
// Source for "pragati" entries: Bimafy_Insurer_Pricing_Input_Template_FirstModuleGemini.xlsx,
// sheet "Pragati Pricing" (first custom rate card received, 2026-09-28), updated with
// Pragati's written feedback on the demo quotation (Oct 2026, "...(002).-Feedback.pdf").
// Every `note` field records where each figure came from, so the person building a quote
// can see exactly what was negotiated before overriding anything.
//
// rateBasis:
//   "per_mille"    -> premium per member = (sumAssured / 1000) * rate
//   "flat_member"  -> premium per member = rate (a straight per-head annual premium)
//
// sizeTiers: the rate depends on how many members are covered by that benefit —
//   smaller groups pay a higher rate, larger groups a lower one.
//   The first tier whose maxMembers >= member count applies (maxMembers null = no upper limit).
//   confirmed: true  -> rate quoted / accepted by the insurer.
//   otherwise        -> read from the original rate-card range; needs insurer confirmation.
//   The calculator sets the rate from the tier automatically; it can still be overridden.
//
// eligibility maps to a census field computed in app.js:
//   "employees", "all_insured"

window.GROUP_RATE_CARDS = {
  insurers: [
    {
      id: "pragati",
      displayName: "Pragati Insurance",
      anonymizedLabel: "Partner Insurer A",
      lastUpdated: "2026-11-08",
      sourceNote: "Pragati Insurance group rate card, updated with Pragati's Oct 2026 feedback (group-size rates for life, IPD, OPD and critical illness). Rates move with group size; tiers not marked confirmed still need Pragati's sign-off.",
      benefits: [
        {
          id: "life_natural_death",
          category: "Life & Disability",
          label: "Group Term Life — Natural Death",
          eligibility: "employees",
          rateBasis: "per_mille",
          rate: { min: 1.6, max: 3.75, default: 3.75 },
          sizeTiers: [
            { maxMembers: 200, rate: 3.75, confirmed: true },
            { maxMembers: 400, rate: 2.95, confirmed: true },
            { maxMembers: null, rate: 2.0 }
          ],
          sumAssured: { default: 300000, min: 100000, max: 2000000, step: 50000 },
          note: "Pragati feedback (Oct 2026): BDT 3.75 per 1,000 for up to 200 members, BDT 2.95 per 1,000 for up to 400 members. Above 400 members uses BDT 2.00 from the original rate card (\"2tk to 1.6 taka per thousand\") — confirm with Pragati."
        },
        {
          id: "life_accidental_death",
          category: "Life & Disability",
          label: "Accidental Death (AD)",
          eligibility: "employees",
          rateBasis: "per_mille",
          rate: { min: 0.5, max: 0.75, default: 0.75 },
          sizeTiers: [
            { maxMembers: 100, rate: 0.75, confirmed: true },
            { maxMembers: 400, rate: 0.6 },
            { maxMembers: null, rate: 0.5 }
          ],
          sumAssured: { default: 600000, min: 100000, max: 4000000, step: 50000, linkedTo: "life_natural_death", linkedMultiplier: 2 },
          note: "Raw source: \".6 to .75\" with a \"starting .50\" note. 0.75 was accepted by Pragati for a 20-member group (Oct 2026); the 101–400 and 400+ tiers follow the rate-card range and need confirmation. The quotation states AD is paid IN ADDITION to the natural death cover — confirm with Pragati. Sum assured defaults to 200% of the Natural Death base, matching the BAT proposal pattern — override freely."
        },
        {
          id: "life_ptd_ppd",
          category: "Life & Disability",
          label: "Permanent Total & Partial Disability (PTD / PPD)",
          eligibility: "employees",
          rateBasis: "per_mille",
          rate: { min: 0.35, max: 0.5, default: 0.5 },
          sizeTiers: [
            { maxMembers: 100, rate: 0.5, confirmed: true },
            { maxMembers: 400, rate: 0.4 },
            { maxMembers: null, rate: 0.35 }
          ],
          sumAssured: { default: 300000, min: 100000, max: 2000000, step: 50000, linkedTo: "life_natural_death", linkedMultiplier: 1 },
          note: "Raw source: \".35 and .35\" per benefit \"together .50\" combined. Modelled as one combined PTD+PPD rider — split it into two rows later if Pragati prices them separately. 0.50 was accepted by Pragati for a 20-member group; the larger-group tiers follow the rate-card range and need confirmation."
        },
        {
          id: "health_hospicash",
          category: "Health",
          label: "Hospitalization — Daily Cash Benefit",
          eligibility: "all_insured",
          rateBasis: "per_mille",
          rate: { min: 900, max: 1500, default: 1500 },
          sizeTiers: [
            { maxMembers: 100, rate: 1500 },
            { maxMembers: 400, rate: 1200 },
            { maxMembers: null, rate: 900 }
          ],
          sumAssured: { default: 5000, min: 1000, max: 5000, step: 500 },
          nights: { min: 3, baseMax: 6, max: 10, default: 6, extraNightLoadingPct: 10 },
          note: "Raw source: \"Hospicash (min 1k max 5k)\" benefit amount, \".9 to 1.5k per thousand\" rate, \"min 3 nights max 10 nights at a stretch, 30 to 45 days between claims, multiple times possible\". Rate is read literally as BDT 900–1,500 per BDT 1,000 of nightly benefit per year — confirm with Pragati. Size tiers spread that range (small groups 1,500, 400+ members 900) and are not yet confirmed. 3–6 nights at a stretch is priced at the base rate; each night beyond 6 adds the extra-night loading, which is a PLACEHOLDER (10% per night) until Pragati quotes it."
        },
        {
          id: "health_reimbursement",
          category: "Health",
          label: "Hospitalization — Reimbursement (IPD)",
          eligibility: "all_insured",
          rateBasis: "per_mille",
          rate: { min: 20, max: 30, default: 30 },
          sizeTiers: [
            { maxMembers: 100, rate: 30, confirmed: true },
            { maxMembers: 400, rate: 25 },
            { maxMembers: null, rate: 20 }
          ],
          sumAssured: { default: 150000, min: 50000, max: 500000, step: 10000 },
          note: "Raw source: \"Doctor visit, Medicine, 40% room, 60% investigation/medicine/consultancy\", rate \"20-25tk per thousand\". Pragati feedback (Oct 2026): BDT 3,000 per person for BDT 100,000 cover (= 30 per mille) when members ≤ 100. The 101–400 (25) and 400+ (20) tiers follow the original 20–25 range and need confirmation."
        },
        {
          id: "health_opd",
          category: "Health",
          label: "Outpatient (OPD)",
          eligibility: "all_insured",
          rateBasis: "per_mille",
          rate: { min: 80, max: 250, default: 250 },
          sizeTiers: [
            { maxMembers: 100, rate: 250, confirmed: true },
            { maxMembers: 400, rate: 200 },
            { maxMembers: null, rate: 80 }
          ],
          sumAssured: { default: 20000, min: 5000, max: 50000, step: 1000 },
          note: "Pragati feedback (Oct 2026): premium is 25% of the OPD limit (= 250 per mille) when members ≤ 100. 101–400 uses the earlier BDT 200 per 1,000; 400+ uses \"80 tk per thousand\" from the raw notes — confirm both. Sum assured is the annual OPD limit per insured."
        },
        {
          id: "critical_illness",
          category: "Critical Illness",
          label: "Critical Illness (18 conditions)",
          eligibility: "employees",
          optional: true,
          rateBasis: "per_mille",
          rate: { min: 0.3, max: 1.5, default: 1.5 },
          sizeTiers: [
            { maxMembers: null, rate: 1.5, confirmed: true }
          ],
          sumAssured: { default: 300000, min: 100000, max: 1000000, step: 50000 },
          note: "Pragati feedback (Oct 2026): BDT 150 per person for BDT 100,000 cover (= 1.5 per mille) when members ≤ 100. No larger-group rate quoted yet, so 1.5 applies to every group size. The original \".4tk per thousand, can be reduced to .3\" is superseded."
        }
      ],
      familyLoading: {
        note: "Raw source: \"Family included: 1 person (base) | 4 person 65% loading | 1 person 30% loading\". Ambiguous which benefits this applies to — exposed as a manual multiplier the quote-builder can switch on per benefit rather than hard-wired.",
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
