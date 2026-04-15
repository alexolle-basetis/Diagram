import type { Node, Edge } from "@xyflow/react";
import type { DiagramData, ScreenStatus, ScreenColor, ScreenIcon, NodeKind, CardViewMode } from "../types/diagram";
import { formatCondition, formatEffect } from "./variables";
import {
  Monitor, Smartphone, Layout, Home, User, Settings, Shield, Key,
  CreditCard, ShoppingCart, FileText, Mail, Bell, Search, Map as MapIcon, Camera,
  Database, Cloud, Terminal, Globe, Heart, Zap, Lock, LogIn, List, BarChart,
  Server, Layers, Box,
  type LucideIcon,
} from "lucide-react";

export const SCREEN_ICONS: Record<ScreenIcon, { icon: LucideIcon; label: string }> = {
  "monitor": { icon: Monitor, label: "Monitor" },
  "smartphone": { icon: Smartphone, label: "Móvil" },
  "layout": { icon: Layout, label: "Layout" },
  "home": { icon: Home, label: "Inicio" },
  "user": { icon: User, label: "Usuario" },
  "settings": { icon: Settings, label: "Ajustes" },
  "shield": { icon: Shield, label: "Seguridad" },
  "key": { icon: Key, label: "Clave" },
  "credit-card": { icon: CreditCard, label: "Pago" },
  "shopping-cart": { icon: ShoppingCart, label: "Carrito" },
  "file-text": { icon: FileText, label: "Documento" },
  "mail": { icon: Mail, label: "Email" },
  "bell": { icon: Bell, label: "Notificación" },
  "search": { icon: Search, label: "Búsqueda" },
  "map": { icon: MapIcon, label: "Mapa" },
  "camera": { icon: Camera, label: "Cámara" },
  "database": { icon: Database, label: "Base datos" },
  "cloud": { icon: Cloud, label: "Cloud" },
  "terminal": { icon: Terminal, label: "Terminal" },
  "globe": { icon: Globe, label: "Web" },
  "heart": { icon: Heart, label: "Favorito" },
  "zap": { icon: Zap, label: "Acción" },
  "lock": { icon: Lock, label: "Bloqueo" },
  "log-in": { icon: LogIn, label: "Login" },
  "list": { icon: List, label: "Lista" },
  "bar-chart": { icon: BarChart, label: "Gráfico" },
  "server": { icon: Server, label: "Servidor" },
  "layers": { icon: Layers, label: "Capas" },
  "box": { icon: Box, label: "Caja" },
};

/** Defaults sugeridos (icon + color) cuando el usuario crea un nodo del tipo dado. */
export const KIND_DEFAULTS: Record<NodeKind, { icon: ScreenIcon; color: ScreenColor; label: string }> = {
  "screen":       { icon: "monitor",  color: "slate",   label: "Pantalla" },
  "database":     { icon: "database", color: "emerald", label: "Base de datos" },
  "external-api": { icon: "cloud",    color: "amber",   label: "API externa" },
  "service":      { icon: "server",   color: "blue",    label: "Servicio" },
  "queue":        { icon: "layers",   color: "violet",  label: "Cola / Topic" },
  "user":         { icon: "user",     color: "rose",    label: "Usuario" },
};

const NODE_WIDTH = 280;
const NODE_HEIGHT_BASE = 120;
const ACTION_HEIGHT = 36;
/** Horizontal gap between columns. Needs to accommodate edge-label pills. */
const H_GAP = 180;
const V_GAP = 70;
/** Vertical gap between unrelated subgraphs ("connected components"). */
const COMPONENT_GAP = 160;
/** Max sweeps of the median heuristic (each alternating top-down / bottom-up). */
const CROSSING_SWEEPS = 24;
/** Iterations of the Y-alignment pass that tries to straighten parent-child paths. */
const Y_ALIGN_PASSES = 3;
/** Dummy-node ID prefix. Dummies exist only to influence within-layer ordering — not rendered. */
const DUMMY_PREFIX = "__dlay_";

