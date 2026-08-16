import { supabase } from "./supabase.js";
import { getSession } from "./auth.js";

/**
 * One shared bucket, not one per user/trip — Storage buckets are dashboard
 * resources, not meant to be provisioned per row. Isolation instead comes
 * from the object path plus RLS on storage.objects (see schema.sql phase 5),
 * which key off the trip id the same way the `trips` table itself does.
 */
const BUCKET = "trip-documents";

// `{uploader}/{tripId}/{docId}` — the uploader segment is organizational
// only (lets a bucket browse read like a per-user tree); actual access is
// governed entirely by trip membership, checked from the tripId segment.
function objectPath(tripId, docId) {
  const uploaderId = getSession()?.user?.id ?? "unknown";
  return `${uploaderId}/${tripId}/${docId}`;
}

/** Upload (or overwrite) a document's bytes; returns the storage path to save on its metadata. */
export async function uploadDocToCloud(tripId, docId, file) {
  const path = objectPath(tripId, docId);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

export async function downloadDocFromCloud(storagePath) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath);
  if (error) throw error;
  return data;
}

export async function deleteDocFromCloud(storagePath) {
  if (!storagePath) return;
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) console.error("Cloud sync: failed to delete document", error);
}
