# Life & Health Corporate Pricing Engine

Internal calculator for building group life/health insurance proposals and small-team
retail quotes for corporate clients.

## Running it

No install, no build step, no server required. Just open `index.html` in a browser
(double-click it, or right-click → Open with → your browser).

## What it does

The tool switches between two modes based on headcount (threshold is editable in the UI,
default 10 employees):

- **Group Proposal mode** (≥10 people) — enter a census (employees / spouses / children /
  maternity-eligible members), then adjust each benefit's sum assured and rate against the
  insurer's negotiated range (sliders, with the original rate-card note visible on hover).
  Produces a line-item premium breakdown and grand total.
- **Retail Quote mode** (<10 people) — add each person (age, family composition, desired
  coverage) and the tool matches them against the live individual/family retail plan catalog,
  summing a quote across the team.

Both modes export to a clean, print-ready quotation via **Download / Print PDF** (browser's
native print-to-PDF, so no external dependency). The insurer's real name can be anonymized on
the exported quotation via a checkbox in Proposal Details — useful when a deal isn't locked to
one underwriter yet.

## Data

- `data/group-rate-card.js` — hand-maintained group insurance rate cards. Every benefit's
  `note` field is the raw text the rate came from, so ranges/sliders can be traced back to
  source. Add new insurers by adding another entry to `window.GROUP_RATE_CARDS.insurers`.
- `data/retail-pricing-data.js` — snapshot of the live retail health/accident plan catalog
  (company, plan, variation, age band, coverage, premium). **Internal cost / margin fields
  have been stripped from this published copy** — only customer-facing prices are included.
  See `data/RETAIL-ALGORITHM-SOURCE.md` for the full pricing algorithm this was derived from.

## Known limitations / open items

- OPD is priced at BDT 200 per BDT 1,000 of annual OPD limit (slider keeps the 80-250 range from the raw notes).
- Hospital daily cash: the raw note ".9 to 1.5k per thousand" is read as BDT 900-1,500 per BDT 1,000 of nightly
  benefit per year. 3-6 nights at a stretch use the base rate; each extra night (7-10) adds a loading that is a
  **placeholder (10% per night)** until the insurer quotes it. Confirm both with the insurer.
- Maternity has been removed from the group rate card.
- Family-loading multipliers (30% / 65%) are a manual per-benefit override, not auto-applied.
- Quotations can be sent by email (mailto), WhatsApp (wa.me) or copied as text from the quotation screen; the PDF
  still has to be attached manually because browsers cannot attach files to a mailto link.
- Only one insurer (Pragati) has a group rate card so far; add more under `data/group-rate-card.js`.
