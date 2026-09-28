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

- OPD and Maternity benefits in the Pragati rate card are modelled as flat per-member premiums
  rather than a per-mille-of-sum-assured formula, because the source notes didn't resolve
  cleanly to one — worth confirming the intended formula directly with the insurer.
  See the in-app "why this range?" tooltip on each benefit row for the exact source text.
- Family-loading multipliers (30% / 65%) are a manual per-benefit override, not auto-applied,
  since the source notes didn't specify which benefits they cover.
- Only one insurer (Pragati) has a group rate card so far — add more under
  `data/group-rate-card.js`.
