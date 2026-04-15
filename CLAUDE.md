# CLAUDE.md

Guía para Claude Code al trabajar en este repositorio.

## Commands

- **Dev:** `npm run dev` (Vite + HMR)
- **Build:** `npm run build` (tsc -b → vite build, output `dist/`)
- **Lint:** `npm run lint` (ESLint 9 flat config, TS + React)
- **Preview:** `npm run preview`

No hay framework de tests. Validación manual con smoke-test en dev server.

## Stack

React 19 + Vite 8 + TypeScript 6 + Tailwind 4 (`@tailwindcss/vite`) + React Flow 12 (`@xyflow/react`) + Zustand + Supabase (opcional, auth + realtime).

TypeScript strict: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `erasableSyntaxOnly`. Project refs: `tsconfig.app.json` + `tsconfig.node.json`.

## Modos de ejecución

La app tiene dos modos — detectados en tiempo de carga:

- **Local mode** — cuando no hay `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` en `.env`, o la URL contiene `#local`. Todo va a `localStorage`. Sin auth ni multi-user.
- **Cloud mode** — Supabase con auth OAuth (Google/GitHub), persistencia en tabla `diagrams`, realtime sync, sharing por email.

Check `isSupabaseConfigured` (`src/lib/supabase.ts`) antes de asumir capacidades cloud.

## Data model (`src/types/diagram.ts`)

Fuente de verdad: un objeto JSON `DiagramData`.

```ts
DiagramData {
  screens: Screen[];
  apiCalls: ApiCall[];
  openApi?: OpenApiRef;          // spec global (fallback)
}

Screen {
  id, title, description;
  kind?: NodeKind;               // screen|database|external-api|service|queue|user
  viewMode?: "actions"|"screenshot";
  status?, tags?, color?, icon?;
  imageUrl?, docs?;
  openApi?: OpenApiRef;          // spec por-nodo (sólo si kind==="external-api")
  variables?: VarDef[];          // declaración de variables de estado (namespace global)
  actions: Action[];
}

Action {
  id, label, targetScreen, errorTargetScreen?, note?;
  conditions?: Condition[];      // gating durante playback (AND)
  effects?: Effect[];            // side-effects sobre variables al ejecutarse
}

ApiCall { actionId, method, endpoint, requestBody?, responsePayload?, statusCode?, errorPayload?, headers?, queryParams? }

OpenApiRef { source: "url"|"file", url?, fileName?, title?, version?, spec: unknown, loadedAt }

VarDef { name, type: "enum"|"boolean"|"number"|"text", values?: string[], defaultValue: VarValue, description? }
Condition { variable, op: "eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"truthy"|"falsy", value? }
Effect    { variable, op?: "set"|"toggle", value? }
```

**Retro-compat:** todos los campos nuevos son opcionales con defaults. `kind ?? "screen"`, `viewMode ?? "actions"`, etc. Nunca romper diagramas antiguos.

## Store — `src/store/useDiagramStore.ts`

Un único Zustand store con toda la lógica CRUD, undo/redo, validación, sync JSON, persistencia y selección. Patrón clave:

- **`commit(state, newDiagram, extra?)`** — helper interno que **en una sola pasada**: push a `past` (undo), clear `future`, actualiza `diagram` + `jsonText`, persiste a localStorage y corre validación. TODAS las mutaciones de datos pasan por `commit()`.
- **Selección** guarda IDs (`screenId`, `actionId`), no snapshots — DetailPanel siempre lee fresco del store.
- **`loadDiagram(d)`** = reset total (URL share, carga cloud). **`mergeRemoteDiagram(d)`** = merge preservando selección/undo (realtime de otros usuarios).
- **`updateNodePosition`** NO pasa por `commit()` — sólo persiste posición, no entra en undo.
- **IDs**: generados con `uid(prefix)` (prefix + timestamp base36 + counter). Siempre únicos.

Estado de playback en el mismo store pero no persistido ni en undo: `playback: { active, nodeId, trail }`.

Estado cloud: `cloudDiagramId`, `cloudDiagramName`, `saveStatus` (saved|saving|unsaved|error|offline).

## Preferences — `src/store/usePreferencesStore.ts`

Separado del store principal. Persistido a localStorage key `diagram-preferences`. Contiene UI prefs globales que no son "datos del diagrama":

