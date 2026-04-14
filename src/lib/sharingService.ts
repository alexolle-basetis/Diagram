import { supabase } from "./supabase";
import type { DiagramData } from "../types/diagram";

export interface SharedDiagramSummary {
  id: string;
  name: string;
  updated_at: string;
  created_at: string;
  screenCount: number;
  owner_email: string;
  owner_name: string | null;
  owner_avatar: string | null;
  role: "viewer" | "editor";
}

export interface ShareEntry {
  share_id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "viewer" | "editor";
}

/** List diagrams shared with the current user */
export async function listSharedWithMe(): Promise<SharedDiagramSummary[]> {
  const { data, error } = await supabase.rpc("list_shared_with_me");
  if (error) throw error;

  return (data ?? []).map((row: {
    diagram_id: string; name: string; data: unknown;
    updated_at: string; created_at: string;
    owner_email: string; owner_name: string | null; owner_avatar: string | null;
    share_role: string;
  }) => ({
    id: row.diagram_id,
    name: row.name,
    updated_at: row.updated_at,
    created_at: row.created_at,
    screenCount: (row.data as DiagramData)?.screens?.length ?? 0,
    owner_email: row.owner_email,
    owner_name: row.owner_name,
    owner_avatar: row.owner_avatar,
    role: row.share_role as "viewer" | "editor",
  }));
}

/** Toggle public/private visibility */
export async function setDiagramPublic(diagramId: string, isPublic: boolean): Promise<void> {
  const { error } = await supabase
    .from("diagrams")
    .update({ is_public: isPublic })
    .eq("id", diagramId);

  if (error) throw error;
}

/** Get the is_public status */
export async function getDiagramVisibility(diagramId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("diagrams")
    .select("is_public")
    .eq("id", diagramId)
    .single();

  if (error) throw error;
  return data.is_public ?? false;
}

/** Find user by email for sharing */
export async function findUserByEmail(email: string): Promise<{
  id: string; email: string; full_name: string | null; avatar_url: string | null;
} | null> {
  const { data, error } = await supabase
    .rpc("find_user_by_email", { lookup_email: email });

  if (error) throw error;
  return data?.[0] ?? null;
}

/** Share diagram with a user */
export async function shareDiagram(
  diagramId: string,
  userId: string,
  role: "viewer" | "editor",
): Promise<void> {
  const { error } = await supabase
    .from("diagram_shares")
    .upsert(
      { diagram_id: diagramId, shared_with: userId, role },
      { onConflict: "diagram_id,shared_with" },
    );

  if (error) throw error;
}

/** Remove share */
export async function unshareDiagram(shareId: string): Promise<void> {
  const { error } = await supabase
    .from("diagram_shares")
    .delete()
    .eq("id", shareId);

  if (error) throw error;
}

/** List users who have access to a diagram */
export async function listDiagramShares(diagramId: string): Promise<ShareEntry[]> {
  const { data, error } = await supabase
    .rpc("get_diagram_shares", { p_diagram_id: diagramId });

  if (error) throw error;

  return (data ?? []).map((row: {
    share_id: string; user_id: string; email: string;
    full_name: string | null; avatar_url: string | null; role: string;
  }) => ({
    share_id: row.share_id,
    user_id: row.user_id,
    email: row.email,
    full_name: row.full_name,
    avatar_url: row.avatar_url,
    role: row.role as "viewer" | "editor",
  }));
}
