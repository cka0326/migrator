# AGENTS.md — Lineage Canvas

Engineering guide for AI agents (and humans) doing development in this repository. It explains the architecture, data model, every module's responsibility, key methods, conventions, and the gotchas that bite. Read this before making changes.

> Scope: this file describes the app in `lineage-canvas/`. End-user docs live in `README.md`. Field semantics for metadata live in `../meta_data_capture.md`.

---

## 1. What this app is

A **local-first, single-page React app** for mapping **data lineage** across a two-system migration (default **SAS → Snowflake**, but system names are configurable per project). There is **no backend**. All state persists to **IndexedDB** in the browser. The UI is a pan/zoom graph canvas (React Flow) plus side panels for editing metadata and a separate comparison view.

Mental model of the domain hierarchy:

```
Project (defines Legacy + Target system display names)
└── Canvas (a point-in-time snapshot; owns all graph data)
    ├── System lane: LEGACY  ┐  (two tabs in the UI)
    └── System lane: TARGET  ┘
        ├── TableNode (a dataset/table)
        │   └── ColumnDef[] (fields, each with metadata + stats)
        ├── TableEdge (table → table)
        └── ColumnEdge (column → column, may have multiple sources)
```

---

## 2. Tech stack & tooling

- **React 19 + Vite 8**, **TypeScript** (strict).
- **Zustand** store with the **Zundo** `temporal` middleware for undo/redo.
- **Dexie.js** over IndexedDB for persistence.
- **@xyflow/react** (React Flow v12) for the canvas; **ELK.js** (`elkjs`) for auto-layout.
- **Zod** validates imported JSON.
- **Tailwind CSS v3** + **Base UI** (`@base-ui/react`) shadcn-style primitives in `src/components/ui/`.
- **SheetJS (`xlsx`)** reads/writes Excel in the browser.
- Path alias: **`@` → `src/`** (configured in `vite.config.ts` and tsconfig).

### Commands

```bash
npm run dev       # Vite dev server (HMR), usually http://localhost:5173
npm run build     # tsc -b && vite build  → dist/
npm run preview   # serve the production build
npm run lint      # eslint
```

> **Build gotcha:** `npm run build` runs `tsc -b` first. If the TypeScript build step crashes in this environment, verify with `npx vite build` (the Vite/Rolldown build is the source of truth for "does it bundle") and rely on IDE/`tsc` diagnostics for type errors. Always sanity-check with `npx vite build` after edits.

---

## 3. Directory map

```
src/
├── main.tsx                 # React root; imports index.css
├── App.tsx                  # Layout shell: Sidebar | (Header + Canvas + Panels)  OR  CompareView
├── index.css                # Tailwind layers + design tokens (CSS vars), base font-size, animations base
├── store/useStore.ts        # ★ Zustand store: ALL app state + actions (708 lines). Single source of truth.
├── db/
│   ├── database.ts          # Dexie schema (LineageCanvasDB_v2), table indexes
│   ├── repository.ts        # ★ All raw Dexie reads/writes. The store calls into this.
│   └── ingestion.ts         # JSON lineage extract → DB (ingestLineageJSON)
├── lib/
│   ├── compare.ts           # ★ Diff engine: compareTables / compareColumnPair / compareTableMetadata
│   ├── dataTypes.ts         # Cross-system type equivalence (SAS/Snowflake/PySpark/Pandas)
│   ├── excelService.ts      # ★ Excel template import (processExcelUpload)
│   ├── uploadService.ts     # Thin wrapper: file → ingestLineageJSON
│   ├── layout.ts            # ELK auto-layout (getLayoutedElements)
│   ├── workspaceUtils.ts    # Full workspace export/import to a JSON file
│   └── utils.ts             # cn() classname helper
├── schema/lineageSchema.ts  # Zod schema for the v1.0 JSON extract format
├── types/models.ts          # ★ All domain TypeScript interfaces
└── components/
    ├── Header.tsx               # Top bar: search, undo/redo, import/export, New Table
    ├── ProjectSidebar.tsx       # Projects/canvases tree; collapsible + resizable
    ├── NewTableDialog.tsx       # Manual table creation
    ├── DetailsPanel.tsx         # Right panel: table metadata (tab) + columns (tab)
    ├── ColumnManager.tsx        # Columns tab content (add/search/reorder/remove)
    ├── ColumnEditorPanel.tsx    # Per-column metadata + stats editor (emerges from DetailsPanel)
    ├── UploadsRegistry.tsx      # Upload history dialog
    ├── canvas/
    │   ├── LineageGraph.tsx     # ★ React Flow wrapper; store↔flow sync; edges; focus mode; per-system tab
    │   ├── CustomTableNode.tsx  # ★ Table node card; column list; lineage-trace click target
    │   ├── CustomTableEdge.tsx  # Bezier table edge
    │   └── CustomColumnEdge.tsx # Bezier column edge (no label/dialog by design)
    ├── compare/CompareView.tsx  # ★ Comparison UI (3 modes) + "Only differences" toggle
    └── ui/                      # Base UI / shadcn-style primitives (button, dialog, select, tabs, …)
```

