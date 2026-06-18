# Standalone Cross-System Lineage Migrator

A standalone, manual/import-driven web application for cross-system data lineage tracking, metadata capture, migration validation, JSON lineage import, deterministic merge, provenance, conflicts, and review workflows.

The product is intentionally **not** integrated with Databricks, Unity Catalog, Snowflake, SAS, OpenLineage, Spark, or any AI API. External AI tools may generate canonical JSON; this app validates, previews, imports, stores, visualizes, and audits it.

## Architecture

- **Frontend:** React + TypeScript + React Flow canvas.
- **Backend:** FastAPI + SQLModel.
- **Database:** SQLite MVP (`backend/lineage.db` locally), with models organized for PostgreSQL migration later.
- **Profiling:** pandas-powered CSV/Excel profiling endpoint.
- **Import validation:** JSON Schema in `backend/lineage.schema.json`.
- **Deployment:** Docker Compose.

## Domain separation

The schema separates:

1. Project workspace (`Project`)
2. System registry (`SystemRegistry`)
3. Asset catalog (`Asset`)
4. Column catalog (`ColumnCatalog`)
5. Process catalog (`Process`)
6. Lineage graph (`LineageEdge`)
7. Import provenance (`ImportBatch`, `ImportObject`, `LineageEvidence`)
8. Conflict handling (`Conflict`)
9. Migration mapping (`MigrationMapping`)
10. Validation result (`ValidationResult`)
11. Audit/checkpoint support (`AuditRecord`, `Checkpoint`)

Migration equivalence is modeled separately from lineage edges so SAS.CLAIMS and Snowflake.CLAIMS can be equivalents without implying physical data flow.

## Import flow

1. Upload a canonical lineage JSON file.
2. Backend validates it against `backend/lineage.schema.json`.
3. Preview returns source document, parser, counts, low-confidence counts, validation errors, and supported actions.
4. Confirmed import creates an `ImportBatch`.
5. Deterministic merge rules match assets, columns, processes, and edges.
6. Existing objects are reused; missing objects are created; incomplete assets become unresolved stubs.
7. Every imported asset, column, process, and edge is linked through `ImportObject`.
8. Every edge import adds a `LineageEvidence` record, preserving evidence over repeated uploads.
9. Edge conflicts create verbose `Conflict` records rather than overwriting existing lineage silently.

## Matching rules

- Assets: exact canonical identity, normalized qualified name, namespace + display name + type, else create new/stub.
- Columns: asset + normalized column name, else create.
- Processes: system + process name + sequence + source reference, else create stable generated name.
- Edges: source asset/column + target asset/column + process + lineage level + transformation expression. Existing matches are deduplicated and receive additional evidence.

## Canvas UI

The main UI is a React Flow lineage canvas with:

- Zoom/pan, minimap, controls, fit/refresh layout.
- Table/column/all lineage toggle.
- Search.
- Clean enterprise catalog-style nodes with system, asset type, environment, import, confidence/review-ready indicators, and unresolved warnings.
- Directional transformation edges with labels.
- Right-side detail drawer for selected nodes/edges.
- Import history and conflict panels.
- Preview modal for canonical JSON uploads.

## Seed data

On startup the backend seeds **Claims Analytics Modernization** with system-agnostic systems and two AI lineage imports:

- `data/samples/claims_transform_sas_lineage.json`
- `data/samples/claims_transform_snowflake_lineage.json`

Seed lineage includes SAS, Snowflake, and Power BI assets, table-level edges, column-level edges, import batches, import-object provenance, and evidence records.

## Local setup

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend API: <http://localhost:8000>

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend UI: <http://localhost:5173>

### Docker Compose

```bash
docker compose up --build
```

## Tests

```bash
cd backend && pytest
cd frontend && npm install && npm test
```

Backend tests cover JSON validation, asset matching, import merge logic, edge deduplication, and import provenance/evidence tracking.

## Known limitations

- SQLite is used for MVP; production should use PostgreSQL and Alembic migrations.
- Checkpoints currently persist snapshots but restore UI/API is not fully implemented.
- Review actions and conflict resolution records are modeled but only basic read APIs are exposed.
- CSV/Excel profiling returns preview metrics; saving profile records to normalized tables is a future enhancement.
- Canvas swimlane and layered modes are represented in UI controls/structure but not yet full layout algorithms.
- Basic UI smoke tests are included; full Playwright coverage is future work.
