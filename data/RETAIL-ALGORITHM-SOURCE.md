# Bimafy Health & Accident Insurance — Pricing Algorithm

Source: `app-modules/health-insurance/` + `app/Libraries/`. Verified against live
`bimafy_sep24` DB and cross-checked with `php artisan tinker` running the real
Eloquent code (5 live variations, exact match on every field).

**Accident insurance is not a separate system.** It is the same `HealthPlan` /
`HealthPlanVariation` tables, filtered by `health_plans.is_accident_insurance = 1`.
Everything below applies identically to both `/health-insurance` and `/accident-insurance`.

## 1. Data model

```
InsuranceCompany (provider)
  └─ HealthPlan            "GHI Premium", is_accident_insurance flag, is_active, commercial_type(b2b/b2c)
       └─ HealthPlanVariation   one priced package/tier under the plan
            ├─ HealthPlanVariationPremium[]   the actual per-person prices (source of truth)
            ├─ age band, coverage amount, policy period  (via generic attribute system)
            └─ VAT%, stamp duty, service charge (flat/%), service charge VAT%
```

⚠️ `health_plan_variations` still has legacy columns `one_adult`, `two_adult`, etc.
**These are dead data** — the model overrides them with PHP accessors that sum from
`HealthPlanVariationPremium`. Never read those raw columns as price.

Each `HealthPlanVariationPremium` row has `age_group` (`child`/`adult`/`senior`) and
`is_primary` (true = the main insured self/policyholder).

## 2. Net premium = f(family composition)

| `insurance_for` value | Net premium = |
|---|---|
| `one_adult` | primary adult |
| `two_adult` | primary adult + secondary adult (spouse) |
| `one_adult_one_child` | primary adult + child #1 |
| `one_adult_two_child` | primary adult + child #1 + child #2 |
| `two_adult_one_child` | primary + secondary adult + child #1 |
| `two_adult_two_child` | primary + secondary adult + child #1 + child #2 |
| `one_adult_father` | father (1st `senior` row) |
| `one_adult_mother` | mother (2nd `senior` row) |
| `two_adult_parents` | father + mother |

"Child #1/#2" and "father/mother" are **not explicitly labeled** in the DB — they're
whichever `senior`/`child` premium row was created first (lowest `id`) for that plan
variation. Currently **0 rows have `age_group = 'senior'`** anywhere in the live data,
so the father/mother/parents combos exist in code but are not sellable today.

## 3. Price formula (exact order — this is the whole algorithm)

```
Net Premium              = table above
VAT                      = Net × vat_percent / 100        (live data: always 0% or 15%)
Stamp Duty                                                  (live data: always ৳0, unused)
─────────────────────────────────────────────────
Gross Premium            = Net + VAT + Stamp Duty
Service Charge            = flat ৳ OR Net × service_charge%   (per-variation flag), rounded
Service Charge VAT        = Service Charge × service_charge_vat_percent / 100, rounded
─────────────────────────────────────────────────
GRAND TOTAL               = Gross Premium + Service Charge + Service Charge VAT
                           = what the customer pays
```

🚩 **Naming trap in the codebase**: the plan-search function (`findPlansV3`) calls the
*final customer price* (`Net+VAT+SD+SC+SC-VAT`) `gross_premium`. The checkout
calculation trait calls the *pre-service-charge* subtotal (`Net+VAT+SD`) `gross_premium`.
Same field name, two different meanings in two files. **Only trust "Grand Total"
(the fully-loaded number) as the customer price.** `pricing-data.json` uses
unambiguous keys (`gross_premium_pre_service_charge` vs `grand_total_customer_pays`)
specifically to avoid this trap.

## 4. Which price a customer is even shown

A plan variation is only offered to a customer if **all** of:
- `is_active = 1`, `commercial_type = 'b2c'`, correct `is_accident_insurance` flag, visible to their role
- customer's max adult age falls inside the variation's `[min_age, max_age)` band
- selected coverage amount matches the variation's coverage attribute
- the variation actually **has** premium rows for every person in the requested
  family composition (e.g. no `two_adult` price offered unless a spouse premium row exists)

Results are sorted cheapest Grand Total first.

## 5. Discounts — formulas only, never hardcode values

| Type | Formula | Applied to |
|---|---|---|
| Coupon | fixed ৳, or `round(percent_off% × base)` capped at `maximum_discount` | Net (then recompute VAT/SD/SC) or Gross, per coupon's `applied_on` |
| Affiliate ref code | fixed ৳ or `% × Net` | subtracted from Grand Total |
| Business Partner | `discount% × Net` (trade discount) + `cashback% × Net` (cashback) | both subtracted from Grand Total |
| Biker Bima agent commission | flat ৳ (site setting) | subtracted from Grand Total, only for one configured product + logged-in agent buyer. **Not configured in live data today** (no `biker_bima_*` site-meta rows exist). |

Coupons/discounts are promotional, time-boxed, DB-driven rows — **never freeze their
values into AI training data.** Any AI answering "what discount applies" must query
live data, not a snapshot.

## 6. Internal cost — NEVER quote to a customer

Each premium row also carries a **sourcing price** (flat ৳, or `% × Net + VAT`) — what
Bimafy pays the insurer. `Grand Total − Sourcing Cost ≈ Bimafy's margin` on that sale.
This lives in `pricing-data.json` under `internal_cost_do_not_show_customer`, kept
structurally separate from the customer-facing fields. **An AI trained on this file
must be instructed to only ever surface `prices_by_insurance_for.*.grand_total_customer_pays`
to a customer — never the internal-cost block.**

## 7. Known edge case (flag for engineering, doesn't affect real customer quotes)

The PHP price accessors (`getTwoAdultAttribute()` etc.) don't validate that every
required premium row exists — e.g. `getTwoAdultAttribute()` sums primary + secondary
adult, but if no secondary-adult row exists it silently returns primary-only as the
"two adult" price instead of erroring. Confirmed on live variation id 218 ("Shanta
AcciShield"): calling `->two_adult` directly returns ৳280, identical to `->one_adult`,
because no spouse premium row exists. The normal customer search (`findPlansV3`)
already filters this out correctly — customers can't select "2 adults" for that plan.
But **any other code path that loads a `HealthPlanVariation` by id and reads
`->$insurance_for` directly (e.g. old links, admin tools, channel/API integrations)
must validate premium-row completeness first**, or it can silently undercharge.
`pricing-data.json` only lists a combo when the underlying data is genuinely complete,
matching what a customer can actually buy.

## 8. Live data snapshot (bimafy_sep24, 2026-09-24)

- 6 insurance companies
- Health: 45 plans total, **24 live on the public site** (active + b2c), 232 variations total / 114 live
- Accident: 32 plans total, **2 live on the public site**, 35 variations total / 5 live
- VAT observed: only 0% or 15% (standard BD rate) — never any other %
- Stamp duty observed: always ৳0 across every variation (schema supports it, unused)

See `pricing-data.json` / `pricing-data.js` for every company, plan, variation,
premium row, and computed price — nothing omitted, including inactive/b2b plans
(tagged `is_active` / `commercial_type` / `is_live_on_public_site` so they're never
confused with what's actually sellable right now). Open `index.html` for the
browsable/interactive version of this same data.