★ = the files you'll touch most often.

---

## 4. Data model (`src/types/models.ts`)

All persisted entities. **Identity fields are immutable** once created.

- **`Project`** — `{ id, name, legacySystemName, targetSystemName, createdAt, updatedAt }`. The two system names are display labels only.
- **`Canvas`** — `{ id, projectId, name, ... }`. `id` is the **scope prefix** for every datasetId it owns.
- **`TableNode`** — the node. Key fields:
  - `datasetId` (**PK & React Flow node id**): `"${canvasId}::SYSTEM:QUALIFIED_NAME"`. Globally unique, immutable.
  - `canvasId`, `system` (`LEGACY|TARGET`), `namespace`, `name`, `qualifiedName` — all immutable identity.
  - `origin` (`STUB|EXCEL|MANUAL`), `completeness` (`STUB|PARTIAL|COMPLETE`).
  - `metadata: TableMetadata`, `columns: ColumnDef[]`, `position?`, `collapsed?`.
- **`ColumnDef`** — `{ name (UPPERCASE, immutable identity within node), dataType, ordinal, origin, metadata: ColumnMetadata, stats: ColumnStat, ... }`.
- **`TableEdge`** — `{ edgeId, canvasId, uploadId, fromDataset, toDataset, processId }`.
- **`ColumnEdge`** — `{ edgeId, canvasId, uploadId, target:{datasetId,column}, sources:[{datasetId,column}], processId, transformationType, expression?, confidence? }`. **One target, possibly many sources.**
- **`TableMetadata`** — description, environment (`DEV|TEST|UAT|PROD`), businessDomain, rowCount, columnCount, hasPrimaryKey, uniqueKeyColumns, grainDescription, refreshFrequency.
- **`ColumnMetadata`** — nullable, maxLength, precision, defaultValue, columnDefinition, columnComputationFormula.
- **`ColumnStat`** — nullCount, minValue, maxValue, uniqueCount, uniques, meanValue, stddevValue, sumValue.
- **`SavedComparison`** — persisted comparison view (`mode`, endpoints, `columnPairs`).
- **`UploadRec`**, **`ProcessRec`**, **`EditEvent`** — provenance/process/edit-log records.

### ID conventions (do not break these)

- `datasetId` = `` `${canvasId}::${SYSTEM}:${QUALIFIED_NAME}` `` (manual creation builds it in `NewTableDialog`; imports build it via `scope()` = `` `${canvasId}::${id}` ``).
- Manual table edge id: `` `TE|${source}|${target}|MANUAL` ``.
- Manual column edge id: `` `CE|${target}::${targetCol}|${source}::${sourceCol}|MANUAL` ``.
- `canvasOf(datasetId)` = substring before `"::"` (used throughout CompareView).

---

## 5. Persistence layer

### `db/database.ts`
Dexie DB **`LineageCanvasDB_v2`**. Tables and their indexes:
`projects, canvases, comparisons, tableNodes (PK datasetId), processRecs, tableEdges, columnEdges, uploadRecs, editEvents`. Bumping the schema requires a new `this.version(n).stores({...})` block.

