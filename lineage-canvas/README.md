# Lineage Canvas

Lineage Canvas is a standalone, local-first web application for tracking data lineage through complex system migrations (e.g., SAS to Snowflake). It provides a visual graph interface, tracks metadata completeness, and operates entirely in your browser using IndexedDB. No backend servers required!

## Features

- **Local-First Architecture**: All data is stored locally in your browser using IndexedDB via Dexie.js.
- **Interactive Lineage Graph**: Visualize dataset and column-level lineage relationships using React Flow and ELK.js auto-layout.
- **Incremental Ingestion**: Upload JSON extracts or Excel templates to progressively build out the lineage map.
- **Rich Metadata Tracking**: Add descriptions, roles, privacy tags, and completeness scores directly from the canvas.
- **Time-Travel**: Full undo/redo support for all edits.

## Tech Stack

- React 18 + Vite
- TypeScript
- Zustand + Zundo (State & Undo/Redo)
- Dexie.js (IndexedDB wrapper)
- React Flow (Canvas visualization)
- ELK.js (Graph auto-layout)
- Zod (Schema validation)
- Shadcn UI (Tailwind CSS)

## Running Locally

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Development Server**
   ```bash
   npm run dev
   ```

3. **Build for Production**
   ```bash
   npm run build
   ```

## Usage

- Start by clicking **+ New Table** to manually add a table, or use an ingest action to ingest lineage data.
- Click **Export Template** to download an Excel sheet prepopulated with existing datasets, fill in metadata, and re-upload to enrich the workspace.
- Click on any dataset node on the canvas to view or edit its metadata and column definitions.
