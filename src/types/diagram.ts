export type ScreenStatus = "pending" | "in-progress" | "done" | "blocked";

/**
 * Tipo de una variable de estado declarada en una pantalla.
 *  - "enum"    → conjunto cerrado de strings (definidos en VarDef.values)
 *  - "boolean" → true/false
 *  - "number"  → número arbitrario
 *  - "text"    → string libre
 */
export type VarType = "enum" | "boolean" | "number" | "text";

/** Valor primitivo que puede tomar una variable. */
export type VarValue = string | number | boolean;

/**
 * Definición de una variable de estado. Las variables se declaran en una pantalla
 * (su "dueña lógica") pero viven en un namespace global del diagrama, así que el
 * `name` debe ser único en todo el diagrama (validación delegada al usuario).
 */
export interface VarDef {
  name: string;
  type: VarType;
  /** Valores permitidos. Sólo aplica si type === "enum". */
  values?: string[];
  defaultValue: VarValue;
  description?: string;
}

/**
 * Operadores de comparación para condiciones.
 * `truthy`/`falsy` se usan principalmente para boolean (sin necesidad de "value").
 */
export type CondOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "truthy" | "falsy";

/**
 * Condición que debe cumplirse para que una acción esté disponible durante el
 * playback. Múltiples condiciones se combinan con AND.
 */
export interface Condition {
  variable: string;     // nombre de la variable
  op: CondOp;
  value?: VarValue;     // no requerido para truthy/falsy
}

/**
 * Efecto (side-effect) que aplica una acción al ejecutarse durante el playback.
 * Asigna `value` a `variable`. Para boolean, también soporta "toggle".
 */
export interface Effect {
  variable: string;
  op?: "set" | "toggle";   // default: "set"
  value?: VarValue;
}

export interface Action {
  id: string;
  label: string;
  targetScreen: string;
  errorTargetScreen?: string;
  note?: string;
  /** Condiciones (AND) para que esta acción esté disponible durante el playback. */
  conditions?: Condition[];
  /** Side-effects que aplica al ejecutarse durante el playback. */
  effects?: Effect[];
}

export type ScreenColor = "slate" | "violet" | "blue" | "cyan" | "emerald" | "amber" | "rose" | "orange";

export type ScreenIcon =
  | "monitor" | "smartphone" | "layout" | "home" | "user" | "settings"
  | "shield" | "key" | "credit-card" | "shopping-cart" | "file-text"
  | "mail" | "bell" | "search" | "map" | "camera" | "database"
  | "cloud" | "terminal" | "globe" | "heart" | "zap" | "lock"
  | "log-in" | "list" | "bar-chart" | "server" | "layers" | "box";

/**
 * Tipo visual del nodo. Determina la forma y el comportamiento por defecto:
 *  - "screen"       → rectángulo redondeado (default)
 *  - "database"     → cilindro (DB)
 *  - "external-api" → hexágono (API externa, puede llevar spec OpenAPI propio)
 *  - "service"      → rectángulo con chevron (backend/microservicio)
 *  - "queue"        → rectángulo con banda apilada (cola/topic)
 *  - "user"         → círculo/avatar (usuario externo)
 */
export type NodeKind = "screen" | "database" | "external-api" | "service" | "queue" | "user";

/**
 * Modo de visualización de una card.
 *  - "actions"    → lista completa de acciones (default)
 *  - "screenshot" → captura a todo lo ancho; acciones colapsadas en pills
 */
export type CardViewMode = "actions" | "screenshot";

/**
 * Referencia a una spec OpenAPI 3 (cargada desde URL o archivo).
 * La spec se guarda parseada para no depender del fetch después.
 */
export interface OpenApiRef {
  source: "url" | "file";
  url?: string;         // sólo si source === "url"
  fileName?: string;    // sólo si source === "file"
  title?: string;       // info.title
  version?: string;     // info.version
  spec: unknown;        // documento parseado
  loadedAt: string;     // ISO date
}

export interface Screen {
  id: string;
  kind?: NodeKind;
  title: string;
  description: string;
  docs?: string;
  imageUrl?: string;
  status?: ScreenStatus;
  tags?: string[];
  color?: ScreenColor;
  icon?: ScreenIcon;
  viewMode?: CardViewMode;
  /** Spec OpenAPI específico para este nodo (sólo tiene sentido si kind === "external-api"). */
  openApi?: OpenApiRef;
  /** Variables de estado declaradas en esta pantalla (namespace global del diagrama). */
  variables?: VarDef[];
  actions: Action[];
}

export interface ApiCall {
  actionId: string;
  method: string;
  endpoint: string;
  requestBody?: string;
  responsePayload?: string;
  statusCode?: number;
  errorPayload?: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
}

export interface DiagramData {
  screens: Screen[];
  apiCalls: ApiCall[];
  /** Spec OpenAPI global del diagrama (se usa como fallback si el nodo no tiene spec propio). */
  openApi?: OpenApiRef;
}

export type SelectionType =
  | { kind: "none" }
  | { kind: "screen"; screenId: string }
  | { kind: "edge"; actionId: string; sourceScreenId: string; targetScreenId: string };

export interface ValidationError {
  type: "error" | "warning";
  message: string;
  path?: string;
}