### `db/repository.ts` — `Repository`
The **only** place that talks to Dexie directly. The store calls these; components should not call Dexie. Notable methods:
- Projects/canvases/comparisons: `getAllProjects`, `saveProject`, `deleteProject` (cascades canvases+contents), `getAllCanvases`, `saveCanvas`, `deleteCanvas`, CRUD for comparisons.
- Graph reads scoped by canvas: `getTableNodesByCanvas`, `getTableEdgesByCanvas`, `getColumnEdgesByCanvas`.
- `copyCanvasContents(oldCanvasId, newCanvasId)` — deep clone used by clone canvas/project (rewrites datasetIds to the new canvas scope).
- Node CRUD: `getTableNode`, `saveTableNode`, `deleteTableNode` (also deletes incident edges).
- Uploads: `getUploads`, `saveUpload`, `deleteUpload`.
- Workspace backup: `getWorkspaceExport`, `importWorkspace`.
- Edit log: `logEditEvent`, `getEditEvents`.

---

## 6. The store (`src/store/useStore.ts`) — the heart of the app

A single Zustand store wrapped in Zundo `temporal`. **Components read state and call actions; they never touch Dexie.** Most write actions follow the pattern: **optimistically `set(...)` in-memory, then persist via `Repository`/`db`, then `logEdit(...)`.**

### State shape (high level)
- Hierarchy: `projects`, `canvases`, `comparisons`, `activeProjectId`, `activeCanvasId`, `activeComparisonId`, `activeSystemTab` (`LEGACY|TARGET`), `view` (`'canvas'|'compare'`).
- Active-canvas graph: `nodes: Record<datasetId,TableNode>`, `tableEdges`, `columnEdges` (all keyed by id).
- Selection: `selectedNodeId`, `selectedColumn`.
- **Column focus mode**: `columnFocus: {datasetId,column}|null`, `tracedColumns: Record<datasetId,string[]>`.

### Undo/redo
`temporal(..., { partialize: (s) => ({ nodes: s.nodes }) })` — **only `nodes` is tracked for undo/redo.** Adding new top-level state does NOT pollute history (good), but if you want something undoable it must live in (or alongside) `nodes` and be added to `partialize`. Access via `useStore.temporal.getState()` → `{ undo, redo, pastStates, futureStates }` (see `Header.tsx`).

### Key actions (by area)
- **Loading**: `loadProjects`, `loadCanvas(canvasId)` (replaces `nodes/tableEdges/columnEdges`, resets selection + focus), `selectCanvas`, `loadComparisons`.
- **Projects/canvases**: `createProject` (auto-creates first canvas), `renameProject`, `updateProjectSystems`, `deleteProject`, `createCanvas`, `renameCanvas`, `deleteCanvas`, `cloneCanvas`, `cloneProject` (deep copy via `Repository.copyCanvasContents`).
- **Selection / view**: `selectNode`, `selectColumn`, `setActiveSystemTab`, `setView`, `openComparison`, `selectProject`.
- **Nodes**: `addTableNode`, `deleteTableNode`, `updateTableMetadata`, `updateTableNodePosition(s)`, `toggleNodeCollapse`.
- **Columns**: `addColumn`, `removeColumn`, `updateColumnMetadata`, `updateColumnStats`, `updateColumn`, `reorderColumns`.
- **Edges**: `addTableEdge`, `addColumnEdge`, `deleteTableEdge`, `deleteColumnEdge`.
- **Column lineage focus**: `focusColumn(datasetId, column)` and `clearColumnFocus()` — see §8.
- **Saved comparisons**: `saveComparison`, `deleteComparison`.

### `computeColumnTrace(focus, columnEdges)` (module-level helper)
Pure function. BFS over `columnEdges` in two directions from the focus column:
- **Downstream**: focus appears in an edge's `sources` → walk to `target`, transitively.
- **Upstream**: focus is an edge's `target` → walk to each `source`, transitively.
Returns `Record<datasetId, string[]>` (all columns to keep visible). Uses **separate visited sets per direction**, then unions — do not "optimize" into one shared set or you'll pull in sibling co-parents and miss paths. The key separator is a space, which is safe because `datasetId` never contains spaces (split at first space).

