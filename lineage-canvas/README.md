# Lineage Canvas

**Lineage Canvas** is a local-first web app for mapping and analyzing **data lineage** through complex system migrations (for example, **SAS → Snowflake**). You build an interactive graph of tables and columns, track rich metadata, trace how a single column flows across the whole graph, and run side-by-side comparisons between snapshots, systems, or projects.

Everything runs **entirely in your browser** — there is no backend and no server to deploy. All your work is saved locally in the browser's IndexedDB.

---

## Table of contents

1. [Key features](#key-features)
2. [Tech stack](#tech-stack)
3. [Prerequisites](#prerequisites)
4. [Installation](#installation)
5. [Running the app](#running-the-app)
6. [Core concepts](#core-concepts)
7. [Step-by-step usage guide](#step-by-step-usage-guide)
8. [Importing data](#importing-data)
9. [Comparison & difference analysis](#comparison--difference-analysis)
10. [Where your data lives](#where-your-data-lives)
11. [Regenerating the Excel templates](#regenerating-the-excel-templates-optional)
12. [Project structure](#project-structure)
13. [Troubleshooting](#troubleshooting)
14. [FAQ](#faq)

---

## Key features

- **Local-first** — no accounts, no backend. Data is stored in your browser via IndexedDB (Dexie.js).
- **Interactive lineage graph** — pan/zoom canvas with table nodes, table-level and column-level edges, and one-click **Auto Layout**.
- **Projects → Canvases → Systems** hierarchy — organize migrations into projects, capture point-in-time snapshots as canvases, and split each canvas into **Legacy** and **Target** lanes.
- **Column-level lineage tracing** — click any column to highlight its full upstream + downstream lineage across every connected table, so you can follow a single field end-to-end.
- **Rich metadata editing** — capture table metadata (environment, domain, grain, row/column counts, keys, refresh frequency) and per-column metadata + profiling statistics.
- **Incremental ingestion** — progressively build the map by importing **Excel** workbooks or **JSON** lineage extracts; re-import any time to enrich existing nodes.
- **Comparison views** — compare Legacy vs Target, two snapshots, across projects, or arbitrary column pairs, with a **"Only differences"** toggle to focus on what changed.
- **Undo / redo** — full time-travel for graph edits.
- **Global search** — jump to any table by name.

---

## Tech stack

| Area | Library |
| --- | --- |
| UI framework | React 19 + Vite |
| Language | TypeScript |
| State / undo-redo | Zustand + Zundo |
| Local database | Dexie.js (IndexedDB) |
| Canvas / graph | @xyflow/react (React Flow) |
| Auto-layout | ELK.js |
| Validation | Zod |
| Styling / components | Tailwind CSS + Base UI (shadcn-style) |
| Spreadsheet I/O | SheetJS (`xlsx`) |

---

## Prerequisites

- **Node.js 20 or newer** (Vite 8 requires a modern Node runtime). Check with:
  ```bash
  node -v
  ```
- **npm** (bundled with Node). Yarn/pnpm work too if you prefer.
- A modern browser (Chrome, Edge, Firefox, or Safari). IndexedDB must be enabled — it is, unless you are in a hardened private/incognito mode.

> **Tip:** If you need to install or switch Node versions, [nvm](https://github.com/nvm-sh/nvm) makes it easy: `nvm install 20 && nvm use 20`.

---

## Installation

```bash
# 1. Get the code
git clone <your-repo-url>
cd migrator/lineage-canvas      # the app lives in the lineage-canvas folder

# 2. Install dependencies
npm install
```

That's it — there is nothing else to configure. No environment variables, no database setup.

---

## Running the app

### Development (with hot reload)

```bash
npm run dev
```

Vite prints a local URL (typically **http://localhost:5173**). Open it in your browser. Edits to the source reload automatically.

### Production build

```bash
npm run build
```

This type-checks and bundles the app into the `dist/` folder.

### Preview the production build locally

```bash
npm run preview
```

### Lint

```bash
npm run lint
```

### Deploying

The build output in `dist/` is fully static — you can host it on any static host (GitHub Pages, Netlify, Vercel, S3, an internal web server, etc.). Because all data stays in the browser, no server-side runtime is required.

---

## Core concepts

Understanding the hierarchy makes the rest of the app intuitive:

- **Project** — a migration initiative. It defines the names of your two systems, e.g. **Legacy = "SAS"** and **Target = "Snowflake"**.
- **Canvas** — a point-in-time **snapshot** within a project (e.g. `As-Is`, `2024-Q1`, `Post-migration`). Comparing canvases lets you see how the model evolved.
- **System lanes (Legacy / Target)** — every canvas has two tabs. Legacy tables live in one lane, Target tables in the other.
- **Table node** — a dataset/table, shown as a card with its namespace, name, column/row counts, and a column list.
- **Column** — a field within a table, with its own metadata and statistics.
- **Edges** —
  - **Table edges** connect whole tables (table-to-table flow).
  - **Column edges** connect individual columns (column-to-column lineage).
- **Lineage trace** — selecting a column computes its full connected lineage (everything upstream and downstream) across the entire graph.

---

## Step-by-step usage guide

### 1. Create a project

1. In the left **Projects** sidebar, click **New**.
2. Enter a project name and the display names for your **Legacy** and **Target** systems (e.g. `SAS` and `Snowflake`).
3. A first canvas is created automatically.

> The sidebar is **collapsible** (chevron in its header) and **resizable** (drag its right edge). Your preference is remembered between sessions.

### 2. Add / manage canvases (snapshots)

- Hover a project in the sidebar and use the inline icons to **add a canvas**, **duplicate**, **rename**, or **delete**.
- Click a canvas to open it on the main canvas area.
- Duplicating a canvas (or a whole project) deep-copies all tables, columns, and edges — useful for "what-if" snapshots.

### 3. Add a table manually

1. Click **+ New Table** in the top header.
2. Choose the **System** (Legacy or Target), enter the **Namespace** (schema/library) and **Table Name**.
3. Click **Create Table**. The node appears on the matching system lane.

> Namespace, name, and system are **immutable** after creation (they form the table's identity). Everything else can be edited later.

### 4. Work with the canvas

- Switch between the **Legacy** and **Target** tabs above the canvas.
- **Drag** nodes to arrange them; positions are saved automatically.
- Click **Auto Layout** (top-right of the canvas) to tidy the graph with ELK.js.
- Use the canvas controls (bottom-left) to zoom and fit.
- The node header shows the **namespace**, **table name**, and a **`N columns · M rows`** summary. Each node lists up to **5 columns**, with a **"+X more columns"** row to expand the rest.

### 5. Edit table & column metadata

- **Click a table node's header** to open the **details panel** on the right. It has two tabs:
  - **Metadata** — description, environment, business domain, row/column counts, primary key, unique keys, grain, refresh frequency. Click **Save Metadata** to persist.
  - **Columns** — add, search, reorder, or remove columns.
- **Click a column** (in the details panel's Columns tab, or on the node) to open the **column editor panel**, which slides out from the details panel. Edit the column's data type, nullability, length/precision, default, definition, computation formula, and profiling **statistics** (null count, min/max, uniques, mean, stddev, sum). Click **Save**.
- To delete a table, open its details panel and use the **Danger Zone → Delete Table**.

### 6. Create edges (connections)

Edges are drawn directly on the canvas by dragging from one node's connection handle to another's:

- **Table-level edge** — drag from the handle on a node's **left/right border** to another node's border handle.
- **Column-level edge** — drag from a specific **column's handle** (the small dot beside a column row) to another column's handle.

**Deleting an edge:** click the edge to select it, then press **Delete** or **Backspace**. Deletions are permanent (they persist even after moving nodes or reloading).

### 7. Trace column lineage

This is the fastest way to follow a field end-to-end:

1. **Click a column** in any table node.
2. The graph enters **trace mode**:
   - The clicked node is highlighted, and a **"Tracing lineage for `<column>`"** banner appears (top-left).
   - Every node that participates in that column's lineage collapses to show **only its connected columns**; unrelated nodes are dimmed.
   - The connecting column edges are emphasized.
3. Click **another column of interest** to re-root the trace on it (the view re-focuses and re-traces from the new point).
4. Click the **same** column again, or the banner's **Exit** button, to return to the normal view.

### 8. Search, undo, redo

- Use the **Search tables…** box in the header to jump to any table by name; selecting a result opens its details.
- Use the **undo / redo** arrows in the header to step through graph edits.

---

## Importing data

You can build the lineage map incrementally by importing files. Re-importing is safe and **additive** — it enriches existing tables/columns rather than wiping your work.

### Option A — Excel template (recommended for manual entry)

1. In the header, click **Download Template** to get `Lineage_Canvas_Template.xlsx`.
2. Fill it in (see structure below), then click **Upload Excel** and choose your file.
3. A summary dialog reports how many tables, table links, and column links were imported, plus any warnings.

**Template structure:**

- **INSTRUCTIONS** and **MASTER** sheets are reserved (never imported as tables).
- The **MASTER** sheet has four sections:
  - **PROJECT** — project/system names.
  - **TABLE REGISTRY** — maps each fixed sheet (`TABLE_1` … `TABLE_15`) to a `table_name`. **Only registry rows that have a `table_name` are imported** (up to 15 tables).
  - **TABLE CONNECTIONS** — table-to-table edges (dropdowns reference registered tables).
  - **COLUMN CONNECTIONS** — column-to-column edges.
- Each **`TABLE_n`** sheet holds that table's metadata and a column grid. The table's name comes from the registry, not the sheet.

> A pre-filled example, `Lineage_Canvas_Sample_Filled.xlsx`, ships in `public/templates/` — open it to see exactly how a small SAS → Snowflake migration is expressed.

### Option B — JSON lineage extract (for automated / AI tooling)

If you generate lineage programmatically (e.g. by parsing SAS/SQL, or via an AI agent), export a JSON extract and click **Upload JSON**. The file is validated against a Zod schema (`src/schema/lineageSchema.ts`). Imports are **additive** — they add tables/columns/connections and never overwrite existing metadata or delete connections; re-importing the same file is idempotent.

> **Extracting lineage from SAS/SQL/Snowflake with an AI agent?** Use the header **Downloads** menu to get the JSON schema and a dialect-specific prompt (SAS / SQL / Snowflake), then see **[`EXTRACTION.md`](./EXTRACTION.md)** for the end-to-end workflow (extract → Upload JSON → validation screen).

Minimal shape (`schema_version` must be `"1.0"`):

```json
{
  "schema_version": "1.0",
  "extract": {
    "extract_id": "ext-001",
    "source_system": "LEGACY",
    "source_file_name": "claims_etl.sas",
    "default_namespace": "WORK"
  },
  "datasets": [
    {
      "dataset_id": "WORK.CLAIMS",
      "system": "LEGACY",
      "namespace": "WORK",
      "name": "CLAIMS",
      "qualified_name": "WORK.CLAIMS",
      "columns": [
        { "name": "CLAIM_ID", "data_type": "NUMBER", "ordinal": 1 }
      ]
    }
  ],
  "processes": [],
  "table_edges": [
    { "edge_id": "te-1", "from_dataset": "WORK.RAW", "to_dataset": "WORK.CLAIMS", "process_id": "p1" }
  ],
  "column_edges": [
    {
      "edge_id": "ce-1",
      "target": { "dataset_id": "WORK.CLAIMS", "column": "CLAIM_ID" },
      "sources": [ { "dataset_id": "WORK.RAW", "column": "ID" } ],
      "process_id": "p1",
      "transformation_type": "RENAME"
    }
  ]
}
```

`datasets`, `processes`, `table_edges`, and `column_edges` are all optional — send whatever you have.

### Upload history

Click **Upload History** in the header to review past uploads and remove an upload's contribution if needed.

---

## Comparison & difference analysis

Open comparison mode from the **Compare** icon on a project in the sidebar. There are three modes (switch with the toggle in the comparison header):

- **Legacy vs Target** — compare a Legacy table against a Target table within the current project.
- **Across projects** — compare any two tables from any projects/canvases.
- **Compare columns** — pair up arbitrary columns (tables and names need not match) and diff them field by field.

Useful controls in the comparison header:

- **Only differences** — a checkbox that hides identical rows across **all** diff surfaces (table metadata, the column list, and column-pair fields), so you see just what changed. Toggle it off to see the full comparison again.
- **Fields (n/total)** — choose which metadata fields participate in the comparison.
- **Save view / Update view** — name and save a comparison so you can reopen it later (saved views appear under the project in the sidebar).

Color coding: **added** (green), **removed** (red), **changed** (amber), **same** (grey).

---

## Where your data lives

- All projects, canvases, tables, columns, edges, and saved comparisons are stored in your browser's **IndexedDB** (via Dexie.js). Nothing is sent anywhere.
- **Implications:**
  - Data is **per-browser, per-device**. Opening the app in a different browser or machine shows an empty workspace.
  - Clearing site data / browser storage **deletes your work**. Avoid "clear cookies and site data" for this origin unless you intend to reset.
  - Private/incognito windows usually discard storage when closed.
- **Backups / sharing:** use the **Excel** export/import flow as a portable, human-readable backup, or generate a **JSON** extract. Re-importing reconstructs the graph in another browser.

---

## Regenerating the Excel templates (optional)

The downloadable workbooks contain native Excel dropdowns that the in-browser `xlsx` library can't emit, so they are authored with Python (openpyxl) and committed under `public/templates/`. You only need this if you change the template structure.

```bash
python3 -m venv /tmp/tplvenv
/tmp/tplvenv/bin/pip install openpyxl

# Rebuild the blank template
/tmp/tplvenv/bin/python scripts/build_template.py

# Rebuild the filled sample (depends on the template above)
/tmp/tplvenv/bin/python scripts/build_sample.py
```

Outputs:
- `public/templates/Lineage_Canvas_Template.xlsx`
- `public/templates/Lineage_Canvas_Sample_Filled.xlsx`

The matching importer lives in `src/lib/excelService.ts`.

---

## Project structure

```
lineage-canvas/
├── public/
│   ├── templates/            # Downloadable Excel template + filled sample
│   ├── favicon.svg
│   └── icons.svg
├── scripts/
│   ├── build_template.py     # Generates the .xlsx template (openpyxl)
│   └── build_sample.py       # Generates the filled sample workbook
├── src/
│   ├── components/
│   │   ├── canvas/           # LineageGraph, table node, custom edges
│   │   ├── compare/          # CompareView (difference analysis)
│   │   ├── ui/               # Reusable UI primitives (button, dialog, …)
│   │   ├── DetailsPanel.tsx       # Table metadata + columns
│   │   ├── ColumnEditorPanel.tsx  # Per-column metadata + stats
│   │   ├── ProjectSidebar.tsx     # Projects / canvases tree
│   │   ├── Header.tsx             # Search, import/export, undo-redo
│   │   └── …
│   ├── db/                   # Dexie database, repository, ingestion
│   ├── lib/                  # compare, excelService, uploadService, layout
│   ├── schema/               # Zod schema for JSON lineage extracts
│   ├── store/                # Zustand store (app state + actions)
│   ├── types/                # Shared TypeScript models
│   ├── App.tsx               # Layout shell
│   └── main.tsx              # Entry point
├── index.html
├── package.json
├── tailwind.config.js
└── vite.config.ts
```

---

## Troubleshooting

- **`npm run build` fails during the `tsc -b` step.** You can still produce a working bundle with Vite directly:
  ```bash
  npx vite build
  ```
- **Port 5173 is already in use.** Vite offers the next free port, or you can set one: `npm run dev -- --port 3000`.
- **My data disappeared.** It is tied to the browser/origin and is wiped if you clear site data or use a private window. Restore from your last Excel/JSON export.
- **An Excel import did nothing.** Make sure each sheet you want imported has a `table_name` entered in the **TABLE REGISTRY** on the MASTER sheet — rows without a name are skipped. The import summary dialog lists warnings.
- **Column edges don't appear after import.** Both endpoint tables/columns must exist; column edges that point at a missing dataset are skipped to keep the graph consistent.
- **Node version errors on install/build.** Upgrade to **Node 20+** (`node -v` to check).

---

## FAQ

**Is there a server or database to set up?**
No. The app is 100% client-side and stores everything in the browser.

**Can multiple people collaborate in real time?**
Not directly — storage is local to each browser. Share work by exporting/importing Excel or JSON files.

**Is my data uploaded anywhere?**
No. "Upload" in the UI means *load a file into your local browser workspace*, not send it to a server.

**Which migrations does it support?**
Any two-system migration. It ships with SAS → Snowflake defaults, but you can name the Legacy and Target systems anything (Mainframe → BigQuery, Oracle → Databricks, etc.).

**How do I start over?**
Delete projects/canvases from the sidebar, or clear this site's storage in your browser to reset everything.