export interface ScreenNodeData {
  screenId: string;
  kind: NodeKind;
  title: string;
  description: string;
  status: ScreenStatus;
  color: ScreenColor;
  icon: ScreenIcon;
  tags: string[];
  viewMode: CardViewMode;
  imageUrl?: string;
  actions: {
    id: string;
    label: string;
    note?: string;
    hasApi: boolean;
    hasNote: boolean;
    hasConditions: boolean;
    hasEffects: boolean;
  }[];
  [key: string]: unknown;
}

export interface ApiEdgeData {
  actionId: string;
  hasApi: boolean;
  method?: string;
  endpoint?: string;
  note?: string;
  isErrorPath?: boolean;
  hasConditions: boolean;
  hasEffects: boolean;
  conditionSummary?: string;
  effectSummary?: string;
  [key: string]: unknown;
}

export const SCREEN_COLORS: Record<ScreenColor, { header: string; border: string; accent: string }> = {
  slate:   { header: "bg-slate-800/50",   border: "border-slate-700",   accent: "text-slate-400" },
  violet:  { header: "bg-violet-900/40",  border: "border-violet-700",  accent: "text-violet-400" },
  blue:    { header: "bg-blue-900/40",    border: "border-blue-700",    accent: "text-blue-400" },
  cyan:    { header: "bg-cyan-900/40",    border: "border-cyan-700",    accent: "text-cyan-400" },
  emerald: { header: "bg-emerald-900/40", border: "border-emerald-700", accent: "text-emerald-400" },
  amber:   { header: "bg-amber-900/40",   border: "border-amber-700",   accent: "text-amber-400" },
  rose:    { header: "bg-rose-900/40",    border: "border-rose-700",    accent: "text-rose-400" },
  orange:  { header: "bg-orange-900/40",  border: "border-orange-700",  accent: "text-orange-400" },
};

export const STATUS_COLORS: Record<ScreenStatus, { border: string; bg: string; badge: string; text: string }> = {
  pending: { border: "border-slate-600", bg: "bg-slate-500/10", badge: "bg-slate-500/20 text-slate-400", text: "Pendiente" },
  "in-progress": { border: "border-amber-500", bg: "bg-amber-500/10", badge: "bg-amber-500/20 text-amber-400", text: "En progreso" },
  done: { border: "border-emerald-500", bg: "bg-emerald-500/10", badge: "bg-emerald-500/20 text-emerald-400", text: "Hecho" },
  blocked: { border: "border-red-500", bg: "bg-red-500/10", badge: "bg-red-500/20 text-red-400", text: "Bloqueado" },
};

/**
 * Compute the layout for a diagram using a proper Sugiyama pipeline:
 *
 *   1. Split the diagram into weakly-connected components.
 *   2. Longest-path layering (cycle-safe, uses success-path edges only).
 *   3. Insert DUMMY nodes on edges that span more than one layer so the
 *      crossing-reduction phase can reason about them as adjacent-layer
 *      edges. Dummies are invisible — they never render, they only
 *      influence ordering.
 *   4. Deterministic initial order per layer via DFS from roots.
 *   5. Crossing reduction with the MEDIAN heuristic (alternating
 *      top-down / bottom-up sweeps). Median consistently beats barycenter
 *      for most shapes and avoids the "chasing" oscillation.
 *   6. Y-coordinate stacking using actual per-node heights; each layer
 *      is centred around the tallest column so columns don't drift.
 *   7. Y-alignment passes: each node moves toward the median Y of its
 *      (real) predecessors, then the layer is re-stacked respecting V_GAP.
 *      The result is that chains parent→child→grand-child end up
 *      vertically aligned when possible, with crossing edges pushed to
 *      the extremes.
 *   8. Components stack vertically with COMPONENT_GAP.
 *
 * Saved positions (from manual drags) always win over the computed layout.
 */
