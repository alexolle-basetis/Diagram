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

// ── Schema → example synthesis ────────────────────────────────────────
// OpenAPI lets operations declare schemas without explicit `example`/`examples`.
// When that happens, we synthesize a minimal example so the API Call editor
// still gets a helpful placeholder instead of an empty field.

interface OpenApiSchema {
  type?: string;
  format?: string;
  example?: unknown;
  default?: unknown;
  enum?: unknown[];
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  required?: string[];
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
  $ref?: string;
}

function derefSchema(schema: OpenApiSchema | undefined, doc: OpenApiDoc): OpenApiSchema | undefined {
  if (!schema) return undefined;
  if (!schema.$ref) return schema;
  // Resolve local $refs like "#/components/schemas/Pet"
  const parts = schema.$ref.replace(/^#\//, "").split("/");
  let node: unknown = doc;
  for (const p of parts) {
    if (node && typeof node === "object" && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return node as OpenApiSchema;
}

/** Very light example synthesizer (handles primitives, arrays, objects). */
function generateExample(schema: OpenApiSchema | undefined, doc: OpenApiDoc, depth = 0): unknown {
  if (!schema || depth > 6) return null;
  const s = schema.$ref ? derefSchema(schema, doc) : schema;
  if (!s) return null;
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (s.enum && s.enum.length > 0) return s.enum[0];

  // allOf → merge properties (simple)
  if (s.allOf) {
    const merged: Record<string, unknown> = {};
    for (const sub of s.allOf) {
      const part = generateExample(sub, doc, depth + 1);
      if (part && typeof part === "object" && !Array.isArray(part)) {
        Object.assign(merged, part);
      }
    }
    return merged;
  }
  if (s.oneOf?.[0]) return generateExample(s.oneOf[0], doc, depth + 1);
  if (s.anyOf?.[0]) return generateExample(s.anyOf[0], doc, depth + 1);

  switch (s.type) {
    case "string":
      if (s.format === "date-time") return "2025-01-01T00:00:00Z";
      if (s.format === "date") return "2025-01-01";
      if (s.format === "email") return "user@example.com";
      if (s.format === "uuid") return "00000000-0000-0000-0000-000000000000";
      return "string";
    case "integer": return 0;
    case "number": return 0.0;
    case "boolean": return false;
    case "array": return [generateExample(s.items, doc, depth + 1)].filter((v) => v !== null);
    case "object":
    default: {
      if (!s.properties) return {};
      const out: Record<string, unknown> = {};
      for (const [key, subSchema] of Object.entries(s.properties)) {
        out[key] = generateExample(subSchema, doc, depth + 1);
      }
      return out;
    }
  }
}

/** Pick the first content entry with a usable example or schema. */
function firstExampleOrSchema(
  content: Record<string, { example?: unknown; examples?: Record<string, { value?: unknown }>; schema?: OpenApiSchema }> | undefined,
  doc: OpenApiDoc,
): string | null {
  if (!content) return null;
  for (const mime of Object.values(content)) {
    if (mime.example !== undefined) return JSON.stringify(mime.example, null, 2);
    const firstEx = mime.examples && Object.values(mime.examples)[0];
    if (firstEx?.value !== undefined) return JSON.stringify(firstEx.value, null, 2);
    if (mime.schema) {
      const synth = generateExample(mime.schema, doc);
      if (synth !== null && synth !== undefined) return JSON.stringify(synth, null, 2);
    }
  }
  return null;
}

interface OpenApiOperation {
  parameters?: Array<{ name?: string; in?: string; required?: boolean; schema?: OpenApiSchema; example?: unknown }>;
  requestBody?: { content?: Record<string, { example?: unknown; examples?: Record<string, { value?: unknown }>; schema?: OpenApiSchema }> };
  responses?: Record<string, { content?: Record<string, { example?: unknown; examples?: Record<string, { value?: unknown }>; schema?: OpenApiSchema }> }>;
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
  const op = doc.paths?.[path]?.[method.toLowerCase()] as OpenApiOperation | undefined;
  const response = op?.responses?.[String(statusCode)];
  return firstExampleOrSchema(response?.content, doc);
}

export interface EndpointPrefill {
  requestBody?: string;
  statusCode?: number;
  responsePayload?: string;
  errorPayload?: string;
  headers?: Record<string, string>;
}

/**
 * All-in-one prefill helper. Given an endpoint (method + path), returns the
 * subset of ApiCall fields we can derive from the OpenAPI operation:
 *  - requestBody: from requestBody.content (example or synthesized from schema)
 *  - statusCode:  first declared 2xx response (200/201/204) fallback to first
 *  - responsePayload: example of that success response
 *  - errorPayload:    example of first 4xx/5xx response
 *  - headers:         template map from `in: header` parameters (name → example|"")
 *
 * Returns `null` if the operation does NOT exist in the spec (method+path not
 * declared). Callers use that signal to skip overwriting fields — a user
 * switching to an undocumented combination keeps their manual data.
 */
export function prefillFromEndpoint(
  ref: OpenApiRef | null | undefined,
  method: string,
  path: string,
): EndpointPrefill | null {
  if (!ref) return null;
  const doc = ref.spec as OpenApiDoc;
  const op = doc.paths?.[path]?.[method.toLowerCase()] as OpenApiOperation | undefined;
  if (!op) return null;

  const out: EndpointPrefill = {};

  // Request body
  const body = firstExampleOrSchema(op.requestBody?.content, doc);
  if (body) out.requestBody = body;

  // Success status: prefer 200, then 201, 204, 202, else first 2xx
  const responses = op.responses ?? {};
  const statusCodes = Object.keys(responses);
  const successCode =
    ["200", "201", "204", "202"].find((c) => c in responses)
    ?? statusCodes.find((c) => /^2\d\d$/.test(c));
  if (successCode) {
    out.statusCode = Number(successCode);
    const payload = firstExampleOrSchema(responses[successCode]?.content, doc);
    if (payload) out.responsePayload = payload;
  }

  // Error status: first 4xx/5xx
  const errorCode = statusCodes.find((c) => /^[45]\d\d$/.test(c));
  if (errorCode) {
    const errPayload = firstExampleOrSchema(responses[errorCode]?.content, doc);
    if (errPayload) out.errorPayload = errPayload;
  }

  // Header parameters: build a template map {name: example|""}
  const headerParams = (op.parameters ?? []).filter((p) => p.in === "header" && p.name);
  if (headerParams.length > 0) {
    const headers: Record<string, string> = {};
    for (const p of headerParams) {
      const exampleVal = p.example ?? p.schema?.example ?? (p.schema ? generateExample(p.schema, doc) : "");
      headers[p.name!] = exampleVal !== null && exampleVal !== undefined ? String(exampleVal) : "";
    }
    out.headers = headers;
  }

  return out;
}
