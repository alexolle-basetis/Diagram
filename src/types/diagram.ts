export type ScreenStatus = "pending" | "in-progress" | "done" | "blocked";

export interface Action {
  id: string;
  label: string;
  targetScreen: string;
  errorTargetScreen?: string;
  note?: string;
}

export type ScreenColor = "slate" | "violet" | "blue" | "cyan" | "emerald" | "amber" | "rose" | "orange";

export type ScreenIcon =
  | "monitor" | "smartphone" | "layout" | "home" | "user" | "settings"
  | "shield" | "key" | "credit-card" | "shopping-cart" | "file-text"
  | "mail" | "bell" | "search" | "map" | "camera" | "database"
  | "cloud" | "terminal" | "globe" | "heart" | "zap" | "lock"
  | "log-in" | "list" | "bar-chart";

export interface Screen {
  id: string;
  title: string;
  description: string;
  docs?: string;
  imageUrl?: string;
  status?: ScreenStatus;
  tags?: string[];
  color?: ScreenColor;
  icon?: ScreenIcon;
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
