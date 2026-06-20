#!/usr/bin/env python3
"""
Produce a filled SAMPLE workbook for testing ingestion.

Loads the generated template (preserving its dropdowns/validations and styling)
and fills it with a small, coherent SAS -> Snowflake migration so the importer
can be exercised end to end.

    /tmp/tplvenv/bin/python scripts/build_sample.py

Output: public/templates/Lineage_Canvas_Sample_Filled.xlsx
"""

import os
from openpyxl import load_workbook

HERE = os.path.dirname(__file__)
TEMPLATE = os.path.abspath(os.path.join(HERE, "..", "public", "templates", "Lineage_Canvas_Template.xlsx"))
OUT = os.path.abspath(os.path.join(HERE, "..", "public", "templates", "Lineage_Canvas_Sample_Filled.xlsx"))


def set_kv(ws, key, value):
    """Set the value next to a key in a 'Field | Value' block (column A -> B)."""
    for row in ws.iter_rows(min_col=1, max_col=1):
        if str(row[0].value).strip() == key:
            ws.cell(row=row[0].row, column=2, value=value)
            return
    raise KeyError(f"{key} not found on {ws.title}")


def header_row(ws, first_cell):
    for row in ws.iter_rows(min_col=1, max_col=1):
        if str(row[0].value).strip() == first_cell:
            return row[0].row
    raise KeyError(f"header {first_cell} not found on {ws.title}")


def headers_at(ws, hrow):
    out = {}
    c = 1
    while True:
        v = ws.cell(row=hrow, column=c).value
        if v is None or str(v).strip() == "":
            break
        out[str(v).strip()] = c
        c += 1
    return out


def fill_grid(ws, first_cell, rows):
    """Fill rows under a header row, mapping dict keys to header columns."""
    hrow = header_row(ws, first_cell)
    cols = headers_at(ws, hrow)
    for i, record in enumerate(rows):
        r = hrow + 1 + i
        for key, val in record.items():
            if key in cols:
                ws.cell(row=r, column=cols[key], value=val)


def fill_table(ws, meta, columns):
    for k, v in meta.items():
        set_kv(ws, k, v)
    fill_grid(ws, "column_name", columns)


def fill_registry(ws, mapping):
    """mapping: {sheet_name: table_name}. Writes table_name beside each sheet row."""
    hrow = header_row(ws, "sheet_name")
    r = hrow + 1
    while True:
        sheet = ws.cell(row=r, column=1).value
        if sheet is None or str(sheet).strip() == "":
            break
        name = mapping.get(str(sheet).strip())
        if name:
            ws.cell(row=r, column=2, value=name)
        r += 1


# ---------------------------------------------------------------------------
# Sample data — SAS -> Snowflake claims migration
# ---------------------------------------------------------------------------
PROJECT = {
    "project_name": "Claims Migration (Sample)",
    "legacy_system_name": "SAS",
    "target_system_name": "Snowflake",
    "canvas_name": "As-Is",
}

REGISTRY = {
    "TABLE_1": "CUST_RAW",
    "TABLE_2": "CUSTOMERS",
    "TABLE_3": "ORDERS",
    "TABLE_4": "CUSTOMER_SUMMARY",
}