---

## 7. Canvas rendering (`components/canvas/`)

### `LineageGraph.tsx`
- `LineageGraph` renders system tabs (Legacy/Target) and mounts **one** `SystemCanvas` keyed by `` `${activeCanvasId}:${activeSystemTab}` `` (key forces a fresh React Flow instance per tab so fitView/positions reset cleanly).
- `SystemCanvas`:
  - Derives `systemNodes/systemTableEdges/systemColumnEdges` from the store, filtered to the active system.
  - `initialNodes`/`initialEdges` (memoized) map store data → React Flow `nodes`/`edges`. A `useEffect` syncs them into local `useNodesState`/`useEdgesState`. **This is why edge deletions must be persisted to the store** — local-only changes get overwritten on the next store-driven recompute.
  - **Critical sync gotcha:** moving a node calls `updateTableNodePosition`, which mutates `storeNodes`, which recomputes `initialEdges` and resets local edges. Any edge change that isn't in the store will reappear.
  - `onConnect` creates table or column edges (handle ids decide which; see ID conventions).
  - `onEdgesDelete` persists deletions via `deleteTableEdge`/`deleteColumnEdge` (reads the underlying store id from `edge.data.edgeId`). `deleteKeyCode={['Backspace','Delete']}`.
  - **Focus mode**: when `columnFocus` is set, `initialEdges` hides table edges and renders only column edges whose **both** endpoints are traced (`tracedColumns`), animated. `FocusCentering` (a child using `useReactFlow`) pans to the focused node on focus change.
  - `onLayout` runs ELK (`getLayoutedElements`) and persists positions via `updateTableNodePositions`.
- `nodeTypes = { tableNode }`, `edgeTypes = { tableEdge, columnEdge }`.

### `CustomTableNode.tsx`
- Renders the node card. Reads `selectNode`, `toggleNodeCollapse`, and focus state (`columnFocus`, `tracedColumns`, `focusColumn`) from the store.
- **Header click → `selectNode(id)`** (opens DetailsPanel). Only the header is the click target — the body/columns are not.
- Column list: alphabetical; preview capped at **5** with a **"+X more columns"** expander; a filter box (hidden in focus mode); search bypasses the cap.
- **Column row click → `focusColumn(id, col.name)`** (starts/re-roots lineage trace).
- Focus-mode visuals: origin node ringed blue; participating nodes show only traced columns; non-participating nodes dimmed.
- Connection handles: table handles `table-target`/`table-source`; column handles `col-${name}-target`/`col-${name}-source`. **Edges to a column require that column to be rendered** (handle must exist) — relevant when collapsing/limiting columns.

### `CustomColumnEdge.tsx` / `CustomTableEdge.tsx`
Bezier paths via `getBezierPath`. Column edges are intentionally **plain** (no label/onClick dialog — column-level transformation tracking was removed by design). Color encodes `transformationType` (`UNKNOWN` = grey dashed).

---

## 8. Column lineage focus mode (cross-cutting feature)

