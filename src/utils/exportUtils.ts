import { toPng } from "html-to-image";
import type { ApiCall } from "../types/diagram";

export async function exportCanvasAsPng(element: HTMLElement, fileName = "diagram.png") {
  const dataUrl = await toPng(element, {
    backgroundColor: "#020617",
    quality: 1,
    pixelRatio: 2,
    filter: (node) => {
      // Exclude controls and minimap from export
      const cl = (node as HTMLElement).classList;
      if (!cl) return true;
      return !cl.contains("react-flow__controls") && !cl.contains("react-flow__minimap");
    },
  });

  const link = document.createElement("a");
  link.download = fileName;
  link.href = dataUrl;
  link.click();
}

export function downloadJson(data: unknown, fileName = "diagram.json") {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = fileName;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export function generateCurl(api: ApiCall, baseUrl = "https://your-api.com"): string {
  const parts = [`curl -X ${api.method}`];
  parts.push(`  '${baseUrl}${api.endpoint}'`);

  if (api.headers) {
    for (const [key, value] of Object.entries(api.headers)) {
      parts.push(`  -H '${key}: ${value}'`);
    }
  }

  if (api.requestBody) {
    parts.push(`  -H 'Content-Type: application/json'`);
    parts.push(`  -d '${api.requestBody.replace(/\n/g, "")}'`);
  }

  return parts.join(" \\\n");
}
