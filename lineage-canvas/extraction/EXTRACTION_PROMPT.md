# Lineage extraction prompt (copy-paste)

Use this to turn a SAS/SQL script into a lineage JSON that loads additively into Lineage Canvas.

**How to use:** paste everything in the [Prompt](#prompt) block below into the AI agent, then attach (or paste) **two things**:

1. **The schema** — the contents of [`lineage-extract.schema.json`](./lineage-extract.schema.json) (the agent's output must validate against it).
2. **The code file** — the SAS/SQL script to analyze.

**Optional but strongly recommended (prevents duplicate tables):** also paste the **existing table inventory** for the canvas you'll import into — one line per table as `SYSTEM | NAMESPACE | NAME`. This lets the agent reuse exact identities so the new lineage merges into existing tables instead of creating parallel copies.

---

## Prompt

```
ROLE
You are a data-lineage extraction engine. You read a SAS or SQL script and output a
single JSON object describing its data lineage, for loading into the Lineage Canvas
app. You will be given: (A) a JSON Schema named "Lineage Canvas — Lineage Extract
(v1.0)"; (B) the SCRIPT to analyze; and optionally (C) an INVENTORY of tables that
already exist in the target canvas (lines of "SYSTEM | NAMESPACE | NAME").

OUTPUT
- Output ONLY one JSON object that validates against the provided schema.
- No Markdown, no code fences, no comments, no explanation — JSON only.
- If the script contains no derivable lineage, output:
  {"schema_version":"1.0","extract":{...},"datasets":[],"processes":[],"table_edges":[],"column_edges":[]}

CORE PRINCIPLE — ADDITIVE ONLY
The import is additive and never deletes or overwrites anything. So describe only what
should EXIST. Never express deletions, drops, renames-of-existing-objects, or metadata
overwrites. You may add new tables, new columns, and new connections.

IDENTITY RULES (critical — get these exactly right)
1. Every table's `dataset_id` MUST be "<SYSTEM>:<NAMESPACE>.<NAME>" in UPPERCASE, and
   must equal system + ":" + namespace + "." + name.
   - SYSTEM is LEGACY for SAS datasets; TARGET for the migration target (e.g. Snowflake).
   - NAMESPACE is the SAS libref or SQL schema (may itself be dotted, e.g. DB.SCHEMA).
   - NAME is the table name.
   Examples: "LEGACY:SALES.CUSTOMERS", "TARGET:ANALYTICS.PUBLIC.CUSTOMER_SUMMARY".
2. If a table appears in the INVENTORY, REUSE its exact SYSTEM/NAMESPACE/NAME so your
   lineage MERGES into it. Any spelling difference creates a duplicate table — avoid that.
3. UPPERCASE every identifier: system, namespace, table name, column names, and every
   dataset_id/column referenced anywhere (datasets, processes, edges).
4. If a SAS one-level dataset name has no libref, treat its namespace as WORK (so
   "customers" → "LEGACY:WORK.CUSTOMERS"), unless the INVENTORY/script implies otherwise.

WHAT TO EXTRACT
- datasets[]: every table the script READS or WRITES, with columns you can infer
  (declared columns and any column used in a column_edge). data_type = what the source
  says (or "UNKNOWN"); do not normalize types.
- processes[]: one per step (DATA step / PROC SQL / CTAS / etc.) with operation_type,
  source_file, inputs[] (dataset_ids read), outputs[] (dataset_ids written), and, when
  possible, code_location {start_line,end_line} and a short snippet.
- table_edges[]: one per (input dataset -> output dataset) a step establishes.
- column_edges[]: one per OUTPUT column, listing its source column(s) and the
  transformation_type:
    DIRECT (copied unchanged), RENAME (copied, new name), CAST (type change only),
    EXPRESSION (scalar/arith), AGGREGATION (SUM/COUNT/AVG/...), WINDOW (analytic),
    CASE (conditional), CONSTANT (literal), UNKNOWN (cannot tell).
  Include `expression` (the source formula) and `confidence` (HIGH/MEDIUM/LOW).

QUALITY RULES
- Be precise and conservative. If you cannot determine a column's source or the
  transformation, use transformation_type "UNKNOWN" rather than inventing lineage.
- For "SELECT *" expansions, map each propagated column as DIRECT/RENAME with
  confidence MEDIUM (or LOW if the column list is uncertain).
- A table referenced by an edge but not described in datasets[] is fine — it becomes a
  stub — but prefer to describe it.
- `edge_id` and `process_id` are local ids unique within this output (e.g. "te1","ce1",
  "p1"). edge_id values are not used as storage identity; you do not need them stable
  across runs.
- Set extract.source_system to the script's primary system (LEGACY for SAS), and
  extract.source_file_name to the file name plus a timestamp to keep upload history readable.

Now read the SCRIPT (and INVENTORY if provided) and produce the JSON.
```

---

## Minimal worked example (for reference — do not include in the agent's output)

Given this SAS:

```sas
libname sales '/data/sales';
proc sql;
  create table sales.customer_summary as
  select c.cust_id          as customer_id,
         upper(c.cust_name) as customer_name,
         sum(o.amount)      as total_spend
  from sales.customers c
  join sales.orders o on c.cust_id = o.cust_id
  group by c.cust_id, c.cust_name;
quit;
```

…a correct output is the JSON shown in [`../EXTRACTION.md`](../EXTRACTION.md#worked-example) (datasets `LEGACY:SALES.CUSTOMERS`, `LEGACY:SALES.ORDERS`, `LEGACY:SALES.CUSTOMER_SUMMARY`; one `SAS_PROC_SQL` process; two table edges into the summary; and three column edges — `CUSTOMER_ID` ← `CUST_ID` (RENAME), `CUSTOMER_NAME` ← `CUST_NAME` (EXPRESSION `upper(...)`), `TOTAL_SPEND` ← `AMOUNT` (AGGREGATION `sum(...)`)).

---

## After extraction

1. Save the agent's JSON to a `.json` file.
2. In Lineage Canvas, open the canvas you want to enrich and click **Upload JSON**.
3. The import is additive and idempotent — re-uploading the same file won't duplicate connections, and existing tables only gain new columns. To remove an upload's contribution, use **Upload History → Delete**.

See [`../EXTRACTION.md`](../EXTRACTION.md) for the full guide and [`lineage-extract.schema.json`](./lineage-extract.schema.json) for the authoritative field-by-field contract.