TABLES = {
    "TABLE_1": (
        {
            "system": "LEGACY", "namespace": "CLAIMSLIB",
            "description": "Raw customer extract from the legacy SAS claims system.",
            "environment": "PROD", "business_domain": "Claims",
            "row_count": 1280000, "has_primary_key": "TRUE",
            "unique_key_columns": "CUST_ID", "grain_description": "one row per customer",
            "refresh_frequency": "DAILY",
        },
        [
            {"column_name": "CUST_ID", "data_type": "num", "nullable": "FALSE", "null_count": 0, "unique_count": 1280000},
            {"column_name": "NAME", "data_type": "char", "nullable": "TRUE", "max_length": 200},
            {"column_name": "SIGNUP_DT", "data_type": "num", "nullable": "TRUE", "column_definition": "SAS date value"},
        ],
    ),
    "TABLE_2": (
        {
            "system": "TARGET", "namespace": "ANALYTICS.CORE",
            "description": "Cleansed customer master (one row per customer).",
            "environment": "PROD", "business_domain": "Policy",
            "row_count": 1250000, "has_primary_key": "TRUE",
            "unique_key_columns": "CUSTOMER_ID", "grain_description": "one row per customer",
            "refresh_frequency": "DAILY",
        },
        [
            {"column_name": "CUSTOMER_ID", "data_type": "NUMBER", "nullable": "FALSE", "precision": 38, "null_count": 0, "unique_count": 1250000, "column_definition": "Surrogate key"},
            {"column_name": "FULL_NAME", "data_type": "VARCHAR", "nullable": "FALSE", "max_length": 200, "column_definition": "Customer full name"},
            {"column_name": "SIGNUP_DATE", "data_type": "DATE", "nullable": "TRUE"},
        ],
    ),
    "TABLE_3": (
        {
            "system": "TARGET", "namespace": "ANALYTICS.CORE",
            "description": "Order fact table.",
            "environment": "PROD", "business_domain": "Billing",
            "row_count": 8400000, "has_primary_key": "TRUE",
            "unique_key_columns": "ORDER_ID", "grain_description": "one row per order",
            "refresh_frequency": "DAILY",
        },
        [
            {"column_name": "ORDER_ID", "data_type": "NUMBER", "nullable": "FALSE", "precision": 38},
            {"column_name": "CUSTOMER_ID", "data_type": "NUMBER", "nullable": "FALSE", "precision": 38},
            {"column_name": "AMOUNT", "data_type": "DECIMAL", "nullable": "FALSE", "precision": 12, "min_value": "0", "mean_value": 142.37},
        ],
    ),
    "TABLE_4": (
        {
            "system": "TARGET", "namespace": "ANALYTICS.MART",
            "description": "Per-customer rollup used by reporting.",
            "environment": "PROD", "business_domain": "Finance",
            "has_primary_key": "TRUE", "unique_key_columns": "CUSTOMER_ID",
            "grain_description": "one row per customer", "refresh_frequency": "DAILY",
        },
        [
            {"column_name": "CUSTOMER_ID", "data_type": "NUMBER", "nullable": "FALSE", "precision": 38},
            {"column_name": "FULL_NAME", "data_type": "VARCHAR", "nullable": "TRUE", "max_length": 200},
            {"column_name": "LIFETIME_VALUE", "data_type": "DECIMAL", "nullable": "TRUE", "precision": 14, "column_computation_formula": "SUM(ORDERS.AMOUNT)"},
        ],
    ),
}

TABLE_CONNECTIONS = [
    {"from_table": "CUST_RAW", "to_table": "CUSTOMERS", "description": "Cleanse & load into the target customer master."},
    {"from_table": "CUSTOMERS", "to_table": "CUSTOMER_SUMMARY", "description": "Customer attributes feed the rollup."},
    {"from_table": "ORDERS", "to_table": "CUSTOMER_SUMMARY", "description": "Orders aggregated into lifetime value."},
]

COLUMN_CONNECTIONS = [
    {"target_table": "CUSTOMERS", "target_column": "FULL_NAME", "source_table": "CUST_RAW", "source_column": "NAME"},
    {"target_table": "CUSTOMERS", "target_column": "CUSTOMER_ID", "source_table": "CUST_RAW", "source_column": "CUST_ID"},
    {"target_table": "CUSTOMER_SUMMARY", "target_column": "CUSTOMER_ID", "source_table": "CUSTOMERS", "source_column": "CUSTOMER_ID"},
    {"target_table": "CUSTOMER_SUMMARY", "target_column": "FULL_NAME", "source_table": "CUSTOMERS", "source_column": "FULL_NAME"},
    # Two sources for one target column (repeat the target):
    {"target_table": "CUSTOMER_SUMMARY", "target_column": "LIFETIME_VALUE", "source_table": "ORDERS", "source_column": "AMOUNT"},
    {"target_table": "CUSTOMER_SUMMARY", "target_column": "LIFETIME_VALUE", "source_table": "ORDERS", "source_column": "ORDER_ID"},
]


def main():
    wb = load_workbook(TEMPLATE)

    master = wb["MASTER"]
    for k, v in PROJECT.items():
        set_kv(master, k, v)
    fill_registry(master, REGISTRY)
    fill_grid(master, "from_table", TABLE_CONNECTIONS)
    fill_grid(master, "target_table", COLUMN_CONNECTIONS)

    for sheet, (meta, columns) in TABLES.items():
        fill_table(wb[sheet], meta, columns)

    wb.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
