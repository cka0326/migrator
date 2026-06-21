# Extracting lineage from SAS / SQL / Snowflake with an AI agent

Turn a script into lineage that **adds onto** your existing canvas — new tables, columns, and connections — without deleting or overwriting anything. An AI agent reads the script and produces a small JSON file; you load it with **Upload JSON**, then review and correct it in a validation screen before it lands.

## Get the artifacts

Use the header **Downloads** menu (or `public/extraction/`):

- **JSON schema** — [`extraction/lineage-extract.schema.json`](./public/extraction/lineage-extract.schema.json): the authoritative contract; every field's nuances are documented inline in its `description`.
- **Prompts** (one per dialect): [SAS](./public/extraction/prompt-sas.md) · [SQL](./public/extraction/prompt-sql.md) · [Snowflake](./public/extraction/prompt-snowflake.md).

## How to run it

1. Paste the relevant **prompt** into your AI agent, and attach **(1)** the **schema** and **(2)** the **script**.
2. The agent returns a single JSON object.
3. In the app, click **Upload JSON** and pick the file.
4. A **validation screen** opens: choose the target **project, canvas, and system (Legacy/Target)**, fix any namespaces (default `DEFAULT_UNKNOWN`), and set table metadata. Tables that already exist are flagged so they **merge** instead of duplicating.
5. Confirm to import.

## What the JSON contains (and deliberately omits)

The format is intentionally minimal — it mirrors the Excel template:

- **tables** — `name` (unique within the file, UPPERCASE), optional `namespace`, and the **clearly-referenced columns** with optional `data_type`.
- **table_connections** — `{ from, to }` by table `name`.
- **column_connections** — `{ target: {table, column}, sources: [{table, column}] }`.

It does **not** carry the system (you choose it at upload — Legacy and Target are independent flows), nor any metadata, transformation types, expressions, processes, or confidence. Metadata is added by you (table-level in the validation screen; column-level later via the editors).

```json
{
  "schema_version": "1.0",
  "tables": [
    { "name": "CUSTOMERS", "namespace": "SALES", "columns": [{ "name": "CUST_ID", "data_type": "NUMBER" }] },
    { "name": "CUSTOMER_SUMMARY", "columns": [{ "name": "TOTAL_SPEND" }] }
  ],
  "table_connections": [ { "from": "CUSTOMERS", "to": "CUSTOMER_SUMMARY" } ],
  "column_connections": [
    { "target": { "table": "CUSTOMER_SUMMARY", "column": "TOTAL_SPEND" }, "sources": [ { "table": "CUSTOMERS", "column": "CUST_ID" } ] }
  ]
}
```

## Additive & idempotent

- Import **creates** missing tables, **appends** only new columns to existing tables, and **adds** connections. It never overwrites existing metadata/columns or deletes connections.
- Identity is `SYSTEM:NAMESPACE.NAME` (composed from your validation-screen choices), so re-importing merges into the same tables. Connections use content-derived ids, so re-imports don't duplicate them.
- To remove an import's contribution, use **Upload History → Delete**.

## Cleaning up imperfect extraction

If the same table or column was imported twice under different names, use **Merge columns** (in a table's Columns tab) or **Merge tables** (select tables on the canvas) to reconcile them — connections are combined and de-duplicated automatically.

See `README.md` for general usage and `AGENTS.md` for code pointers.