- `theme: "dark"|"light"` (aplica clase `.light` al html)
- `edgeStyle: "bezier"|"straight"|"step"|"smoothstep"` — trazado del edge
- `edgeConnectMode: "flow"|"free"` — routing de handles. En `free` se usa `ConnectionMode.Loose` + handles source extra en top/bottom/left.

No mezclar con `useDiagramStore`. Datos del diagrama (colores por screen, tipos, etc.) van en el diagrama. Prefs cross-diagram van aquí.

## Sync cloud — `src/hooks/useSupabaseSync.ts`

Se activa sólo si hay `diagramId`. Responsabilidades:

1. **Load** diagrama + posiciones + nombre al montar (`loadDiagram` en diagramService).
2. **Save debounced 1 s** cuando cambia `diagram` o `nodePositions`.
3. **Realtime subscribe** (`postgres_changes` filtrado por id) y aplicar `mergeRemoteDiagram`.

Reglas de correctness multi-usuario (importantes — no romper):

- **Filtrado de ecos propios**: cada save añade el `updated_at` devuelto a un `Set<string>` (TTL 15 s). El handler realtime ignora si el evento está en el set. **No usar** flags tipo "ignoreNextRemote" — consumen eventos ajenos por error.
- **Buffer durante edición activa**: si llega un evento remoto mientras `hasPendingLocal.current === true` (saveTimer activo), se guarda en `pendingRemote` y se aplica tras nuestro próximo save. Esto evita machacar texto que se está escribiendo.

Si añades un nuevo campo al diagrama que debe sincronizar, basta con que viaje en `DiagramData` — el save/load son genéricos.

## Layout — `src/utils/layoutEngine.ts`

`buildFlowElements(diagram, savedPositions?)` → `{ nodes, edges }` para React Flow.

Algoritmo (Sugiyama-style, en `computeAutoLayout`):

1. **Subgrafos conectados** (weakly-connected components) — se identifican y se apilan verticalmente con `COMPONENT_GAP`. Evita que diagramas desconectados se solapen en (0,0).
2. **Longest-path layering** (no BFS): cada nodo se asigna a la capa `max(predecessores) + 1`. Cycle-safe: las back-edges aportan 0 en lugar de recursar. Sólo se usa el camino de éxito (`targetScreen`) para la asignación; los `errorTargetScreen` no inflan distancias.
3. **Barycenter heuristic** para minimizar cruces — `BARYCENTER_PASSES` pasadas alternando top-down y bottom-up reordenan cada capa por el promedio de posiciones de los vecinos en la capa adyacente.
4. **Coordenadas con altura real**: cada columna se apila con la altura concreta de cada nodo (`NODE_HEIGHT_BASE + actions * ACTION_HEIGHT`). Las columnas se centran verticalmente respecto a la más alta.
5. `savedPositions[id]` siempre gana sobre el cómputo automático (las cards arrastradas a mano se respetan).

Constantes: `NODE_WIDTH=280`, `NODE_HEIGHT_BASE=120`, `ACTION_HEIGHT=36`, `H_GAP=120`, `V_GAP=60`, `COMPONENT_GAP=140`, `BARYCENTER_PASSES=6`.

Edges: cada acción genera 1 edge (`edge-{actionId}`) y, si tiene `errorTargetScreen`, un segundo edge (`edge-err-{actionId}`, rojo discontinuo). Edges hacia screens inexistentes se descartan (evita warnings de React Flow).

`ScreenNodeData` recibe `kind`/`viewMode`/`imageUrl` con defaults desde `KIND_DEFAULTS[kind]`.

También exporta **`KIND_DEFAULTS`** (icon/color/label por `NodeKind`), **`SCREEN_ICONS`**, **`SCREEN_COLORS`** y **`STATUS_COLORS`**. Si añades un `ScreenIcon` nuevo, recuerda registrarlo aquí.

## Canvas — `src/components/DiagramCanvas.tsx`

`nodeTypes = { screenNode }`, `edgeTypes = { apiEdge }`.

- **`onConnect`** — crea acción si `sourceHandle` empieza por `__new`, si no reconecta acción existente (`sourceHandle === action.id`).
- **`onConnectEnd`** — si se suelta sobre un nodo sin validar (`!state.isValid && state.toNode`), crea la conexión igualmente. UX intuitiva.
- **`connectionMode`** viene de `edgeConnectMode` (Loose si "free", Strict si "flow").
- **Atajos**: Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z (redo), Delete/Backspace (borra selección), Esc (sale de playback o limpia selección).
- **Durante playback**: clicks sobre nodo/edge se ignoran. Arriba se muestra breadcrumb de `playback.trail` + botón "Salir". Al salir, `fitView` vuelve a la vista completa.

