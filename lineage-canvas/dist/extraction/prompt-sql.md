# Lineage extraction prompt — SQL (generic)

Paste the prompt below into your AI agent, then attach **(1)** the JSON Schema `lineage-extract.schema.json` and **(2)** the SQL script. The agent returns one JSON object you load with **Upload JSON**. You choose the project, canvas, and system (Legacy/Target) and fix namespaces in the validation screen after upload — so the JSON contains no system or metadata.

```
ROLE
You extract data lineage from a SQL script and output a SINGLE JSON object that
validates against the provided schema "Lineage Canvas — Lineage Extract (v1.0)".
Output JSON ONLY — no Markdown, no code fences, no commentary.

WHAT TO EXTRACT (and nothing else)
- tables: every table/view the script READS or WRITES (FROM/JOIN, INSERT INTO,
  CREATE TABLE/VIEW AS SELECT, UPDATE, MERGE, CTAS).
- columns: for each table, the columns clearly referenced (SELECT lists, INSERT
  column lists, JOIN/WHERE/GROUP BY keys). Include data_type only when a DDL or CAST
  makes it explicit; otherwise omit.
- table_connections: one {from,to} per source-table -> target-table relationship.
- column_connections: one entry per OUTPUT column, listing the source column(s) it
  derives from (direct, alias/rename, CAST, expression inputs, aggregate inputs).

RULES
- Do NOT include any system (Legacy/Target) and do NOT include any metadata,
  transformation types, expressions, processes, or confidence. Only tables, columns,
  data types, and the two kinds of connections exist in this format.
- Reference tables by `name` everywhere; each table `name` must be UNIQUE in the
  output. UPPERCASE every table name, namespace, and column name.
- namespace = the schema when clear (e.g. SALES.CUSTOMERS -> namespace "SALES",
  name "CUSTOMERS"; DB.SCHEMA.TABLE -> namespace "DB.SCHEMA", name "TABLE"). If the
  schema is not clear, OMIT namespace or use "DEFAULT_UNKNOWN" (the user fixes it later).
- Resolve table aliases (e.g. `customers c`) back to real table names before output.
- Only include columns you can clearly resolve. For SELECT *, include only the columns
  you can actually determine; do not invent columns.
- A table used only in a connection may be omitted from `tables` (it becomes a stub),
  but prefer to list it.
- Output must parse against the schema. No comments, no trailing text.

Now read the SQL script and produce the JSON.
```

**Minimal example output**

```json
{
  "schema_version": "1.0",
  "tables": [
    { "name": "CUSTOMERS", "namespace": "SALES", "columns": [{ "name": "CUST_ID", "data_type": "INT" }, { "name": "CUST_NAME", "data_type": "VARCHAR" }] },
    { "name": "ORDERS", "namespace": "SALES", "columns": [{ "name": "CUST_ID" }, { "name": "AMOUNT" }] },
    { "name": "CUSTOMER_SUMMARY", "namespace": "SALES", "columns": [{ "name": "CUSTOMER_ID" }, { "name": "CUSTOMER_NAME" }, { "name": "TOTAL_SPEND" }] }
  ],
  "table_connections": [
    { "from": "CUSTOMERS", "to": "CUSTOMER_SUMMARY" },
    { "from": "ORDERS", "to": "CUSTOMER_SUMMARY" }
  ],
  "column_connections": [
    { "target": { "table": "CUSTOMER_SUMMARY", "column": "CUSTOMER_ID" }, "sources": [{ "table": "CUSTOMERS", "column": "CUST_ID" }] },
    { "target": { "table": "CUSTOMER_SUMMARY", "column": "TOTAL_SPEND" }, "sources": [{ "table": "ORDERS", "column": "AMOUNT" }] }
  ]
}
```
