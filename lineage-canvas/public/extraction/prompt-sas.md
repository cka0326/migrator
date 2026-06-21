# Lineage extraction prompt — SAS

Paste the prompt below into your AI agent, then attach **(1)** the JSON Schema `lineage-extract.schema.json` and **(2)** the SAS script. The agent returns one JSON object you load with **Upload JSON**. You choose the project, canvas, and system (Legacy/Target) and fix namespaces in the validation screen after upload — so the JSON contains no system or metadata.

```
ROLE
You extract data lineage from a SAS program and output a SINGLE JSON object that
validates against the provided schema "Lineage Canvas — Lineage Extract (v1.0)".
Output JSON ONLY — no Markdown, no code fences, no commentary.

WHAT TO EXTRACT (and nothing else)
- tables: every SAS data set the program READS or WRITES (DATA steps, PROC SQL
  CREATE TABLE/VIEW, PROC steps with OUT=, etc.).
- columns: for each table, the variables clearly referenced (in SELECT lists,
  KEEP/VAR statements, assignments, BY/JOIN keys). Include data_type only when the
  script makes it obvious (LENGTH/FORMAT/INFORMAT or explicit casts); otherwise omit.
- table_connections: one {from,to} per input-data-set -> output-data-set relationship.
- column_connections: one entry per OUTPUT column, listing the source column(s) it
  derives from (direct copy, rename, function, or aggregate inputs).

RULES
- Do NOT include any system (Legacy/Target) and do NOT include any metadata,
  transformation types, expressions, processes, or confidence. Only tables, columns,
  data types, and the two kinds of connections exist in this format.
- Reference tables by `name` everywhere; each table `name` must be UNIQUE in the
  output. UPPERCASE every table name, namespace, and column name.
- namespace = the SAS libref when clear (e.g. a two-level name like SALES.CUSTOMERS
  -> namespace "SALES", name "CUSTOMERS"). For one-level WORK data sets or when the
  libref is unclear, OMIT namespace or use "DEFAULT_UNKNOWN" (the user fixes it later).
- Only include columns you can clearly tie to the code. Do not invent columns. If a
  PROC SQL uses SELECT *, include only the columns you can actually resolve.
- A table used only in a connection may be omitted from `tables` (it becomes a stub),
  but prefer to list it.
- Output must parse against the schema. No comments, no trailing text.

Now read the SAS program and produce the JSON.
```

**Minimal example output**

```json
{
  "schema_version": "1.0",
  "tables": [
    { "name": "CUSTOMERS", "namespace": "SALES", "columns": [{ "name": "CUST_ID", "data_type": "NUMBER" }, { "name": "CUST_NAME", "data_type": "CHAR" }] },
    { "name": "ORDERS", "namespace": "SALES", "columns": [{ "name": "CUST_ID" }, { "name": "AMOUNT" }] },
    { "name": "CUSTOMER_SUMMARY", "namespace": "SALES", "columns": [{ "name": "CUSTOMER_ID" }, { "name": "CUSTOMER_NAME" }, { "name": "TOTAL_SPEND" }] }
  ],
  "table_connections": [
    { "from": "CUSTOMERS", "to": "CUSTOMER_SUMMARY" },
    { "from": "ORDERS", "to": "CUSTOMER_SUMMARY" }
  ],
  "column_connections": [
    { "target": { "table": "CUSTOMER_SUMMARY", "column": "CUSTOMER_ID" }, "sources": [{ "table": "CUSTOMERS", "column": "CUST_ID" }] },
    { "target": { "table": "CUSTOMER_SUMMARY", "column": "CUSTOMER_NAME" }, "sources": [{ "table": "CUSTOMERS", "column": "CUST_NAME" }] },
    { "target": { "table": "CUSTOMER_SUMMARY", "column": "TOTAL_SPEND" }, "sources": [{ "table": "ORDERS", "column": "AMOUNT" }] }
  ]
}
```
