import { deleteDocEverywhere, saveFile } from "./docs.js";
import { uploadDocToCloud } from "./documentStorage.js";
import { getTripById, setTripCover, upsertTripNow } from "./store.js";

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Store an uploaded cover photo for a trip: the bytes go to IndexedDB (and,
 * signed in, Storage), then the reference is recorded on the trip and the
 * photo it replaces is freed. Callers validate the file first. `role` gates
 * the owner-only upsert that guarantees the row exists before Storage's RLS
 * check looks it up by trip id.
 */
export async function saveTripCover({ tripId, role, file, cloudMode }) {
  const id = uid();
  const previous = getTripById(tripId)?.coverDoc ?? null;
  await saveFile(id, file);

  const meta = {
    id,
    name: file.name,
    type: file.type,
    size: file.size,
    addedAt: new Date().toISOString(),
  };

  if (cloudMode) {
    if (role === "owner") {
      const full = getTripById(tripId);
      if (full) await upsertTripNow(full);
    }
    meta.storagePath = await uploadDocToCloud(tripId, id, file);
  }

  setTripCover(tripId, meta);
  // The photo this one supersedes is now unreferenced — clear its bytes.
  if (previous) deleteDocEverywhere(previous);
  return meta;
}
