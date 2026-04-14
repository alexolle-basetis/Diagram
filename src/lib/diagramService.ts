import { supabase, type DiagramRow } from "./supabase";
import type { DiagramData } from "../types/diagram";

export interface DiagramSummary {
  id: string;
  name: string;
  updated_at: string;
  created_at: string;
  screenCount: number;
}

export async function listMyDiagrams(userId: string): Promise<DiagramSummary[]> {
  const { data, error } = await supabase
    .from("diagrams")
    .select("id, name, data, updated_at, created_at")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    updated_at: row.updated_at,
    created_at: row.created_at,
    screenCount: (row.data as DiagramData)?.screens?.length ?? 0,
  }));
}

export async function createDiagram(
  userId: string,
  name: string,
  diagram: DiagramData,
): Promise<string> {
  const { data, error } = await supabase
    .from("diagrams")
    .insert({ name, data: diagram, positions: {}, owner_id: userId })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function loadDiagram(
  id: string,
): Promise<{ diagram: DiagramData; positions: Record<string, { x: number; y: number }>; name: string; updatedAt: string }> {
  const { data, error } = await supabase
    .from("diagrams")
    .select("data, positions, name, updated_at")
    .eq("id", id)
    .single();

  if (error) throw error;

  return {
    diagram: data.data as DiagramData,
    positions: (data.positions ?? {}) as Record<string, { x: number; y: number }>,
    name: data.name,
    updatedAt: data.updated_at,
  };
}

export async function saveDiagram(
  id: string,
  diagram: DiagramData,
  positions: Record<string, { x: number; y: number }>,
): Promise<string> {
  const { data, error } = await supabase
    .from("diagrams")
    .update({ data: diagram, positions })
    .eq("id", id)
    .select("updated_at")
    .single();

  if (error) throw error;
  return data.updated_at;
}

export async function renameDiagram(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("diagrams")
    .update({ name })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteDiagram(id: string): Promise<void> {
  const { error } = await supabase
    .from("diagrams")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export function subscribeToDiagram(
  id: string,
  onChange: (row: DiagramRow) => void,
) {
  const channel = supabase
    .channel(`diagram:${id}`)
    .on<DiagramRow>(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "diagrams", filter: `id=eq.${id}` },
      (payload) => onChange(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
