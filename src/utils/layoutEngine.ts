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
const H_GAP = 120;
const V_GAP = 60;
/** Vertical gap between unrelated subgraphs ("connected components"). */
const COMPONENT_GAP = 140;
/** Iterations of the barycenter pass for crossing reduction. Each pair = down+up sweep. */
const BARYCENTER_PASSES = 6;

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
 * Compute the layout for a diagram using a Sugiyama-style approach:
 *   1. Split the diagram into weakly-connected components.
 *   2. For each component, assign each node to a layer using
 *      LONGEST-PATH layering (cycle-safe).
 *   3. Order nodes within each layer with the BARYCENTER heuristic to
 *      reduce edge crossings (alternating top-down / bottom-up sweeps).
 *   4. Compute coordinates using actual per-node heights so cards never
 *      overlap, even when they have very different action counts.
 *   5. Stack components vertically with a gap.
 *
 * Saved positions (from manual drags) always win over the computed
 * layout, so the user keeps their custom arrangements.
 */
function computeAutoLayout(diagram: DiagramData): Map<string, { x: number; y: number }> {
  const screens = diagram.screens;
  if (screens.length === 0) return new Map();

  const screenById = new Map(screens.map((s) => [s.id, s]));
  const nodeHeight = (id: string) => {
    const s = screenById.get(id);
    return NODE_HEIGHT_BASE + (s?.actions.length ?? 0) * ACTION_HEIGHT;
  };

  // Build forward + reverse adjacency lists. We use ONLY the success
  // path for layering — error paths skew distance-from-root values for
  // little visual benefit, but they're considered later for crossing
  // reduction so error edges still try to land on close nodes.
  const successors = new Map<string, Set<string>>();
  const predecessors = new Map<string, Set<string>>();
  for (const s of screens) {
    successors.set(s.id, new Set());
    predecessors.set(s.id, new Set());
  }
  for (const s of screens) {
    for (const a of s.actions) {
      const t = a.targetScreen;
      if (t && t !== s.id && screenById.has(t)) {
        successors.get(s.id)!.add(t);
        predecessors.get(t)!.add(s.id);
      }
    }
  }

  // Step 1 — Weakly-connected components (treat edges as undirected).
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
      successors.get(id)?.forEach((n) => { if (!seen.has(n)) stack.push(n); });
      predecessors.get(id)?.forEach((n) => { if (!seen.has(n)) stack.push(n); });
    }
    components.push(nodes);
  }

  const placements = new Map<string, { x: number; y: number }>();
  let yOffset = 40;

  for (const componentNodes of components) {
    const inComponent = new Set(componentNodes);

    // Step 2 — Longest-path layering. Cycle-safe: a back-edge during
    // DFS contributes 0 instead of recursing, breaking the loop.
    const layer = new Map<string, number>();
    const visiting = new Set<string>();

    const computeLayer = (id: string): number => {
      const cached = layer.get(id);
      if (cached !== undefined) return cached;
      if (visiting.has(id)) return 0; // back-edge in cycle
      visiting.add(id);
      let max = -1;
      for (const pred of predecessors.get(id) ?? []) {
        if (!inComponent.has(pred)) continue;
        max = Math.max(max, computeLayer(pred));
      }
      visiting.delete(id);
      const lyr = max + 1;
      layer.set(id, lyr);
      return lyr;
    };

    // Process roots first for stable layer numbers.
    for (const id of componentNodes) {
      const preds = predecessors.get(id);
      if (!preds || [...preds].every((p) => !inComponent.has(p))) {
        computeLayer(id);
      }
    }
    // Anything left (cycles with no clear root) gets a layer too.
    for (const id of componentNodes) {
      if (!layer.has(id)) computeLayer(id);
    }

    // Group by layer (column).
    const byLayer: string[][] = [];
    for (const id of componentNodes) {
      const lyr = layer.get(id)!;
      while (byLayer.length <= lyr) byLayer.push([]);
      byLayer[lyr].push(id);
    }

    // Initial intra-layer ordering: by id for determinism. Barycenter
    // will refine this immediately.
    for (const l of byLayer) l.sort();

    // Step 3 — Barycenter crossing reduction. Alternating sweeps
    // re-order each layer by the average position of its connected
    // neighbours in the adjacent layer.
    const positionInLayer = (l: string[]): Map<string, number> =>
      new Map(l.map((id, i) => [id, i]));

    const sortByBarycenter = (
      target: string[],
      neighbour: string[],
      neighbourEdges: Map<string, Set<string>>,
    ) => {
      const idx = positionInLayer(neighbour);
      const bary = new Map<string, number>();
      target.forEach((id, i) => {
        const ns = [...(neighbourEdges.get(id) ?? [])].filter((n) => idx.has(n));
        bary.set(id, ns.length === 0 ? i : ns.reduce((s, n) => s + idx.get(n)!, 0) / ns.length);
      });
      target.sort((a, b) => bary.get(a)! - bary.get(b)!);
    };

    for (let pass = 0; pass < BARYCENTER_PASSES; pass++) {
      if (pass % 2 === 0) {
        for (let l = 1; l < byLayer.length; l++) {
          sortByBarycenter(byLayer[l], byLayer[l - 1], predecessors);
        }
      } else {
        for (let l = byLayer.length - 2; l >= 0; l--) {
          sortByBarycenter(byLayer[l], byLayer[l + 1], successors);
        }
      }
    }

    // Step 4 — Assign coordinates. Each layer stacks vertically using
    // actual node heights; columns are then centered around the tallest
    // layer for a balanced look.
    const layerHeight: number[] = [];
    const localY = new Map<string, number>();
    for (let l = 0; l < byLayer.length; l++) {
      let y = 0;
      for (const id of byLayer[l]) {
        localY.set(id, y);
        y += nodeHeight(id) + V_GAP;
      }
      layerHeight[l] = y - V_GAP; // total height of column l
    }
    const tallest = Math.max(0, ...layerHeight);

    for (let l = 0; l < byLayer.length; l++) {
      const offset = (tallest - layerHeight[l]) / 2;
      for (const id of byLayer[l]) {
        placements.set(id, {
          x: 40 + l * (NODE_WIDTH + H_GAP),
          y: yOffset + (localY.get(id) ?? 0) + offset,
        });
      }
    }

    // Step 5 — Reserve room for this component, then move down.
    yOffset += tallest + COMPONENT_GAP;
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
