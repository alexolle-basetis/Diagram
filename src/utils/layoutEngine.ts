import type { Node, Edge } from "@xyflow/react";
import type { DiagramData, ScreenStatus, ScreenColor, ScreenIcon, NodeKind, CardViewMode } from "../types/diagram";
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

export function buildFlowElements(
  diagram: DiagramData,
  savedPositions?: Record<string, { x: number; y: number }>
): { nodes: Node[]; edges: Edge[] } {
  const apiByAction = new Map(
    diagram.apiCalls.map((api) => [api.actionId, api])
  );

  // BFS layered layout
  const incoming = new Map<string, number>();
  diagram.screens.forEach((s) => incoming.set(s.id, 0));
  diagram.screens.forEach((s) =>
    s.actions.forEach((a) => {
      incoming.set(a.targetScreen, (incoming.get(a.targetScreen) ?? 0) + 1);
      if (a.errorTargetScreen) {
        incoming.set(a.errorTargetScreen, (incoming.get(a.errorTargetScreen) ?? 0) + 1);
      }
    })
  );

  const roots = diagram.screens
    .filter((s) => (incoming.get(s.id) ?? 0) === 0)
    .map((s) => s.id);
  if (roots.length === 0 && diagram.screens.length > 0) {
    roots.push(diagram.screens[0].id);
  }

  const layer = new Map<string, number>();
  const queue = roots.map((id) => {
    layer.set(id, 0);
    return id;
  });

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const screen = diagram.screens.find((s) => s.id === current);
    if (!screen) continue;
    for (const action of screen.actions) {
      for (const target of [action.targetScreen, action.errorTargetScreen]) {
        if (target && !layer.has(target)) {
          layer.set(target, (layer.get(current) ?? 0) + 1);
          queue.push(target);
        }
      }
    }
  }

  diagram.screens.forEach((s) => {
    if (!layer.has(s.id)) layer.set(s.id, 0);
  });

  const columns = new Map<number, string[]>();
  layer.forEach((col, id) => {
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col)!.push(id);
  });

  const screenById = new Map(diagram.screens.map((s) => [s.id, s]));
  const nodes: Node[] = [];

  columns.forEach((ids, col) => {
    ids.forEach((id, row) => {
      const screen = screenById.get(id);
      if (!screen) return;

      const saved = savedPositions?.[id];
      const nodeHeight = NODE_HEIGHT_BASE + screen.actions.length * ACTION_HEIGHT;
      const x = saved?.x ?? col * (NODE_WIDTH + H_GAP) + 40;
      const y = saved?.y ?? row * (nodeHeight + V_GAP) + 40;

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
            hasApi: apiByAction.has(a.id),
            hasNote: !!a.note,
            hasConditions: (a.conditions?.length ?? 0) > 0,
            hasEffects: (a.effects?.length ?? 0) > 0,
          })),
        } satisfies ScreenNodeData,
      });
    });
  });

  const edges: Edge[] = [];
  diagram.screens.forEach((screen) => {
    screen.actions.forEach((action) => {
      const api = apiByAction.get(action.id);
      // Main edge (success path)
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
        } satisfies ApiEdgeData,
      });

      // Error path edge
      if (action.errorTargetScreen) {
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
          } satisfies ApiEdgeData,
        });
      }
    });
  });

  return { nodes, edges };
}
