import { parse as parseYaml } from "yaml";
import type { OpenApiRef } from "../types/diagram";
import type { DiagramData, Screen } from "../types/diagram";

/** Flat representation of an OpenAPI operation — used for autocompletion. */
export interface OpenApiEndpoint {
  method: string;
  path: string;
  summary?: string;
  operationId?: string;
  tag?: string;
}

/** Lightweight shape of the subset of OpenAPI we actually read. */
interface OpenApiDoc {
  openapi?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, unknown>>;
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

/** Parse a raw string as OpenAPI (tries JSON first, then YAML). */
function parseText(text: string): OpenApiDoc {
  try {
    return JSON.parse(text) as OpenApiDoc;
  } catch {
    // Fallback to YAML
    const result = parseYaml(text);
    if (!result || typeof result !== "object") {
      throw new Error("Contenido no es JSON ni YAML válido");
    }
    return result as OpenApiDoc;
  }
}

function buildRef(doc: OpenApiDoc, source: "url" | "file", extras: { url?: string; fileName?: string }): OpenApiRef {
  return {
    source,
    url: extras.url,
    fileName: extras.fileName,
    title: doc.info?.title,
    version: doc.info?.version,
    spec: doc,
    loadedAt: new Date().toISOString(),
  };
}

/** Fetch an OpenAPI spec from a URL (JSON or YAML). CORS must allow it. */
export async function loadFromUrl(url: string): Promise<OpenApiRef> {
  const response = await fetch(url, { headers: { Accept: "application/json, application/yaml, text/yaml, text/plain" } });
  if (!response.ok) throw new Error(`HTTP ${response.status} al cargar la spec`);
  const text = await response.text();
  const doc = parseText(text);
  if (!doc.openapi && !doc.paths) {
    throw new Error("No parece una spec OpenAPI válida (sin 'openapi' ni 'paths')");
  }
  return buildRef(doc, "url", { url });
}

/** Load an OpenAPI spec from a local File (via drag/drop or file input). */
export async function loadFromFile(file: File): Promise<OpenApiRef> {
  const text = await file.text();
  const doc = parseText(text);
  if (!doc.openapi && !doc.paths) {
    throw new Error("No parece una spec OpenAPI válida (sin 'openapi' ni 'paths')");
  }
  return buildRef(doc, "file", { fileName: file.name });
}

/** Extract a flat list of endpoints from a loaded spec. */
export function extractEndpoints(ref: OpenApiRef | null | undefined): OpenApiEndpoint[] {
  if (!ref) return [];
  const doc = ref.spec as OpenApiDoc;
  const paths = doc.paths ?? {};
  const out: OpenApiEndpoint[] = [];
  for (const [path, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== "object") continue;
    for (const [method, op] of Object.entries(methods)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      const operation = (op ?? {}) as { summary?: string; operationId?: string; tags?: string[] };
      out.push({
        method: method.toUpperCase(),
        path,
        summary: operation.summary,
        operationId: operation.operationId,
        tag: operation.tags?.[0],
      });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/**
 * Resolve which OpenAPI spec should be used as suggestions for a given action.
 * Priority:
 *  1. Spec of source screen (if external-api)
 *  2. Spec of target screen (if external-api)
 *  3. Global spec of the diagram
 */
export function resolveSpecForAction(
  diagram: DiagramData,
  source: Screen | undefined,
  target: Screen | undefined,
): OpenApiRef | null {
  if (source?.kind === "external-api" && source.openApi) return source.openApi;
  if (target?.kind === "external-api" && target.openApi) return target.openApi;
  return diagram.openApi ?? null;
}

/**
 * Try to extract a sample response payload for an endpoint+status.
 * Returns stringified JSON or null if no example is available in the spec.
 */
export function sampleResponseFor(
  ref: OpenApiRef | null | undefined,
  method: string,
  path: string,
  statusCode: number,
): string | null {
  if (!ref) return null;
  const doc = ref.spec as OpenApiDoc;
  const pathItem = doc.paths?.[path];
  if (!pathItem) return null;
  const op = pathItem[method.toLowerCase()] as { responses?: Record<string, unknown> } | undefined;
  const response = op?.responses?.[String(statusCode)] as
    | { content?: Record<string, { example?: unknown; examples?: Record<string, { value?: unknown }> }> }
    | undefined;
  if (!response?.content) return null;
  for (const mime of Object.values(response.content)) {
    if (mime.example !== undefined) return JSON.stringify(mime.example, null, 2);
    const first = mime.examples && Object.values(mime.examples)[0];
    if (first?.value !== undefined) return JSON.stringify(first.value, null, 2);
  }
  return null;
}
