import { getSession } from "./auth.js";
import { supabase } from "./supabase.js";

/**
 * Sharing a trip, two independent mechanisms (see supabase/schema.sql):
 *
 *  - Editor collaborators (`trip_members` + `pending_trip_invites`): invite
 *    someone by email to edit the trip. If that email already has an account
 *    they're added immediately; otherwise the invite waits and resolves
 *    itself the moment that email signs up (a database trigger, not this
 *    module — nothing here has to poll for it).
 *  - View-only share links (`trip_share_links`): a token anyone can open
 *    without an account, read-only, via the `get_trip_by_share_token` RPC.
 */

function assertSupabase() {
  if (!supabase) throw new Error("Supabase is not configured");
}

/**
 * Invite someone to edit a trip. Returns `{ status: "added" }` if they already
 * had an account and are now a collaborator, or `{ status: "pending", emailSent }`
 * if the invite is waiting for that email to sign up — `emailSent` is false
 * when the notification couldn't be sent, but the invite itself is still
 * saved and will resolve normally once they do sign up.
 */
export async function inviteEditor(tripId, email) {
  assertSupabase();
  const normalized = email.trim().toLowerCase();
  const invitedBy = getSession()?.user.id;

  const { data: userId, error: lookupError } = await supabase.rpc(
    "find_user_id_by_email",
    { lookup_email: normalized },
  );
  if (lookupError) throw lookupError;

  if (userId) {
    const { error } = await supabase
      .from("trip_members")
      .insert({ trip_id: tripId, user_id: userId, invited_by: invitedBy });
    // Already a collaborator — treat as success rather than an error to show.
    if (error && error.code !== "23505") throw error;
    return { status: "added" };
  }

  const { error } = await supabase
    .from("pending_trip_invites")
    .insert({ trip_id: tripId, email: normalized, invited_by: invitedBy });
  if (error && error.code !== "23505") throw error;

  // Best-effort: the invite is already saved and resolves on signup either
  // way, so a failed send here shouldn't look like the whole thing failed.
  let emailSent = true;
  try {
    const { error: fnError } = await supabase.functions.invoke(
      "send-trip-invite",
      { body: { tripId, email: normalized } },
    );
    if (fnError) throw fnError;
  } catch (err) {
    // FunctionsHttpError's actual message (from our own function's JSON body)
    // lives on `.context`, a Response — the top-level `.message` is just a
    // generic "non-2xx status code" otherwise.
    let detail = err?.message;
    if (err?.context?.json) {
      try {
        detail = (await err.context.json())?.error ?? detail;
      } catch {
        // Body wasn't JSON — fall back to the generic message.
      }
    }
    console.error("Trip invite: failed to send notification email:", detail);
    emailSent = false;
  }

  return { status: "pending", emailSent };
}

/** People who can currently edit the trip (owner not included). */
export async function listCollaborators(tripId) {
  assertSupabase();
  const { data, error } = await supabase.rpc("list_trip_collaborators", {
    p_trip_id: tripId,
  });
  if (error) throw error;
  return data ?? [];
}

export async function removeCollaborator(tripId, userId) {
  assertSupabase();
  const { error } = await supabase
    .from("trip_members")
    .delete()
    .eq("trip_id", tripId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Invites still waiting for their email to sign up. */
export async function listPendingInvites(tripId) {
  assertSupabase();
  const { data, error } = await supabase
    .from("pending_trip_invites")
    .select("id, email, created_at")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function cancelPendingInvite(id) {
  assertSupabase();
  const { error } = await supabase
    .from("pending_trip_invites")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** Active (non-revoked) view-only links for a trip. */
export async function listShareLinks(tripId) {
  assertSupabase();
  const { data, error } = await supabase
    .from("trip_share_links")
    .select("token, label, created_at")
    .eq("trip_id", tripId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** `label` is just a note for the owner (e.g. who a link was sent to) — it
 *  never gates access, the token alone does. */
export async function createShareLink(tripId, label) {
  assertSupabase();
  const createdBy = getSession()?.user.id;
  const { data, error } = await supabase
    .from("trip_share_links")
    .insert({
      trip_id: tripId,
      label: label?.trim() || null,
      created_by: createdBy,
    })
    .select("token, label, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function revokeShareLink(token) {
  assertSupabase();
  const { error } = await supabase
    .from("trip_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", token);
  if (error) throw error;
}

/**
 * Public read of a shared trip's data by its link token — no auth required.
 * Returns `null` if the token is invalid or has been revoked.
 */
export async function fetchSharedTrip(token) {
  assertSupabase();
  const { data, error } = await supabase.rpc("get_trip_by_share_token", {
    share_token: token,
  });
  if (error) throw error;
  return data;
}
