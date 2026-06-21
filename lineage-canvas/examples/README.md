# Test fixture — P&C insurance SAS ETL

Two files for exercising ingestion and the lineage features end to end:

- **`pc_insurance_etl.sas`** — a moderately complex SAS job (the thing you'd extract lineage *from*).
- **`pc_insurance_etl.lineage.json`** — the matching v1.0 extract, so you can test the **Upload JSON** flow immediately without running an AI. It's also a reference for what an AI should produce from the `.sas` file.

The fixture is a single-system flow (raw → curated → marts). The **system (Legacy/Target) is chosen at import**, so the JSON contains none.

---

## Quick start (no AI needed)

1. `npm run dev` and open the app.
2. In the sidebar, create a **Project** (e.g. "P&C Insurance") — it makes a first **Canvas** automatically. *(Imports target an existing project/canvas.)*
3. Header → **Upload JSON** → pick `examples/pc_insurance_etl.lineage.json`.
4. In the **validation screen**:
   - Set **Project / Canvas / System** (use **Legacy**).
   - Find **CLAIM_STAGE** — its namespace is `DEFAULT_UNKNOWN` (it was a SAS `WORK` table). Change it to e.g. `STAGE`.
   - Optionally type some table metadata. Click **Import**.
5. On the canvas (**Legacy** tab) click **Auto Layout**. You should see **16 nodes** (15 tables + the `ADJ` stub) and the lineage between them.

## Full AI path

1. Header → **Downloads** → **Prompt — SAS** and **JSON schema**.
2. Paste the prompt + the schema + the contents of `pc_insurance_etl.sas` into your AI agent.
3. Save its JSON and **Upload JSON** as above. Compare it against the provided `.json` to sanity-check the extraction.

---

## What to test (feature → how)

| # | Capability | How to exercise it |
|---|---|---|
| 1 | **Namespaces** | RAW / INS / MART tables; `CLAIM_STAGE` arrives as `DEFAULT_UNKNOWN` → fix it in the validation screen. |
| 2 | **STUB creation** | `ADJ` (referenced by `CLAIM` but never defined) shows as a dashed "Metadata Pending" node. |
| 3 | **Target picker shows names** | Project / Canvas / System dropdowns show real names, not UUIDs. |
| 4 | **Column lineage tracing** | Click `POLICY_PREMIUM_SUMMARY.TOTAL_INCURRED` → traces upstream to `CLAIM_TRANSACTION.PAID_AMOUNT` + `RESERVE_CHANGE` → `PAY`. Participating nodes collapse to the relevant columns; others dim. Click another traced column to re-root; **Exit** clears. Also try `PARTY.PARTY_NAME` (two sources). |
| 5 | **Fan-out / fan-in** | `POLICY` feeds COVERAGE, INSURED_LOCATION, CLAIM(_STAGE) and the summary; `POLICY_PREMIUM_SUMMARY` fans in from 5 tables. |
| 6 | **Merge columns** | Open `POLICY` (click its header) → **Columns** tab → tick **CUST_ID** and **CUSTOMER_ID** → **Merge** → in the resolver keep name `CUSTOMER_ID` → **Merge columns**. One column remains; both inbound links from `POL.INSURED_ID` collapse to one. Trace it to confirm no orphan edges. |
| 7 | **Merge tables** | Re-upload the same JSON, but in validation change **CLAIM**'s namespace to e.g. `CLAIMS` → Import. Now `INS.CLAIM` and `CLAIMS.CLAIM` both exist. Shift-click both on the canvas → **Merge N tables** → resolve per-column conflicts, set name/namespace → **Merge**. Edges re-point to the merged table and de-dup; the two sources disappear. |
| 8 | **Additive re-import / idempotency** | Upload the same JSON twice with the *same* namespaces → no duplicate tables or edges; existing tables only gain columns. |
| 9 | **Edge create / delete** | Drag from a column's handle (the dot beside a column) to another column to add a link; click an edge then press **Delete/Backspace** to remove it (it stays gone after moving nodes / reload). |
| 10 | **Search · Undo/Redo** | Search a table by name in the header; undo/redo graph edits. |
| 11 | **Comparison + "Only differences"** | Duplicate the canvas (sidebar) *or* import the JSON into a second canvas/system, then open **Compare** → pick two tables → toggle **Only differences**. |
| 12 | **Downloads** | The Downloads menu serves the Excel template, the JSON schema, and the SAS/SQL/Snowflake prompts. |

## Expected counts (straight from the JSON, before any merge)

- **15** defined tables + **1** stub (`ADJ`) = **16 nodes**
- **17** table links · **67** column links

## Notes & gotchas

- **Table names must be unique within one extract** — the simplified schema keys tables by `name`. The fixture deliberately uses short raw names (`CUST`, `POL`, …) so they don't collide with the curated names (`PARTY`, `POLICY`, …). If an AI emits `raw.policy` and `ins.policy` both as `POLICY`, they'll collapse into one — rename one side.
- The **Excel** equivalent for comparison is `public/templates/Lineage_Canvas_Sample_Filled.xlsx` (same insurance domain).