1. `CustomTableNode` column click → `focusColumn(datasetId, column)`.
2. Store toggles off if the same column is clicked again; otherwise computes `tracedColumns = computeColumnTrace(...)` and sets `columnFocus`.
3. `CustomTableNode` filters its visible columns to `tracedColumns[id]`; non-traced nodes dim.
4. `LineageGraph` filters rendered edges to traced column edges and `FocusCentering` pans to `columnFocus.datasetId`.
5. `clearColumnFocus()` (the banner's **Exit** button) resets.

Persists across system tabs (it's global store state), but each tab only renders its own system's nodes.

---

## 9. Editing panels

- **`DetailsPanel.tsx`** — `fixed right-0`, opens when `selectedNodeId` set. Tabs: **Metadata** (local `meta` state; **Save Metadata** → `updateTableMetadata`) and **Columns** (`ColumnManager`). Has a Danger Zone delete. Slides in (`animate-slide-in-right`).
- **`ColumnEditorPanel.tsx`** — `fixed` panel to the **left of** DetailsPanel, opens when `selectedColumn` set. Positioned at `right-[min(50vw,640px)]` to butt against the details panel; `animate-emerge-left` makes it appear to emerge from behind the details panel. Edits column metadata + stats; **Save** → `updateColumn`. A `saved` confirmation is keyed off field values so the post-save store refresh doesn't dismiss it.
- **`ColumnManager.tsx`** — add/search/reorder/remove columns within DetailsPanel's Columns tab.
- Both editor panels show a transient "Save successful" indicator cleared on the next field change.

---

## 10. Comparison engine

### `lib/compare.ts`
- `compareTables(a, b, included?) → TableDiff` — aligns columns by name; each `ColumnDiff` has `status` (`same|changed|added|removed`) and per-field `FieldDiff[]`; `summary` counts each status.
- `compareColumnPair(a, b, included?) → FieldDiff[]` — field-by-field for an arbitrary pair.
- `compareTableMetadata(a, b) → FieldDiff[]` — table-level metadata fields.
- `FIELD_DEFS` / `TABLE_FIELD_DEFS` drive which fields appear (and their order). `COMPARABLE_FIELDS` (labels) drives the field filter UI.
- **Data-type equivalence:** the `Data Type` field uses `dataTypesEquivalent` as its `eq`, so semantically equal types across SAS/Snowflake/PySpark/Pandas aren't flagged as changed.

### `lib/dataTypes.ts`
`canonicalType(raw)` maps a spelling to a `CanonicalType` via an `ALIASES` table; `dataTypesEquivalent(a,b)` compares canonical forms. **Extend `ALIASES` here** when new type spellings need to be treated as equal (note the user's stack: Snowflake, SAS, PySpark/Pandas — keep equivalences correct for these).

### `components/compare/CompareView.tsx`
Three modes (state `mode`): `systems` (Legacy vs Target in active project), `projects` (any table from any project), `columns` (manual column pairs). Lazily loads needed canvases' tables into `tablesByCanvas`. Renders three diff surfaces (table metadata table, columns table, per-pair field tables). The **`showOnlyDiffs`** checkbox filters all three to changed/non-`same` rows. **`includedFields`** (a Set) controls which fields participate. **Save view** persists a `SavedComparison`. Helper `renderQualified` prints color-coded `{project}{canvas}{table}{column}` paths.

---

## 11. Import / export

**Unified pipeline**: both JSON and Excel uploads **parse → review → ingest**. Parsers produce a source-agnostic **`ParsedImportModel`** (`lib/importModel.ts`); `Header` opens **`ImportValidationDialog`** (pick project/canvas/system, edit namespaces + table metadata, choose Excel mode); confirm calls the store's **`runImport`** → **`ingestion.ingestParsedModel`** (the single DB writer) → reload canvas.

- **`ingestParsedModel(model, target, options)`** composes `datasetId = ${canvasId}::${SYSTEM}:${NAMESPACE}.${NAME}` from the chosen system + (edited) namespace + name, so imports **merge into existing tables**. Modes (`importModel.ts`): `additive` (default — add tables/columns/connections, never overwrite/delete), `override-metadata`, `override-metadata-connections` (Excel only; the latter **replaces** the affected tables' edges). Edges use **content-derived ids** (`lib/edgeIds.ts`) via `bulkPut`, so re-imports are **idempotent** (no duplicate connections). STUBs are created for referenced-but-undefined tables. Removal is only via **Upload History → Delete** (`Repository.deleteUpload`).
- **JSON**: `uploadService.parseLineageJSON` → `ingestion.parseLineageExtract` (validates the **simplified** `LineageExtractSchema` v1.0: `tables`/`table_connections`/`column_connections`, no system/metadata). Tables are referenced by `name`.
  - **AI extraction (SAS/SQL/Snowflake)**: external agent emits the v1.0 JSON; downloadable schema + per-dialect prompts live in `public/extraction/` and the header **Downloads** menu (`EXTRACTION.md`).
- **Excel**: `excelService.parseExcelWorkbook` parses the MASTER registry/sheets into a `ParsedImportModel` (carrying per-table system + metadata as hints) — **parse only, no DB writes**. Templates in `public/templates/` are generated by the Python scripts (`scripts/build_*.py`, openpyxl). **If you change the Excel structure, update `excelService.ts` + the Python scripts.**
- **Merge (reconcile import dupes)**: store actions **`mergeColumns`** (combine columns in a table) and **`mergeTables`** (combine tables) rewire all edges onto the merged entity, recompute content ids, and de-dup/collapse duplicate connections. UI: `MergeColumnsDialog` (from `ColumnManager` multi-select), `MergeTablesDialog` (canvas multi-select → floating button in `LineageGraph`). Per-field conflict resolution is shared via `lib/columnMerge.ts` + `ColumnConflictTable.tsx`.
- **Full workspace** backup: `lib/workspaceUtils.ts` ↔ `Repository.getWorkspaceExport` / `importWorkspace`.

---

## 12. Styling & UI conventions

- **Design tokens** are CSS variables in `index.css` (`--primary` is a blue accent, `--radius`, etc.). Base font-size is set to **14px** there for a denser, tool-like scale (shrinks all rem text + spacing). Change global look there, not per-component.
- **Animations**: keyframes live in `tailwind.config.js` (`slide-in-right`, `fade-in`, `fade-in-up`, `emerge-left`). Apply via `animate-*` classes.
- **UI primitives** in `components/ui/` are Base UI wrappers (shadcn-style). Prefer composing these over raw elements. `cn()` from `lib/utils.ts` merges classes.
- **Layout overflow gotcha:** in CSS grid/flex, long unbreakable strings (datasetIds, qualified names) expand tracks and overflow. The fixes already in place: `min-w-0` on flex/grid children, `break-all`/`truncate` on long text, and `[&>*]:min-w-0` on the dialog grid. Keep this in mind when adding text.

---

## 13. Conventions & gotchas (read before editing)

- **Persist through the store, not Dexie, from components.** Store actions update memory → `Repository`/`db` → `logEdit`.
- **React Flow edges are derived from the store.** Any local-only edge/node mutation is overwritten on the next store change. Persist deletions/additions to the store.
- **Identity fields are immutable**: `datasetId`, `canvasId`, `system`, `namespace`, `name` (table); `name` (column). Never rewrite them in place — create/replace instead.
- **`partialize` for undo only tracks `nodes`.** Edges/projects/canvases are not undoable; don't assume undo covers them.
- **Cross-system column edges exist** (a LEGACY column can feed a TARGET column) but the two systems live on separate tabs; `initialEdges` filters sources to the current system to avoid React Flow/ELK thrashing on missing nodes.
- **Type equivalence belongs in `dataTypes.ts`**, not scattered in comparison logic.
- **After any change, run `npx vite build`** and check IDE diagnostics (`tsc`). Don't trust `npm run build` alone if `tsc -b` is flaky in your environment.
- The repo has a memory note: the user's stack is **Snowflake / SAS / Python (PySpark/Pandas)** — equivalent types across these should not count as diffs.

---

## 14. Common task recipes

- **Add a table metadata field**: extend `TableMetadata` (`types/models.ts`) → add an input row in `DetailsPanel.tsx` → add to `TABLE_FIELD_DEFS` in `compare.ts` so it appears in comparisons → (if importable) update `excelService.ts` + Python template scripts.
- **Add a column metadata/stat field**: extend `ColumnMetadata`/`ColumnStat` → add input in `ColumnEditorPanel.tsx` → add to `FIELD_DEFS` in `compare.ts`.
- **Add a store action**: declare it in the `AppState` interface, implement in the store body (optimistic `set` → persist via `Repository`/`db` → `logEdit` if it's an edit), consume via `useStore(s => s.yourAction)`.
- **Change the canvas node UI**: edit `CustomTableNode.tsx`; remember header = select, column = focus, and that hiding a column removes its edge handles.
- **Add a comparison field filter or surface**: edit `CompareView.tsx` and `compare.ts` together.
- **Tweak global look/spacing/animation**: `index.css` (tokens, base size) and `tailwind.config.js` (keyframes), not per-component overrides.
- **Persist new state across reloads but outside the DB** (e.g., a UI pref): use `localStorage` like `ProjectSidebar.tsx` does for width/collapsed.
