import type { DiagramData, VarDef, VarValue, Condition, Effect, Action } from "../types/diagram";

/** Mapa nombre → valor actual de variables durante el playback. */
export type VarMap = Record<string, VarValue>;

/**
 * Aggregates all variable definitions declared across all screens in the diagram.
 * If the same name is declared in multiple screens, the first one wins (and a
 * warning is logged). The user is responsible for keeping names unique.
 */
export function collectVariables(diagram: DiagramData): VarDef[] {
  const seen = new Map<string, VarDef>();
  for (const screen of diagram.screens) {
    for (const v of screen.variables ?? []) {
      if (!v.name) continue;
      if (!seen.has(v.name)) {
        seen.set(v.name, v);
      } else if (import.meta.env.DEV) {
        console.warn(`[variables] Duplicate variable "${v.name}" — using the first declaration`);
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Like collectVariables but returns a map by name (handy for lookups). */
export function collectVariablesMap(diagram: DiagramData): Map<string, VarDef> {
  return new Map(collectVariables(diagram).map((v) => [v.name, v]));
}

/** Initial values from defaults for all collected variables. */
export function initialVariableValues(diagram: DiagramData): VarMap {
  const out: VarMap = {};
  for (const v of collectVariables(diagram)) {
    out[v.name] = v.defaultValue;
  }
  return out;
}

/** Coerce a string input to the variable's type. */
export function coerceValue(def: VarDef, raw: string | boolean | number): VarValue {
  if (def.type === "boolean") {
    if (typeof raw === "boolean") return raw;
    return raw === "true" || raw === 1 || raw === "1";
  }
  if (def.type === "number") {
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return String(raw);
}

/** Evaluate one condition against the current variable map. */
export function evaluateCondition(cond: Condition, vars: VarMap): boolean {
  const actual = vars[cond.variable];
  switch (cond.op) {
    case "truthy": return Boolean(actual);
    case "falsy":  return !actual;
    case "eq":     return actual === cond.value;
    case "neq":    return actual !== cond.value;
    case "gt":     return Number(actual) > Number(cond.value);
    case "gte":    return Number(actual) >= Number(cond.value);
    case "lt":     return Number(actual) < Number(cond.value);
    case "lte":    return Number(actual) <= Number(cond.value);
    default:       return true;
  }
}

/** Returns the conditions that are NOT met (empty array means all met). */
export function unmetConditions(action: Action, vars: VarMap): Condition[] {
  return (action.conditions ?? []).filter((c) => !evaluateCondition(c, vars));
}

/** True iff all the action's conditions are met (or there are none). */
export function actionAvailable(action: Action, vars: VarMap): boolean {
  return unmetConditions(action, vars).length === 0;
}

/** Apply an action's effects on top of the current vars map (returns new map). */
export function applyEffects(effects: Effect[] | undefined, vars: VarMap): VarMap {
  if (!effects || effects.length === 0) return vars;
  const next = { ...vars };
  for (const eff of effects) {
    if (eff.op === "toggle") {
      next[eff.variable] = !next[eff.variable];
    } else if (eff.value !== undefined) {
      next[eff.variable] = eff.value;
    }
  }
  return next;
}

/** Pretty-print a condition for tooltips/badges. */
export function formatCondition(cond: Condition): string {
  switch (cond.op) {
    case "truthy": return `${cond.variable} es verdadero`;
    case "falsy":  return `${cond.variable} es falso`;
    case "eq":     return `${cond.variable} = ${formatValue(cond.value)}`;
    case "neq":    return `${cond.variable} ≠ ${formatValue(cond.value)}`;
    case "gt":     return `${cond.variable} > ${formatValue(cond.value)}`;
    case "gte":    return `${cond.variable} ≥ ${formatValue(cond.value)}`;
    case "lt":     return `${cond.variable} < ${formatValue(cond.value)}`;
    case "lte":    return `${cond.variable} ≤ ${formatValue(cond.value)}`;
    default:       return cond.variable;
  }
}

/** Pretty-print an effect for tooltips/badges. */
export function formatEffect(eff: Effect): string {
  if (eff.op === "toggle") return `${eff.variable} ⇄`;
  return `${eff.variable} ← ${formatValue(eff.value)}`;
}

function formatValue(v: VarValue | undefined): string {
  if (v === undefined) return "?";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}