## Nodos — `src/components/ScreenNode.tsx`

Un único componente para todos los `NodeKind`. `KIND_SHELL[kind]` define `outer` (clases Tailwind con clip-path/rounded) y `tag` (etiqueta textual DB/SRV/QUEUE/EXT API/USER).

- **Handles**: target siempre en `Left`; source per-acción en `Right` con `id = action.id`; `__new__` handle en `Right` para nuevas conexiones.
- **Free mode**: añade `__new_top__`, `__new_bottom__`, `__new_left__` source handles.
- **ViewMode**: si `"screenshot"` y hay `imageUrl`, muestra imagen + pills numeradas (handles preservados en las pills para que los edges sigan conectando).
- **User kind**: renderizado pill compacto especial (icono + título centrados).
- **Playback**: botón `Play` bottom-right siempre visible a 60% opacidad. Si `playback.nodeId === id` → ring violeta animado + `<PlaybackOverlay>` montado debajo de la card.
- **Dimming**: `filterTag` (tag no incluido) OR playback activo con este nodo no-activo → `opacity-25`.

## Edges — `src/components/ApiEdge.tsx`

Selecciona el path helper según `edgeStyle` de prefs (`getBezierPath`/`getStraightPath`/`getSmoothStepPath`).

Reglas de color/stroke:

- selected → violet sólido
- isErrorPath → red discontinuo
- hasApi → amber sólido 2px
- hasNote → sky discontinuo 1.5px
- default → slate discontinuo

Label badge con `EdgeLabelRenderer` mostrando método+endpoint (API) o nota. Clic = seleccionar edge.

## OpenAPI — `src/lib/openApiService.ts`

- `loadFromUrl(url)` / `loadFromFile(file)` → `OpenApiRef`. Parser intenta JSON primero, fallback a `yaml.parse`.
- `extractEndpoints(ref)` → `{ method, path, summary, operationId, tag }[]` ordenado por path+method.
- `resolveSpecForAction(diagram, source, target)` → prioridad: source.openApi (si external-api) > target.openApi (si external-api) > diagram.openApi. Usar SIEMPRE esta resolución al ofrecer sugerencias.
- `sampleResponseFor(ref, method, path, statusCode)` → extrae primer `example`/`examples[0].value` del spec.

UI:

- **Global**: botón `BookOpen` en `Toolbar` → `OpenApiDialog`.
- **Por-nodo**: en `DetailPanel` sólo si `kind === "external-api"`.
- **Autocompletado**: `<datalist>` en el input de endpoint del `EdgeEditor`. Al escoger una ruta, auto-rellena `method` y pre-popula `responsePayload` con sample si no había.

## Playback

- `startPlayback(nodeId)` → activo, seedea variables a sus defaults, trail = `[{nodeId, vars}]`.
- `advancePlayback(targetId, actionId?)` → si pasa `actionId`, aplica los `effects` de esa acción a las variables ANTES de empujar al trail. Cada entrada de trail es `{nodeId, vars}` (snapshot).
- `stepBackPlayback(nodeId)` → trunca trail al punto, restaura variables desde el snapshot.
- `setPlaybackVariable(name, value)` → override manual; también muta el último snapshot del trail (para que stepback sea coherente).
- `resetPlaybackVariables()` → vuelve a los defaults manteniendo el nodo actual.
- `stopPlayback()` → reset completo.
- Animación de cámara: `setCenter(x, y, { duration, zoom })` via `useReactFlow()`.
- `PlaybackOverlay` se monta DENTRO del ScreenNode activo (posición absoluta `top-full mt-3`) para evitar proyecciones de coordenadas.
- `VariablesPanel` se monta en `DiagramCanvas` (bottom-left) durante el playback con override manual.

## Variables / Conditions / Effects (`src/utils/variables.ts`)

Sistema simple de "máquina de estados" para simular flujos durante el playback.

