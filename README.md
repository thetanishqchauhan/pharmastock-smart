# PharmaStock Smart — MVP

An affordable inventory companion for independent pharmacies: batch-wise stock, expiry risk, low-stock alerts,
CSV import and draft reorder lists — **without replacing existing billing software**.

> Built from the *Smart Pharmacy Inventory Management System — Startup Blueprint* (Stage 1 MVP + FEFO guidance and
> expiry-cost exposure from Stage 2). All sample data is fictional.

## Features (Version 1)

| Blueprint feature | Where |
|---|---|
| Dashboard cards + daily action list | Dashboard |
| Medicine master (name, strength, form, manufacturer, unit, min stock, safety stock, lead time) | Medicines |
| Batch management (batch no., expiry, purchase price, MRP) | Medicine page → Stock in |
| Stock in / stock out (sale, supplier return, expired removal, damage) | Medicine page |
| FEFO guidance — sales auto-allocated to earliest-expiring, non-expired batches | Medicine page → Stock out |
| Corrections with mandatory reason and full history (never overwrites) | Medicine page → Correction, History |
| Expiry alerts with configurable window + purchase-cost exposure | Expiry |
| Low-stock alerts and reorder point / suggested quantity | Reorder |
| Draft purchase list (editable, exported as CSV — never auto-ordered) | Reorder |
| CSV import with column auto-mapping, validation and preview before saving | Import CSV |
| Search by name, brand, manufacturer or batch | Medicines |
| Exports: stock by batch, expiry report, purchase list, movement history | Each page |
| Login, per-pharmacy data separation, append-only ledger | Supabase mode |

### Smart logic (from the blueprint, unit tested)
- **Stock balance** = sum of all stock movements per batch (ledger). Expired batches are excluded from "available".
- **Avg daily sales** = sales in the last *N* days ÷ *N* (Settings → look-back).
- **Days of stock** = available ÷ avg daily sales (Example A: 20 ÷ 4 = 5).
- **Reorder point** = avg daily sales × lead time + safety stock, never below minimum stock (Example B: 4×3+5 = 17).
- **Suggested qty** = avg daily × (lead time + cover days) + safety stock − current stock.
- **Expiry exposure** = quantity × purchase price (Example C: 30 × ₹40 = ₹1,200) — a cost at risk, not a guaranteed loss.

### Two import modes
- **Received stock** — adds the file quantities as purchases.
- **Stock snapshot** — for pharmacies that keep their billing software: export current stock weekly and import it.
  Each batch is set to the file quantity; differences are recorded as "snapshot" movements and reductions are used as
  *estimated* sales for reorder suggestions. Batches missing from the file are left unchanged.

## Run it locally (demo mode — no account needed)

Requires [Node.js 18+](https://nodejs.org).

```bash
npm install
npm run dev        # open http://localhost:5173
npm test           # unit tests for inventory + import logic
```

In demo mode data is kept only in your browser (localStorage). Use **Settings → Load fictional sample data** to explore.

## Connect Supabase (login + cloud database)

1. Create a free project at <https://supabase.com>.
2. Dashboard → **SQL Editor** → paste `supabase/schema.sql` → **Run**.
3. Dashboard → **Project Settings → API**: copy the Project URL and the `anon` public key.
4. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. `npm run dev` → create an account → name your pharmacy.

What the database enforces:
- **Row Level Security** — users only see data of pharmacies they belong to.
- **Append-only stock ledger** — no update/delete on movements; corrections need a reason.
- **No negative batch stock** and **no sales from expired batches** (trigger).
- Batches cannot reference another pharmacy's medicines (composite foreign keys).

## Deploy (free tier)

`npm run build` produces `dist/` — deploy to Vercel, Netlify or Cloudflare Pages and set the two `VITE_SUPABASE_*`
environment variables there. Enable Supabase backups (or a scheduled export) before taking on a real pilot.

## Project structure

```
src/lib/inventory.js    core logic: ledger balances, expiry, FEFO, reorder, dashboard
src/lib/importer.js     CSV header mapping, validation, import planning
src/lib/dates.js        Indian date formats (DD/MM/YYYY, MM/YYYY, Mar-2027)
src/store/              localStore (demo) and supabaseStore — same interface
src/pages/              UI screens
supabase/schema.sql     tables, RLS policies, triggers
public/stock-import-template.csv
```

## Known limitations / next steps

- CSV only (Excel users: *Save As → CSV UTF-8*). Add `.xlsx` support if pilots ask for it.
- Multi-step saves (e.g. a large import) are not one transaction in Supabase mode; move them to a Postgres RPC before scale.
- Single role per pharmacy in the UI; add owner/staff permissions and member invites next.
- Stage 2 ideas from the blueprint: supplier comparison, slow-moving stock report, barcode scan, email alerts.
- Stage 3 (AI forecasting) only after enough real sales history — recommendations must stay human-approved.
- This tool does not control a separate billing system and does not by itself establish regulatory compliance.
