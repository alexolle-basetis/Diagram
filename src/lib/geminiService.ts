import type { DiagramData } from "../types/diagram";

const STORAGE_KEY = "gemini-api-key";

export function getGeminiApiKey(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setGeminiApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

export function removeGeminiApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

const SYSTEM_PROMPT = `Eres un asistente experto en diseño de diagramas de flujo de aplicaciones. Tu trabajo es generar o modificar un diagrama JSON que describe pantallas, acciones (transiciones entre pantallas), y llamadas API opcionales.

## Esquema JSON que debes producir

El diagrama sigue esta estructura TypeScript:

\`\`\`typescript
interface DiagramData {
  screens: Screen[];
  apiCalls: ApiCall[];
}

interface Screen {
  id: string;           // Identificador único, formato: "screen_<slug>" (ej: "screen_login", "screen_home")
  title: string;        // Nombre de la pantalla
  description: string;  // Descripción breve de lo que hace la pantalla
  status?: "pending" | "in-progress" | "done" | "blocked";
  tags?: string[];      // Tags para categorizar (ej: ["auth", "onboarding"])
  color?: "slate" | "violet" | "blue" | "cyan" | "emerald" | "amber" | "rose" | "orange";
  icon?: "monitor" | "smartphone" | "layout" | "home" | "user" | "settings" | "shield" | "key" | "credit-card" | "shopping-cart" | "file-text" | "mail" | "bell" | "search" | "map" | "camera" | "database" | "cloud" | "terminal" | "globe" | "heart" | "zap" | "lock" | "log-in" | "list" | "bar-chart";
  actions: Action[];    // Transiciones/acciones desde esta pantalla
}

interface Action {
  id: string;              // Identificador único, formato: "act_<slug>" (ej: "act_submit_login")
  label: string;           // Texto de la acción (ej: "Enviar formulario")
  targetScreen: string;    // ID de la pantalla destino
  errorTargetScreen?: string; // ID de la pantalla en caso de error (opcional)
  note?: string;           // Nota en markdown sobre la acción (opcional)
}

interface ApiCall {
  actionId: string;        // ID de la acción asociada
  method: string;          // HTTP method: GET, POST, PUT, DELETE, PATCH
  endpoint: string;        // URL del endpoint (ej: "/api/auth/login")
  requestBody?: string;    // Body del request en JSON (opcional)
  responsePayload?: string; // Payload de respuesta esperado (opcional)
  statusCode?: number;     // Código de respuesta esperado (ej: 200)
  errorPayload?: string;   // Payload de error (opcional)
  headers?: Record<string, string>; // Headers custom (opcional)
  queryParams?: Record<string, string>; // Query params (opcional)
}
\`\`\`

## Reglas importantes

1. **IDs únicos**: Cada screen y action debe tener un ID único. Usa el formato \`screen_<nombre_descriptivo>\` y \`act_<verbo_descriptivo>\`.
2. **Referencias válidas**: Toda referencia a \`targetScreen\` y \`errorTargetScreen\` debe apuntar a un ID de screen que exista en el array.
3. **apiCalls**: Solo añade API calls cuando el usuario las pida o cuando sea obvio por el contexto (ej: un login necesita un POST /auth/login).
4. **Colores e iconos**: Usa colores e iconos que tengan sentido semántico. Ej: pantallas de auth en "violet" con icono "shield", pantallas de settings en "amber" con icono "settings".
5. **Tags**: Agrupa pantallas relacionadas con tags comunes.
6. **Preservar lo existente**: Si el usuario proporciona un diagrama existente, NO elimines pantallas, acciones o API calls que no mencione. Solo modifica lo que el usuario pide o añade lo nuevo.
7. **Respuesta**: Responde SIEMPRE con un JSON válido del tipo DiagramData dentro de un bloque \`\`\`json. Puedes añadir explicaciones antes o después del bloque JSON.
8. **Idioma**: Responde en el mismo idioma que el usuario use en su mensaje.`;

export interface GeminiMessage {
  role: "user" | "model";
  text: string;
}

export async function sendToGemini(
  messages: GeminiMessage[],
  currentDiagram: DiagramData,
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error("No API key configured");

  const contents = [
    {
      role: "user",
      parts: [{ text: SYSTEM_PROMPT }],
    },
    {
      role: "model",
      parts: [{ text: "Entendido. Estoy listo para generar o modificar diagramas de flujo. Envíame el diagrama actual y tu petición." }],
    },
    {
      role: "user",
      parts: [{ text: `Este es el diagrama actual sobre el que trabajaremos:\n\n\`\`\`json\n${JSON.stringify(currentDiagram, null, 2)}\n\`\`\`` }],
    },
    {
      role: "model",
      parts: [{ text: "Perfecto, tengo el diagrama cargado. ¿Qué modificación necesitas?" }],
    },
    ...messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
  ];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 16384,
        },
      }),
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ?? `Gemini API error: ${response.status}`,
    );
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");

  return text;
}

/** Extract JSON diagram from Gemini's response text */
export function extractDiagramFromResponse(text: string): DiagramData | null {
  // Look for ```json ... ``` block
  const jsonMatch = text.match(/```json\s*\n?([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as DiagramData;
      if (Array.isArray(parsed.screens)) {
        if (!parsed.apiCalls) parsed.apiCalls = [];
        return parsed;
      }
    } catch { /* invalid JSON in block */ }
  }

  // Try parsing the entire response as JSON
  try {
    const parsed = JSON.parse(text) as DiagramData;
    if (Array.isArray(parsed.screens)) {
      if (!parsed.apiCalls) parsed.apiCalls = [];
      return parsed;
    }
  } catch { /* not JSON */ }

  return null;
}