- **Variables** se declaran en `Screen.variables` (cada pantalla es la "dueña lógica") pero el namespace es **global al diagrama** — el `name` debe ser único. `collectVariables(diagram)` agrega todas y deduplica por nombre (primera declaración gana).
- **Conditions** en `Action.conditions` se combinan con AND. Se evalúan vía `evaluateCondition(c, vars)` / `unmetConditions(action, vars)` / `actionAvailable(action, vars)`. Operadores: `eq`/`neq` (todos los tipos), `gt`/`gte`/`lt`/`lte` (number), `truthy`/`falsy` (boolean — no requieren `value`).
- **Effects** en `Action.effects` se aplican vía `applyEffects(effects, vars)` que devuelve un nuevo map. Soporta `op: "set"` (default) y `op: "toggle"` (sólo boolean).
- **Visualización fuera del playback**: badges `Lock` (violet) y `Sparkles` (fuchsia) en `ScreenNode` indican `hasConditions`/`hasEffects`. El layout engine inyecta esos flags en `ScreenNodeData.actions[]`.
- **Visualización dentro del playback**: en `PlaybackOverlay` las acciones bloqueadas salen atenuadas con icono Lock + lista de condiciones no satisfechas. Las disponibles muestran preview de sus efectos.
- **Edición**: `VariablesEditor` (en `ScreenEditor`), `ConditionsEditor` y `EffectsEditor` (en `EdgeEditor`). Todos en `DetailPanel.tsx`. Comparten el sub-componente `ValueInput` que renderiza el input adecuado al `VarType`.
- **Pretty-print**: `formatCondition(c)` → "estado_luz = encendida"; `formatEffect(e)` → "estado_luz ← encendida" o "varbool ⇄". Útiles para tooltips y badges.

## DetailPanel

Resizable (320–800px, persistido en `detail-panel-width`). Switchea entre `ScreenEditor` y `EdgeEditor` según `selection.kind`.

Sub-componentes reutilizables:

- **`Field({ label, children })`** — wrapper con título uppercase tracking-wider.
- **`MarkdownField`** — textarea + preview toggle con `<Markdown>`.
- **`CollapsibleAction`** — fila expandible de acción con target selector, error selector, nota e inline API CRUD.
- **`TagEditor`** — pills + input con Enter/blur.
- **`HeadersEditor`** — key/value rows.

Selector de tipo: grid 3×2 con iconos de `KIND_DEFAULTS`. Al cambiar `kind`, si icon/color estaban vacíos se asignan los defaults del tipo (sin sobreescribir personalizaciones).

## Toolbar

Layout: botones agrupados por `<Separator />`. Factory `ToolbarButton({ icon, label?, tooltip?, onClick, disabled? })`.

Indicadores a la derecha: save status (cloud), validation errors/warnings, progress bar (% done), avatar + logout.

Importante: `isCloud = isSupabaseConfigured && hash !== "#local"` se calcula top-level — afecta qué elementos se muestran (back button, diagram name, share).

## Rutas/URLs

- `?id=<uuid>` — diagrama cloud específico. `App.tsx` lo consume **sólo si el id cambió** respecto al store (evita que `TOKEN_REFRESHED` de Supabase borre el nombre al recuperar foco de pestaña).
- `#d=<compressed>` — diagrama compartido vía URL (gzip base64url, en `urlShare.ts`). Se consume al montar y se limpia del hash.
- `#local` — fuerza modo local incluso con Supabase configurado.

## Convenciones UI/Tailwind

- **Dark-first**: clases base asumen dark. Para light usar `dark:` y `light:` explícitos **o** leer `theme` de prefs y alternar clases (patrón visto en MiniMap/Controls).
- **Textos**: `text-slate-100` (primary), `-300` (secondary), `-400/-500` (muted), `-600` (disabled).
- **Paleta de accent**: violeta (selección/marca), emerald (saved/ok), amber (API/warnings), sky (notas), red (errores/blocked).
- Clase compartida `.input-field` (definida en `index.css` via `@layer components`). Usarla para todos los inputs/selects/textareas.
- Iconos = `lucide-react` siempre. Tamaños habituales: `w-3 h-3` (inline mini), `w-3.5 h-3.5` (small), `w-4 h-4` (normal toolbar).

## localStorage keys

- `diagram-app-state` — diagrama + posiciones
- `diagram-preferences` — theme/edgeStyle/edgeConnectMode
- `diagram-show-json` — toggle JSON panel
- `detail-panel-width` — resize del DetailPanel
- `gemini-api-key` — API key de Gemini (AiPanel)

Si añades una nueva key, documentarla aquí.

