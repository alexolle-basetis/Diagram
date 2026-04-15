---
name: diagram-schema
description: Reference for authoring the DiagramData JSON used by this app — full list of fields, enum values, defaults, and examples for screens, actions, api calls, variables, conditions, effects, and OpenAPI specs. TRIGGER when asked to create, edit, generate, import, export, or validate a diagram JSON; when a user pastes JSON and asks for review; when generating diagrams programmatically (AI tools, tests, scripts); or whenever editing `src/data/sampleDiagram.ts` or a `diagram.data` field in Supabase. SKIP for unrelated JSON (package.json, tsconfig, API payloads that aren't DiagramData).
---

# DiagramData schema

Canonical reference for the single-JSON format persisted per diagram. A valid diagram is a JSON object that matches the TypeScript interface `DiagramData` from `src/types/diagram.ts`. Use this skill whenever you need to emit or validate such JSON.

## Top-level shape

```ts
DiagramData {
  screens: Screen[];         // REQUIRED — array, may be empty
  apiCalls: ApiCall[];       // REQUIRED — array, may be empty
  openApi?: OpenApiRef;      // optional — diagram-wide OpenAPI spec
}
```

**Hard requirements:**
- `screens` and `apiCalls` must exist as arrays (empty `[]` is valid). Missing either will fail `validateDiagram`.
- Every `Action.targetScreen` and `Action.errorTargetScreen` must reference an existing `Screen.id` in the same diagram. Dangling edges are silently dropped by the layout engine but flagged as validation warnings.
- Every `ApiCall.actionId` must reference an existing action ID. Orphan API calls are a validation warning.
- All IDs (`Screen.id`, `Action.id`) must be unique across the whole diagram. Colliding IDs break edge routing. Preferred ID format: `prefix_<timestamp-base36>_<counter>` (see `uid()` in `useDiagramStore.ts`), but any unique string works.
- Field names are camelCase. JSON is UTF-8. Booleans are `true`/`false`, not `1`/`0`.
- **Retro-compat promise**: every field marked optional MUST remain optional. Never remove or rename existing fields; old saved diagrams must keep loading.

## Screen

```ts
Screen {
  id: string;                    // REQUIRED, unique
  title: string;                 // REQUIRED, plain text
  description: string;           // REQUIRED, may be ""; supports line breaks
  kind?: NodeKind;               // default "screen"
  viewMode?: "actions" | "screenshot";  // default "actions"
  status?: ScreenStatus;         // default "pending"
  tags?: string[];               // default []
  color?: ScreenColor;           // default (depends on kind) — see KIND_DEFAULTS
  icon?: ScreenIcon;             // default (depends on kind)
  imageUrl?: string;             // URL or data: URL; renders in screenshot mode
  docs?: string;                 // Markdown-rendered in DetailPanel
  openApi?: OpenApiRef;          // ONLY meaningful if kind === "external-api"
  variables?: VarDef[];          // declared here, global namespace across diagram
  actions: Action[];             // REQUIRED array, may be []
}
```

### NodeKind (string enum)

Visual shape + default icon/color. Pick the one that matches the node's semantic role.

| Value | Visual | Typical use |
|---|---|---|
| `"screen"` | rounded rectangle | UI screens (default) |
| `"database"` | cylinder | DB table/collection |
| `"external-api"` | hexagon | third-party API (can hold a per-node OpenAPI spec) |
| `"service"` | rectangle with chevron | backend microservice |
| `"queue"` | rectangle with stacked band | message queue / topic |
| `"user"` | pill / circle | external user actor |

Defaults from `KIND_DEFAULTS` in `src/utils/layoutEngine.ts`:

```
screen       → icon: monitor,  color: slate
database     → icon: database, color: emerald
external-api → icon: cloud,    color: amber
service      → icon: server,   color: blue
queue        → icon: layers,   color: violet
user         → icon: user,     color: rose
```

### ScreenStatus (string enum)

`"pending" | "in-progress" | "done" | "blocked"` — default `"pending"`.
Drives the colored badge in the top-right of each card and the overall progress bar.

### ScreenColor (string enum)

`"slate" | "violet" | "blue" | "cyan" | "emerald" | "amber" | "rose" | "orange"`. Affects header background + border.

### ScreenIcon (string enum)

One of: `"monitor" | "smartphone" | "layout" | "home" | "user" | "settings" | "shield" | "key" | "credit-card" | "shopping-cart" | "file-text" | "mail" | "bell" | "search" | "map" | "camera" | "database" | "cloud" | "terminal" | "globe" | "heart" | "zap" | "lock" | "log-in" | "list" | "bar-chart" | "server" | "layers" | "box"`. Each maps to a Lucide icon in `SCREEN_ICONS`.

### CardViewMode

`"actions" | "screenshot"` — default `"actions"`. Only takes visible effect when `imageUrl` is set; `"screenshot"` then renders the image full-width with action pills underneath.

## Action

```ts
Action {
  id: string;                    // REQUIRED, unique (prefix "act_")
  label: string;                 // REQUIRED, shown in the card row
  targetScreen: string;          // REQUIRED, must be an existing Screen.id
  errorTargetScreen?: string;    // optional error path; renders as a red dashed edge
  note?: string;                 // Markdown-ish short note; shown inline under label
  conditions?: Condition[];      // all must be true for action to be available (AND)
  effects?: Effect[];            // applied when the action is taken in playback
}
```

**Valid self-reference**: `targetScreen === parentScreenId` is allowed (self-loop), though not usually useful.

**No API call here** — that lives in `DiagramData.apiCalls` keyed by `actionId`.

## ApiCall

```ts
ApiCall {
  actionId: string;              // REQUIRED, references an Action.id
  method: string;                // REQUIRED — "GET" | "POST" | "PUT" | "PATCH" | "DELETE" (uppercase)
  endpoint: string;              // REQUIRED, path like "/api/v1/users/{id}"
  requestBody?: string;          // stringified JSON or arbitrary text
  responsePayload?: string;      // stringified JSON of the success response
  statusCode?: number;           // typical: 200, 201, 204, 400, 404, 500
  errorPayload?: string;         // stringified JSON for an error response
  headers?: Record<string, string>;    // name → value, e.g. { "Authorization": "Bearer {token}" }
  queryParams?: Record<string, string>;
}
```

Field order above mirrors the editor UI. `requestBody` / `responsePayload` / `errorPayload` are stored as strings (not nested JSON) so the raw payload survives round-trips even if it isn't strictly valid JSON.

**Uniqueness**: each `actionId` may have at most ONE matching `ApiCall`. If you include two with the same `actionId`, the first wins and the rest are dropped.

## Variables, Conditions, Effects

State-machine sugar used during playback simulation.

### VarDef

```ts
VarDef {
  name: string;                  // REQUIRED, globally unique in the diagram (even though declared on a screen)
  type: "enum" | "boolean" | "number" | "text";  // REQUIRED
  values?: string[];             // REQUIRED ONLY when type === "enum" — allowed values
  defaultValue: string | number | boolean;  // REQUIRED — must match type
  description?: string;
}
```

Rules:
- `name` should be `snake_case_ascii` (enforced by the editor: non-alphanumeric chars are stripped to `_`).
- Duplicate names across different screens: the first-declared wins; later ones are ignored with a dev-mode warning.
- `defaultValue` MUST be type-compatible:
  - `"enum"` → a string that is in `values`
  - `"boolean"` → `true` | `false`
  - `"number"` → any number
  - `"text"` → any string

### Condition (on `Action.conditions`)

```ts
Condition {
  variable: string;                                                  // must match a declared VarDef.name
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "truthy" | "falsy";
  value?: string | number | boolean;                                 // omitted for truthy/falsy
}
```

Multiple conditions on one action combine with **AND**. Operator compatibility:

| Op | Works on | Needs `value`? |
|---|---|---|
| `eq` / `neq` | any type | yes |
| `gt` / `gte` / `lt` / `lte` | number | yes |
| `truthy` / `falsy` | boolean (mainly) | **no** (omit `value`) |

### Effect (on `Action.effects`)

```ts
Effect {
  variable: string;                // must reference a declared VarDef.name
  op?: "set" | "toggle";           // default "set"
  value?: string | number | boolean; // required unless op === "toggle"
}
```

Rules:
- `"set"` + `value` assigns the variable.
- `"toggle"` only works on `boolean`; inverts current value; no `value` needed.

## OpenApiRef

```ts
OpenApiRef {
  source: "url" | "file";          // REQUIRED
  url?: string;                    // REQUIRED when source === "url"
  fileName?: string;               // REQUIRED when source === "file"
  title?: string;                  // info.title from the spec, cached for display
  version?: string;                // info.version
  spec: unknown;                   // REQUIRED — the parsed OpenAPI 3.x document
  loadedAt: string;                // REQUIRED ISO-8601 timestamp
}
```

Placement:
- **Global** at `DiagramData.openApi` — fallback for any API call in the diagram.
- **Per-node** at `Screen.openApi` — only meaningful when `Screen.kind === "external-api"`. Takes precedence over the global one when computing autocomplete suggestions (`resolveSpecForAction`).

## Minimal valid example

```json
{
  "screens": [
    {
      "id": "screen_home",
      "title": "Home",
      "description": "",
      "actions": []
    }
  ],
  "apiCalls": []
}
```

## Rich example (covers every feature)

```json
{
  "screens": [
    {
      "id": "screen_login",
      "kind": "screen",
      "title": "Login",
      "description": "Email + password entry",
      "status": "done",
      "tags": ["auth"],
      "color": "violet",
      "icon": "log-in",
      "viewMode": "actions",
      "docs": "## Login\n\nValidates credentials against `/api/v1/auth/login`.",
      "variables": [
        {
          "name": "is_authenticated",
          "type": "boolean",
          "defaultValue": false,
          "description": "True after a successful login"
        }
      ],
      "actions": [
        {
          "id": "act_submit_login",
          "label": "Submit",
          "targetScreen": "screen_dashboard",
          "errorTargetScreen": "screen_login",
          "note": "On 401, stays on the login screen",
          "effects": [
            { "variable": "is_authenticated", "op": "set", "value": true }
          ]
        }
      ]
    },
    {
      "id": "screen_dashboard",
      "kind": "screen",
      "title": "Dashboard",
      "description": "Main app surface after login",
      "status": "in-progress",
      "actions": [
        {
          "id": "act_logout",
          "label": "Logout",
          "targetScreen": "screen_login",
          "conditions": [
            { "variable": "is_authenticated", "op": "truthy" }
          ],
          "effects": [
            { "variable": "is_authenticated", "op": "toggle" }
          ]
        }
      ]
    },
    {
      "id": "node_auth_api",
      "kind": "external-api",
      "title": "Auth API",
      "description": "3rd-party identity provider",
      "actions": []
    }
  ],
  "apiCalls": [
    {
      "actionId": "act_submit_login",
      "method": "POST",
      "endpoint": "/api/v1/auth/login",
      "statusCode": 200,
      "requestBody": "{\n  \"email\": \"user@example.com\",\n  \"password\": \"***\"\n}",
      "responsePayload": "{\n  \"token\": \"eyJ...\",\n  \"user\": { \"id\": 1 }\n}",
      "errorPayload": "{\n  \"error\": \"Invalid credentials\"\n}",
      "headers": { "Content-Type": "application/json" }
    },
    {
      "actionId": "act_logout",
      "method": "POST",
      "endpoint": "/api/v1/auth/logout",
      "statusCode": 204
    }
  ]
}
```

## Common mistakes to avoid

1. **Forgetting `apiCalls: []`**. An empty array is required; missing it breaks the parse.
2. **Dangling action targets**. `targetScreen: "screen_nope"` when no such screen exists → edge disappears silently. Always include the target screen, or remove the action.
3. **Duplicate IDs**. Especially when hand-writing multiple similar actions — the second one wins in lookups but edges route to the first. Use `act_*` / `screen_*` prefixes + a short semantic suffix.
4. **Wrong `defaultValue` type**. `{ "type": "number", "defaultValue": "5" }` is INVALID — `"5"` is a string. Use `5`.
5. **Enum `defaultValue` not in `values`**. Pick one from the declared list.
6. **Stringified payloads**. `requestBody` and `responsePayload` are strings, not objects. If emitting JSON, embed it as a string (escape inner quotes) — see the example above. The editor preserves formatting.
7. **Uppercase method**. `"method": "get"` works but inconsistently — always uppercase (`"GET"`).
8. **Variables declared on the wrong screen**. A variable declared on Screen A is accessible from Actions on any screen. Place it on the screen that semantically owns the concept (e.g. put `cart_total` on the Cart screen, not on Checkout). It's documentation, not scoping.
9. **`errorTargetScreen` + conditions**. Conditions gate the MAIN path only. Error paths are always traversable in playback when the user picks them explicitly.
10. **Breaking retro-compat**. If you add a new field, make it OPTIONAL with a sensible default applied at render time. Don't require it on existing diagrams or old saves will fail to load.

## Quick checklist before emitting JSON

- [ ] `screens` and `apiCalls` both present as arrays
- [ ] All `Screen.id` and `Action.id` unique
- [ ] Every `targetScreen` / `errorTargetScreen` references an existing screen
- [ ] Every `ApiCall.actionId` matches an action
- [ ] Enum fields use exact declared values (see enum tables above)
- [ ] `defaultValue` matches its `type`
- [ ] `Condition.value` omitted iff `op` is `truthy` / `falsy`
- [ ] `requestBody`/`responsePayload`/`errorPayload` are STRINGS
- [ ] HTTP methods UPPERCASE

## Where to cross-check

- Canonical TS types: `src/types/diagram.ts`
- Defaults and enums: `src/utils/layoutEngine.ts` (`KIND_DEFAULTS`, `SCREEN_ICONS`, `SCREEN_COLORS`, `STATUS_COLORS`)
- Variables semantics: `src/utils/variables.ts`
- Validation: `src/utils/validation.ts` → `validateDiagram()`
- Working example: `src/data/sampleDiagram.ts`
