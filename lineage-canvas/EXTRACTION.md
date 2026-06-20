# Extracting lineage from SAS / SQL with an AI agent

This guide explains how to turn a SAS (or SQL) script into lineage that **adds onto** your existing canvas — new tables, columns, and connections — **without ever deleting or overwriting** anything you already have.

The mechanism reuses the app's existing **JSON import** path. An AI agent reads your script and produces a JSON extract that conforms to the app's v1.0 schema; you load it with the **Upload JSON** button. There is no special integration to install.

> **Copy-paste artifacts** (give both to the agent along with your script):
> - **Schema template:** [`extraction/lineage-extract.schema.json`](./extraction/lineage-extract.schema.json) — the authoritative JSON Schema; every field's nuances are documented inline in its `description`.
> - **Agent prompt:** [`extraction/EXTRACTION_PROMPT.md`](./extraction/EXTRACTION_PROMPT.md) — the ready-to-paste instructions.
>
> The rest of this file is the human-readable explanation behind those two artifacts.

> **Why JSON and not the Excel template?** JSON is the app's programmatic, additive, schema-validated import path. It merges into existing tables (preserving their metadata and columns), creates only what's missing, and never overwrites metadata. The Excel template, by contrast, is capped at 15 tables, must be a binary workbook with native dropdowns (not generatable by an LLM), and **overwrites** existing metadata on import — so it's the wrong tool for additive, AI-driven extraction. Excel stays the manual, human-entry path.

---

## TL;DR workflow

