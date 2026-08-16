import { del, get, set } from "idb-keyval";
import { FileImage, FileText, Paperclip } from "lucide-react";
import { deleteDocFromCloud, downloadDocFromCloud } from "./documentStorage.js";

/**
 * Uploaded files are kept in IndexedDB rather than localStorage: localStorage
 * caps out around 5 MB and only stores strings, while IndexedDB holds Blobs
 * directly and scales to hundreds of megabytes. The trip store keeps only the
 * lightweight metadata and refers to blobs by document id.
 */

const key = (docId) => `doc:${docId}`;

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export async function saveFile(docId, file) {
  await set(key(docId), file);
}

export async function loadFile(docId) {
  return get(key(docId));
}

export async function deleteFile(docId) {
  await del(key(docId));
}

/** Remove a document's bytes everywhere it might live — the one place callers
 *  that hold a doc's metadata (not just its id) should go through, so a
 *  cloud-synced copy is never left orphaned in Storage. */
export async function deleteDocEverywhere(doc) {
  await deleteFile(doc.id);
  if (doc.storagePath) deleteDocFromCloud(doc.storagePath);
}

/**
 * A doc's blob may not be on this device yet (e.g. uploaded from another one
 * while signed in) — fall back to Supabase Storage and cache the result
 * locally so the next open is instant and works offline.
 */
async function resolveFile(docId, storagePath) {
  const local = await loadFile(docId);
  if (local) return local;
  if (!storagePath) return undefined;
  try {
    const blob = await downloadDocFromCloud(storagePath);
    if (blob) await saveFile(docId, blob);
    return blob;
  } catch {
    return undefined;
  }
}

/**
 * Resolve a document to an object URL. Callers must revoke the URL when done,
 * otherwise the blob is pinned in memory for the life of the page.
 */
export async function objectUrlFor(docId, storagePath) {
  const blob = await resolveFile(docId, storagePath);
  return blob ? URL.createObjectURL(blob) : null;
}

export async function downloadDoc(docId, filename, storagePath) {
  const url = await objectUrlFor(docId, storagePath);
  if (!url) return false;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}

export function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function kindOf(type = "", name = "") {
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf" || name.toLowerCase().endsWith(".pdf"))
    return "pdf";
  return "file";
}

export const ICON_FOR = { image: FileImage, pdf: FileText, file: Paperclip };