function computeAutoLayout(diagram: DiagramData): Map<string, { x: number; y: number }> {
  const screens = diagram.screens;
  if (screens.length === 0) return new Map();

  const screenById = new Map(screens.map((s) => [s.id, s]));
  const nodeHeight = (id: string) => {
    const s = screenById.get(id);
    return NODE_HEIGHT_BASE + (s?.actions.length ?? 0) * ACTION_HEIGHT;
  };
  const isDummy = (id: string) => id.startsWith(DUMMY_PREFIX);

  // ── Success-path adjacency (drives layering + alignment). ────────
  const succ = new Map<string, string[]>();
  const pred = new Map<string, string[]>();
  for (const s of screens) { succ.set(s.id, []); pred.set(s.id, []); }
  for (const s of screens) {
    for (const a of s.actions) {
      const t = a.targetScreen;
      if (t && t !== s.id && screenById.has(t)) {
        succ.get(s.id)!.push(t);
        pred.get(t)!.push(s.id);
      }
    }
  }

  // ── 1. Weakly-connected components (undirected). ─────────────────
  const components: string[][] = [];
  const seen = new Set<string>();
  for (const s of screens) {
    if (seen.has(s.id)) continue;
    const stack = [s.id];
    const nodes: string[] = [];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      nodes.push(id);
      for (const n of succ.get(id) ?? []) if (!seen.has(n)) stack.push(n);
      for (const n of pred.get(id) ?? []) if (!seen.has(n)) stack.push(n);
    }
    components.push(nodes);
  }

  const placements = new Map<string, { x: number; y: number }>();
  let yOffset = 40;

  for (const compNodes of components) {
    const inComp = new Set(compNodes);

    // ── 2. Longest-path layering (cycle-safe DFS). ─────────────────
    const layer = new Map<string, number>();
    const visiting = new Set<string>();
    const computeLayer = (id: string): number => {
      const cached = layer.get(id);
      if (cached !== undefined) return cached;
      if (visiting.has(id)) return 0; // back-edge
      visiting.add(id);
      let max = -1;
      for (const p of pred.get(id) ?? []) {
        if (!inComp.has(p)) continue;
        max = Math.max(max, computeLayer(p));
      }
      visiting.delete(id);
      const l = max + 1;
      layer.set(id, l);
      return l;
    };
    for (const id of compNodes) {
      const preds = pred.get(id);
      if (!preds || preds.filter((p) => inComp.has(p)).length === 0) computeLayer(id);
    }
    for (const id of compNodes) if (!layer.has(id)) computeLayer(id);

    const byLayer: string[][] = [];
    for (const id of compNodes) {
      const l = layer.get(id)!;
      while (byLayer.length <= l) byLayer.push([]);
      byLayer[l].push(id);
    }

    // ── 3. Dummy nodes for cross-layer edges. ──────────────────────
    // Every pair (u→v) with layer(v) - layer(u) > 1 gets dummies on
    // intermediate layers, linked as a chain u→d_1→d_2→…→v. This
    // dramatically helps the crossing-reduction phase because every
    // "effective" edge now spans exactly one layer.
    const adj = new Map<string, string[]>();     // includes dummies
    const adjRev = new Map<string, string[]>();
    for (const n of compNodes) { adj.set(n, []); adjRev.set(n, []); }
    let dummyCount = 0;
    for (const u of compNodes) {
      for (const v of succ.get(u) ?? []) {
        if (!inComp.has(v)) continue;
        const lu = layer.get(u)!;
        const lv = layer.get(v)!;
        if (lu >= lv) continue; // back-edge on cycle → skip
        if (lv - lu === 1) {
          adj.get(u)!.push(v);
          adjRev.get(v)!.push(u);
        } else {
          let prev = u;
          for (let l = lu + 1; l < lv; l++) {
            const did = `${DUMMY_PREFIX}${dummyCount++}`;
            adj.set(did, []);
            adjRev.set(did, []);
            byLayer[l].push(did);
            adj.get(prev)!.push(did);
            adjRev.get(did)!.push(prev);
            prev = did;
          }
          adj.get(prev)!.push(v);
          adjRev.get(v)!.push(prev);
        }
      }
    }

    // ── 4. Initial ordering: DFS from roots (deterministic). ───────
    // Nodes reached earlier in DFS go first within their layer. This
    // already gets us close to a good ordering before the median sweeps.
    const dfsRank = new Map<string, number>();
    let rank = 0;
    const dfs = (id: string) => {
      if (dfsRank.has(id)) return;
      dfsRank.set(id, rank++);
      for (const n of adj.get(id) ?? []) dfs(n);
    };
    for (const id of compNodes) {
      const preds = (pred.get(id) ?? []).filter((p) => inComp.has(p));
      if (preds.length === 0) dfs(id);
    }
    // Any node not visited (isolated cycle roots) still gets a rank
    for (const l of byLayer) for (const id of l) if (!dfsRank.has(id)) dfs(id);
    for (const l of byLayer) {
      l.sort((a, b) => (dfsRank.get(a) ?? 0) - (dfsRank.get(b) ?? 0));
    }

    // ── 5. Crossing reduction (median heuristic). ─────────────────
    const medianSort = (target: string[], neighbour: string[], edges: Map<string, string[]>) => {
      const pos = new Map(neighbour.map((id, i) => [id, i]));
      const med = new Map<string, number>();
      for (const id of target) {
        const ns = (edges.get(id) ?? [])
          .map((n) => pos.get(n))
          .filter((v): v is number => v !== undefined)
          .sort((a, b) => a - b);
        if (ns.length === 0) { med.set(id, -1); continue; }
        const m = (ns.length - 1) / 2;
        med.set(id, Number.isInteger(m) ? ns[m] : (ns[Math.floor(m)] + ns[Math.ceil(m)]) / 2);
      }
      target.sort((a, b) => {
        const ma = med.get(a)!;
        const mb = med.get(b)!;
        if (ma < 0 && mb < 0) return 0;
        if (ma < 0) return -1; // "no preference" anchors to top
        if (mb < 0) return 1;
        return ma - mb;
      });
    };
    for (let pass = 0; pass < CROSSING_SWEEPS; pass++) {
      if (pass % 2 === 0) {
        for (let l = 1; l < byLayer.length; l++) medianSort(byLayer[l], byLayer[l - 1], adjRev);
      } else {
        for (let l = byLayer.length - 2; l >= 0; l--) medianSort(byLayer[l], byLayer[l + 1], adj);
      }
    }

    // ── 6. Initial Y-stacking (real nodes only — dummies take no space). ──
    const yByNode = new Map<string, number>();
    const layerH: number[] = [];
    for (let l = 0; l < byLayer.length; l++) {
      let y = 0;
      for (const id of byLayer[l]) {
        if (isDummy(id)) continue;
        yByNode.set(id, y);
        y += nodeHeight(id) + V_GAP;
      }
      layerH[l] = Math.max(0, y - V_GAP);
    }
    const tallest = Math.max(0, ...layerH);
    for (let l = 0; l < byLayer.length; l++) {
      const offset = (tallest - layerH[l]) / 2;
      for (const id of byLayer[l]) {
        if (isDummy(id)) continue;
        yByNode.set(id, (yByNode.get(id) ?? 0) + offset);
      }
    }

    // ── 7. Y-alignment: each node moves toward the median of its ──
    //       direct predecessors (using ORIGINAL success edges, not
    //       the dummy chain). Overlaps are resolved by re-stacking
    //       sequentially per layer. A few iterations converge quickly.
    const centerOf = (id: string) => (yByNode.get(id) ?? 0) + nodeHeight(id) / 2;
    for (let iter = 0; iter < Y_ALIGN_PASSES; iter++) {
      for (let l = 1; l < byLayer.length; l++) {
        const realInLayer = byLayer[l].filter((id) => !isDummy(id));
        const wantY = new Map<string, number>();
        for (const id of realInLayer) {
          const preds = (pred.get(id) ?? []).filter((p) => inComp.has(p));
          if (preds.length === 0) { wantY.set(id, yByNode.get(id) ?? 0); continue; }
          const centres = preds.map((p) => centerOf(p)).sort((a, b) => a - b);
          const mid = centres[Math.floor((centres.length - 1) / 2)];
          wantY.set(id, mid - nodeHeight(id) / 2);
        }
        // Order by preferred Y, then sweep and enforce spacing.
        realInLayer.sort((a, b) => (wantY.get(a) ?? 0) - (wantY.get(b) ?? 0));
        let cursor = -Infinity;
        for (const id of realInLayer) {
          const want = wantY.get(id) ?? 0;
          const y = Math.max(cursor, want);
          yByNode.set(id, y);
          cursor = y + nodeHeight(id) + V_GAP;
        }
      }
    }

    // Normalise component to y >= 0
    let minY = Infinity;
    for (const id of compNodes) minY = Math.min(minY, yByNode.get(id) ?? 0);
    if (!isFinite(minY)) minY = 0;

    let compMaxY = 0;
    for (const id of compNodes) {
      const rawY = (yByNode.get(id) ?? 0) - minY;
      placements.set(id, {
        x: 40 + layer.get(id)! * (NODE_WIDTH + H_GAP),
        y: yOffset + rawY,
      });
      compMaxY = Math.max(compMaxY, rawY + nodeHeight(id));
    }

    // ── 8. Stack next component below. ─────────────────────────────
    yOffset += compMaxY + COMPONENT_GAP;
  }

  return placements;
}

