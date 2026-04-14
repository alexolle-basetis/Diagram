import type { DiagramData } from "../types/diagram";

/**
 * Compress a DiagramData into a URL-safe base64 string using native gzip.
 * Strips embedded base64 images to keep the URL manageable.
 */
export async function compressToHash(data: DiagramData): Promise<string> {
  const stripped: DiagramData = {
    ...data,
    screens: data.screens.map((s) => ({
      ...s,
      imageUrl: s.imageUrl?.startsWith("data:") ? undefined : s.imageUrl,
    })),
  };

  const json = JSON.stringify(stripped);
  const bytes = new TextEncoder().encode(json);

  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();

  const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  const binary = Array.from(compressed, (b) => String.fromCharCode(b)).join("");
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decompress a URL hash string back into DiagramData.
 */
export async function decompressFromHash(hash: string): Promise<DiagramData> {
  const base64 = hash.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();

  const decompressed = new Uint8Array(await new Response(ds.readable).arrayBuffer());
  const json = new TextDecoder().decode(decompressed);
  return JSON.parse(json) as DiagramData;
}

/**
 * Check current URL for a shared diagram hash and return it, or null.
 */
export function getHashFromUrl(): string | null {
  const hash = window.location.hash;
  if (hash.startsWith("#d=")) {
    return hash.slice(3);
  }
  return null;
}

/**
 * Build a full share URL with the diagram encoded in the hash.
 */
export async function buildShareUrl(data: DiagramData): Promise<string> {
  const compressed = await compressToHash(data);
  const base = window.location.href.split("#")[0];
  return `${base}#d=${compressed}`;
}
