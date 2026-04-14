# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev` (Vite with HMR)
- **Build:** `npm run build` (runs `tsc -b` then `vite build`, output in `dist/`)
- **Lint:** `npm run lint` (ESLint 9 flat config with TypeScript and React rules)
- **Preview production build:** `npm run preview`

No test framework is configured.

## Architecture

Interactive flow diagram editor for documenting app screen flows and API transactions. React 19 + Vite 8 + TypeScript 6.

### Data flow

The app follows a diagram-as-code approach: a JSON object (`DiagramData`) is the source of truth.

1. `src/types/diagram.ts` — All domain types: `Screen`, `Action`, `ApiCall`, `DiagramData`, `SelectionType`
2. `src/store/useDiagramStore.ts` — Zustand store with full CRUD for screens/actions/API calls, undo/redo history stack, localStorage persistence, validation, and JSON↔diagram sync
3. `src/utils/layoutEngine.ts` — BFS-based auto-layout converting `DiagramData` → React Flow `Node[]`/`Edge[]`, with optional saved positions
4. `src/components/DiagramCanvas.tsx` — React Flow canvas wiring: node/edge click → selection, drag → position persistence, `onConnect` with `__new__` handle → action creation

### Key patterns

- **Store mutations** go through `commit()` helper which: pushes undo history, syncs `jsonText`, persists to localStorage, and runs validation — all in one pass
- **Selection** stores IDs (`screenId`, `actionId`) not data snapshots, so the DetailPanel always reads fresh state from the store
- **Custom nodes** (`ScreenNode`) expose per-action source handles + a special `__new__` handle for drag-to-connect
- **Custom edges** (`ApiEdge`) render a clickable method badge for API calls, with error-path styling (red dashed)
- Shared input styling via `.input-field` CSS class in `index.css` (Tailwind `@layer components`)

### Build setup

- TypeScript project references: `tsconfig.app.json` (src) and `tsconfig.node.json` (vite.config.ts)
- Strict TypeScript: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `erasableSyntaxOnly`
- Tailwind CSS 4 via `@tailwindcss/vite` plugin
- ESLint flat config with `typescript-eslint`, `react-hooks`, and `react-refresh` plugins