export function buildFlowElements(
  diagram: DiagramData,
  savedPositions?: Record<string, { x: number; y: number }>
): { nodes: Node[]; edges: Edge[] } {
  const apiByAction = new Map(
    diagram.apiCalls.map((api) => [api.actionId, api])
  );

  const screenById = new Map(diagram.screens.map((s) => [s.id, s]));
  const auto = computeAutoLayout(diagram);
  const nodes: Node[] = [];

  for (const screen of diagram.screens) {
    const saved = savedPositions?.[screen.id];
    const computed = auto.get(screen.id) ?? { x: 40, y: 40 };
    const x = saved?.x ?? computed.x;
    const y = saved?.y ?? computed.y;

    const kind = (screen.kind ?? "screen") as NodeKind;
    const defaults = KIND_DEFAULTS[kind];

    nodes.push({
      id: screen.id,
      type: "screenNode",
      position: { x, y },
      data: {
        screenId: screen.id,
        kind,
        title: screen.title,
        description: screen.description,
        status: screen.status ?? "pending",
        color: screen.color ?? defaults.color,
        icon: screen.icon ?? defaults.icon,
        tags: screen.tags ?? [],
        viewMode: screen.viewMode ?? "actions",
        imageUrl: screen.imageUrl,
        actions: screen.actions.map((a) => ({
          id: a.id,
          label: a.label,
          note: a.note,
          hasApi: apiByAction.has(a.id),
          hasNote: !!a.note,
          hasConditions: (a.conditions?.length ?? 0) > 0,
          hasEffects: (a.effects?.length ?? 0) > 0,
        })),
      } satisfies ScreenNodeData,
    });
  }

  const edges: Edge[] = [];
  for (const screen of diagram.screens) {
    for (const action of screen.actions) {
      const api = apiByAction.get(action.id);
      const hasConditions = (action.conditions?.length ?? 0) > 0;
      const hasEffects = (action.effects?.length ?? 0) > 0;
      const conditionSummary = hasConditions
        ? action.conditions!.map(formatCondition).join(" · ")
        : undefined;
      const effectSummary = hasEffects
        ? action.effects!.map(formatEffect).join(" · ")
        : undefined;

      // Skip dangling edges to non-existent screens (avoids React Flow warnings)
      if (!screenById.has(action.targetScreen)) continue;

      edges.push({
        id: `edge-${action.id}`,
        source: screen.id,
        sourceHandle: action.id,
        target: action.targetScreen,
        type: "apiEdge",
        data: {
          actionId: action.id,
          hasApi: !!api,
          method: api?.method,
          endpoint: api?.endpoint,
          note: action.note,
          isErrorPath: false,
          hasConditions,
          hasEffects,
          conditionSummary,
          effectSummary,
        } satisfies ApiEdgeData,
      });

      if (action.errorTargetScreen && screenById.has(action.errorTargetScreen)) {
        edges.push({
          id: `edge-err-${action.id}`,
          source: screen.id,
          sourceHandle: action.id,
          target: action.errorTargetScreen,
          type: "apiEdge",
          data: {
            actionId: action.id,
            hasApi: !!api,
            method: api?.method,
            endpoint: api?.endpoint,
            note: action.note,
            isErrorPath: true,
            hasConditions,
            hasEffects,
            conditionSummary,
            effectSummary,
          } satisfies ApiEdgeData,
        });
      }
    }
  }

  return { nodes, edges };
}