## Supabase (cloud mode)

Tablas: `diagrams` (id, name, data, positions, owner_id, is_public, updated_at) y `diagram_shares` (diagram_id, shared_with, role: viewer|editor). RLS enforced via policies en `supabase/migration*.sql`. RPCs: `find_user_by_email`, `get_diagram_shares`, `list_shared_with_me`.

Realtime publication incluye `diagrams`. Un save dispara `postgres_changes UPDATE` para todos los suscriptores (RLS aplicada en versiones recientes de Supabase Realtime).

### Migraciones (orden importante)

1. `supabase/migration.sql` — schema inicial. **Ojo**: incluye 2 políticas abiertas ("Authenticated can view/update any diagram") que estaban pensadas como MVP de colaboración. Cualquier usuario logueado puede leer/editar todo si te quedas aquí.
2. `supabase/migration_sharing.sql` — añade `is_public`, tabla `diagram_shares`, dropea las políticas abiertas y aplica las restrictivas (owner / public / shared).
3. `supabase/migration_lockdown.sql` — **migración de seguridad idempotente**. Si los diagramas privados son visibles para cualquier usuario logueado, casi siempre es porque (2) nunca se aplicó. Esta migración es re-runnable: dropea TODAS las policies de `diagrams` + `diagram_shares`, recrea las correctas, garantiza RLS habilitada, y deja queries de verificación comentadas. Es la red de seguridad por defecto cuando se duda del estado del schema.

### Acceso denegado en el cliente

`useSupabaseSync.loadDiagram(...)` propaga errores vía `onLoaded({ ok: false, error })`. `EditorView` (en `App.tsx`) renderiza una pantalla "🔒 Acceso denegado" con botón "Volver a mis diagramas" cuando el load falla — evita que un fallo de RLS se confunda con el diagrama anterior persistido en localStorage. El código de error PGRST116 ("no rows") se traduce a "no tienes acceso o no existe".

## Patrones al añadir funcionalidad

- **Nuevo campo en Screen/Action/DiagramData** → añadir a `src/types/diagram.ts` como **opcional**, defaults sensatos en el render/layoutEngine, y el store lo propaga automáticamente (viaja en `diagram`). El sync cloud también lo propaga sin cambios.
- **Nueva mutación** → método en el store que termine llamando a `commit(s, newDiagram, extra?)`. Nunca `set({ diagram })` directo para cambios de datos.
- **Nueva preferencia UI global** → `usePreferencesStore` (NO `useDiagramStore`), tipo estricto, default en `loadPreferences()`, persist en setter.
- **Nuevo tipo de nodo** → añadir a `NodeKind`, entrada en `KIND_DEFAULTS` y `KIND_SHELL`, opcionalmente icono nuevo en `SCREEN_ICONS`. `ScreenNode` lo renderiza automáticamente.
- **Nuevo icono** → importar de lucide + registrar en `SCREEN_ICONS` con label. Aparece en el selector del DetailPanel.
- **Nuevo handle** → si es para crear conexiones "desde cualquier sitio", id con prefijo `__new` (el handler lo reconoce).
- **Nuevo modal** → patrón de `OpenApiDialog`/`ShareDialog`: `{ open, onClose }` props + render condicional desde el invocador. Stop-propagation en el contenido.
- **Nuevo operador de condición o tipo de variable** → extender `VarType`/`CondOp` en `types/diagram.ts`, añadir caso a `evaluateCondition`/`coerceValue`/`formatCondition` en `utils/variables.ts`, y al `<select>` del operador en `ConditionRow` (`DetailPanel.tsx`).
- **Nuevo badge/indicador en toolbar** → usar `ToolbarButton` si es acción, o un div inline si es indicador.

## Qué evitar

- `localStorage.setItem` disperso. Usar `persist()` del store (datos) o la función `persist()` de prefs.
- Escribir al store fuera de una acción definida en la interfaz — siempre exponer un método tipado.
- Crear un store Zustand nuevo para algo que cabe en `useDiagramStore`. El store único es el patrón.
- Tocar `ignoreNextRemote`-style flags en el sync. El patrón correcto es "set de updated_at propios" + "buffer pendiente durante edición".
- Eliminar o renombrar campos del `DiagramData` sin retro-compat — hay diagramas de usuarios ya guardados.
- Asumir `isSupabaseConfigured`. Siempre ramificar comportamiento local vs cloud.