1. Give the AI agent three things: **the script**, **the system it belongs to** (Legacy/Target), and **your current table inventory** for the active canvas (each table's system + namespace + name — so it reuses exact identities instead of creating duplicates).
2. The agent returns **one JSON object** matching the schema below.
3. In the app, click **Upload JSON** and select the file.
4. The canvas reloads with the merged lineage. Re-importing the same file is safe (idempotent) — see [Additive guarantees](#additive-guarantees).

---

## Output format (the v1.0 contract)

The agent must emit a single JSON object validated by `src/schema/lineageSchema.ts` (`LineageExtractSchema`). Top-level shape:

```jsonc
{
  "schema_version": "1.0",                  // REQUIRED, must be exactly "1.0"
  "extract": {
    "extract_id": "string",                 // any unique id for this run
    "source_system": "LEGACY" | "TARGET",   // the script's primary system (SAS => LEGACY)
    "source_file_name": "string",           // see "unique filename" note below
    "default_namespace": "string?",         // optional fallback namespace
    "generated_by": "string?",
    "generated_at": "string?"               // ISO timestamp
  },
  "datasets":     [ /* DatasetSchema */ ],   // tables + their columns (optional)
  "processes":    [ /* ProcessSchema */ ],   // steps (PROC SQL / DATA step) (optional)
  "table_edges":  [ /* TableEdgeSchema */ ], // table -> table flow (optional)
  "column_edges": [ /* ColumnEdgeSchema */ ] // column -> column derivation (optional)
}
```

### dataset (`datasets[]`)
```jsonc
{
  "dataset_id": "LEGACY:SALES.CUSTOMERS",   // MUST be `<SYSTEM>:<NAMESPACE>.<NAME>` UPPERCASE — see Identity rules
  "system": "LEGACY",                        // LEGACY | TARGET
  "namespace": "SALES",                      // SAS libref / Snowflake schema (UPPERCASE)
  "name": "CUSTOMERS",                        // table name (UPPERCASE)
  "qualified_name": "SALES.CUSTOMERS",
  "columns": [
    { "name": "CUST_ID", "data_type": "NUMBER", "ordinal": 1 }   // names UPPERCASE
  ]
}
```

### process (`processes[]`)
```jsonc
{
  "process_id": "p1",
  "operation_type": "SAS_PROC_SQL",          // free text category, e.g. SAS_DATA_STEP, SAS_PROC_SQL, SF_CTAS
  "source_file": "build_customer_summary.sas",
  "inputs":  ["LEGACY:SALES.CUSTOMERS", "LEGACY:SALES.ORDERS"],  // dataset_ids
  "outputs": ["LEGACY:SALES.CUSTOMER_SUMMARY"],
  "sequence": 1,                              // optional
  "code_location": { "start_line": 3, "end_line": 9 },  // optional
  "description": "Aggregate orders per customer", // optional
  "snippet": "proc sql; create table ..."    // optional
}
```

### table edge (`table_edges[]`)
```jsonc
{ "edge_id": "te1", "from_dataset": "LEGACY:SALES.CUSTOMERS", "to_dataset": "LEGACY:SALES.CUSTOMER_SUMMARY", "process_id": "p1" }
```

### column edge (`column_edges[]`)
```jsonc
{
  "edge_id": "ce1",
  "target":  { "dataset_id": "LEGACY:SALES.CUSTOMER_SUMMARY", "column": "TOTAL_SPEND" },
  "sources": [ { "dataset_id": "LEGACY:SALES.ORDERS", "column": "AMOUNT" } ],
  "process_id": "p1",
  "transformation_type": "AGGREGATION",      // see vocabulary below
  "expression": "sum(o.amount)",             // optional
  "confidence": "HIGH"                        // HIGH | MEDIUM | LOW (optional)
}
```

`transformation_type` ∈ `DIRECT | RENAME | CAST | EXPRESSION | AGGREGATION | WINDOW | CASE | CONSTANT | UNKNOWN`.

> Note: the app **ignores** the payload's `edge_id` for storage identity and derives its own content-based id (so re-imports don't duplicate). Still include `edge_id` — the schema requires it.

---

## Identity rules (this is what makes it additive, not duplicative)

Every `dataset_id` is scoped to the active canvas internally as `` `${canvasId}::${dataset_id}` ``. To **merge into an existing table** instead of spawning a parallel stub, the extracted `dataset_id` must exactly equal the existing table's identity. The app builds table identity as:

```
<SYSTEM>:<NAMESPACE>.<NAME>      // all UPPERCASE,  e.g.  LEGACY:SALES.CUSTOMERS
```

Rules for the agent:
- **`dataset_id` = `<SYSTEM>:<NAMESPACE>.<NAME>`, UPPERCASE.** `system` ∈ `LEGACY|TARGET`; `namespace` = SAS libref or Snowflake schema; `name` = table name.
- **Column `name`s UPPERCASE** (existing columns are uppercase; matching avoids creating duplicate columns).
- **Reuse identities from the supplied inventory** whenever a table already exists, so new columns/edges attach to it.
- For a **SAS** file, datasets are `LEGACY`; mark a dataset `TARGET` only if the script creates a Snowflake-side structure.

If a referenced table isn't in `datasets[]`, the importer auto-creates a **STUB** node for it — so you can emit edges to tables you haven't fully described yet.

---

## Additive guarantees

What import does (see `src/db/ingestion.ts`):
- **Preserves** existing table metadata, existing columns (data type / metadata / stats), origin, completeness, and canvas position.
- **Appends** only new columns (`origin: 'LINEAGE'`); never removes or reorders existing columns.
- **Upserts** edges by content-derived id and **de-duplicates** within a batch — re-importing the same lineage does not create duplicate connections.
- **Never deletes** tables, columns, metadata, or connections during import.
- Runs atomically in one transaction; the canvas reloads afterward.

Re-import behavior:
- Uploading the **same file again** (or an updated version) is **always additive** — the app no longer supersedes/deletes a prior upload of the same name. Idempotent edge ids mean unchanged connections are upserted, not duplicated; genuinely new tables/columns/edges are added.
- To **remove** an upload's contribution, use **Upload History → Delete** in the app (the only intentional, user-driven removal path).
- **Tip:** still give each run a distinct `source_file_name` (e.g. include the script name + a timestamp) so the Upload History stays readable.

---

## Reusable agent prompt

Paste this as the system/instructions, then provide the script and the current table inventory.

```
You extract data lineage from a SAS (or SQL) script and output a single JSON object
that conforms EXACTLY to the Lineage Canvas v1.0 schema. Output JSON only — no prose.

CONTEXT YOU WILL BE GIVEN:
- SCRIPT: the SAS/SQL source.
- SOURCE_SYSTEM: LEGACY (for SAS) or TARGET.
- INVENTORY: existing tables in the canvas as a list of {system, namespace, name}.

RULES:
1. schema_version must be "1.0". Put SOURCE_SYSTEM in extract.source_system.
   Set extract.source_file_name to the script's filename plus a timestamp.
2. Identify every table the script READS (inputs) and WRITES (outputs).
3. dataset_id MUST be "<SYSTEM>:<NAMESPACE>.<NAME>" in UPPERCASE. namespace is the
   SAS libref or SQL schema; name is the table name. If a table matches one in
   INVENTORY, reuse that exact system/namespace/name so it merges (do not invent a
   new spelling). Column names UPPERCASE.
4. For each output column, infer its source column(s) and emit a column_edge with the
   right transformation_type from:
   DIRECT, RENAME, CAST, EXPRESSION, AGGREGATION, WINDOW, CASE, CONSTANT, UNKNOWN.
   Add `expression` with the SQL/formula and `confidence` (HIGH for direct, lower if
   inferred). Use UNKNOWN if you truly cannot tell.
5. Emit a table_edge for every input->output dataset pair.
6. Emit one process per DATA step / PROC SQL with operation_type, source_file,
   code_location (line range), and a short snippet.
7. NEVER describe deletions, renames of existing objects, or metadata changes — the
   format is additive only. Only add datasets, columns, and edges.
8. Output must be valid JSON parseable by the schema. Do not include comments.
```

---

## Worked example

**Input — `build_customer_summary.sas`:**
```sas
libname sales '/data/sales';

proc sql;
  create table sales.customer_summary as
  select c.cust_id            as customer_id,
         upper(c.cust_name)   as customer_name,
         sum(o.amount)        as total_spend
  from sales.customers c
  join sales.orders o on c.cust_id = o.cust_id
  group by c.cust_id, c.cust_name;
quit;
```

**Output JSON:**
```json
{
  "schema_version": "1.0",
  "extract": {
    "extract_id": "sas-customer-summary-2026-06-20T10:00:00Z",
    "source_system": "LEGACY",
    "source_file_name": "build_customer_summary.sas@2026-06-20T10:00:00Z",
    "default_namespace": "SALES",
    "generated_by": "lineage-extractor",
    "generated_at": "2026-06-20T10:00:00Z"
  },
  "datasets": [
    {
      "dataset_id": "LEGACY:SALES.CUSTOMERS",
      "system": "LEGACY", "namespace": "SALES", "name": "CUSTOMERS",
      "qualified_name": "SALES.CUSTOMERS",
      "columns": [
        { "name": "CUST_ID", "data_type": "NUMBER", "ordinal": 1 },
        { "name": "CUST_NAME", "data_type": "CHAR", "ordinal": 2 }
      ]
    },
    {
      "dataset_id": "LEGACY:SALES.ORDERS",
      "system": "LEGACY", "namespace": "SALES", "name": "ORDERS",
      "qualified_name": "SALES.ORDERS",
      "columns": [
        { "name": "CUST_ID", "data_type": "NUMBER", "ordinal": 1 },
        { "name": "AMOUNT", "data_type": "NUMBER", "ordinal": 2 }
      ]
    },
    {
      "dataset_id": "LEGACY:SALES.CUSTOMER_SUMMARY",
      "system": "LEGACY", "namespace": "SALES", "name": "CUSTOMER_SUMMARY",
      "qualified_name": "SALES.CUSTOMER_SUMMARY",
      "columns": [
        { "name": "CUSTOMER_ID", "data_type": "NUMBER", "ordinal": 1 },
        { "name": "CUSTOMER_NAME", "data_type": "CHAR", "ordinal": 2 },
        { "name": "TOTAL_SPEND", "data_type": "NUMBER", "ordinal": 3 }
      ]
    }
  ],
  "processes": [
    {
      "process_id": "p1",
      "sequence": 1,
      "name": "build customer_summary",
      "operation_type": "SAS_PROC_SQL",
      "source_file": "build_customer_summary.sas",
      "code_location": { "start_line": 3, "end_line": 11 },
      "inputs": ["LEGACY:SALES.CUSTOMERS", "LEGACY:SALES.ORDERS"],
      "outputs": ["LEGACY:SALES.CUSTOMER_SUMMARY"],
      "description": "Join customers to orders and aggregate spend per customer."
    }
  ],
  "table_edges": [
    { "edge_id": "te1", "from_dataset": "LEGACY:SALES.CUSTOMERS", "to_dataset": "LEGACY:SALES.CUSTOMER_SUMMARY", "process_id": "p1" },
    { "edge_id": "te2", "from_dataset": "LEGACY:SALES.ORDERS",    "to_dataset": "LEGACY:SALES.CUSTOMER_SUMMARY", "process_id": "p1" }
  ],
  "column_edges": [
    {
      "edge_id": "ce1",
      "target": { "dataset_id": "LEGACY:SALES.CUSTOMER_SUMMARY", "column": "CUSTOMER_ID" },
      "sources": [ { "dataset_id": "LEGACY:SALES.CUSTOMERS", "column": "CUST_ID" } ],
      "process_id": "p1", "transformation_type": "RENAME", "expression": "c.cust_id as customer_id", "confidence": "HIGH"
    },
    {
      "edge_id": "ce2",
      "target": { "dataset_id": "LEGACY:SALES.CUSTOMER_SUMMARY", "column": "CUSTOMER_NAME" },
      "sources": [ { "dataset_id": "LEGACY:SALES.CUSTOMERS", "column": "CUST_NAME" } ],
      "process_id": "p1", "transformation_type": "EXPRESSION", "expression": "upper(c.cust_name)", "confidence": "HIGH"
    },
    {
      "edge_id": "ce3",
      "target": { "dataset_id": "LEGACY:SALES.CUSTOMER_SUMMARY", "column": "TOTAL_SPEND" },
      "sources": [ { "dataset_id": "LEGACY:SALES.ORDERS", "column": "AMOUNT" } ],
      "process_id": "p1", "transformation_type": "AGGREGATION", "expression": "sum(o.amount)", "confidence": "HIGH"
    }
  ]
}
```

---

## Upload & verify

1. **Upload JSON** in the header → pick the file. A summary dialog reports datasets / table links / column links imported, plus warnings.
2. Confirm new tables/columns/edges appear and that any pre-existing table only **gained** columns (its metadata is untouched).
3. Re-upload the same file → confirm **no duplicate edges** appear and nothing is lost (idempotent import).
4. Use the column **lineage trace** (click a column) to follow the new end-to-end flow.

For schema/field semantics and code pointers, see `AGENTS.md`. For general usage, see `README.md`.
