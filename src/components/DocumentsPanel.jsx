import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, Paperclip, Trash2, Upload, X } from "lucide-react";
import {
  ICON_FOR,
  MAX_FILE_BYTES,
  deleteDocEverywhere,
  downloadDoc,
  formatBytes,
  kindOf,
  objectUrlFor,
  saveFile,
} from "../lib/docs.js";
import { uploadDocToCloud } from "../lib/documentStorage.js";
import { setLocalOnly } from "../lib/auth.js";
import { hasSupabase } from "../lib/supabase.js";
import {
  getActiveTrip,
  upsertTripNow,
  useCloudMode,
  useTripRole,
} from "../lib/store.js";
import { useI18n } from "../lib/i18n.js";

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Generic uploader. The caller owns where metadata is stored — this component
 * only writes the bytes to IndexedDB and hands back the descriptor.
 */
export default function DocumentsPanel({
  docs = [],
  onAdd,
  onRemove,
  label,
  hint,
  icon: HeadingIcon = Paperclip,
  compact = false,
}) {
  const { t } = useI18n();
  const cloudMode = useCloudMode();
  const role = useTripRole(getActiveTrip().id);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);

  const heading = label ?? t("docs.title");
  const dropHint = hint ?? t("docs.dropHint");

  const ingest = useCallback(
    async (fileList) => {
      const files = Array.from(fileList ?? []);
      if (!files.length) return;
      setError("");

      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          setError(
            t("docs.tooBig", {
              name: file.name,
              size: formatBytes(file.size),
              max: formatBytes(MAX_FILE_BYTES),
            }),
          );
          continue;
        }
        const id = uid();
        try {
          await saveFile(id, file);
        } catch {
          setError(t("docs.storeFailed", { name: file.name }));
          continue;
        }
        const meta = {
          id,
          name: file.name,
          type: file.type,
          size: file.size,
          addedAt: new Date().toISOString(),
        };
        if (cloudMode) {
          try {
            const activeTrip = getActiveTrip();
            // A just-created trip's row can still be in flight to Supabase
            // (createTrip doesn't await it, for instant local-first UI) —
            // this upsert guarantees it exists before Storage's RLS check
            // looks it up by id, rather than racing it. Owner-only: an editor
            // must never upsert (it would reassign owner_id), but an
            // editor's shared trip always already exists remotely anyway.
            if (role === "owner") await upsertTripNow(activeTrip);
            meta.storagePath = await uploadDocToCloud(activeTrip.id, id, file);
          } catch (err) {
            console.error("Cloud sync: failed to upload document", err);
            setError(t("docs.syncFailed", { name: file.name }));
          }
        }
        onAdd(meta);
      }
    },
    [cloudMode, role, onAdd, t],
  );

  async function handleDelete(doc) {
    onRemove(doc);
    await deleteDocEverywhere(doc);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="col-head">
          <HeadingIcon size={13} /> {heading}
        </h4>
        <span className="text-xs text-muted">
          {docs.length || t("docs.none")}{" "}
          {docs.length === 1 ? t("docs.file") : t("docs.files")}
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          ingest(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center transition ${
          compact ? "px-3 py-3" : "px-4 py-5"
        } ${dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-surface"}`}
      >
        {!compact && <Upload size={18} className="text-subtle" />}
        <p className="text-xs text-muted">
          {dropHint}{" "}
          <button
            type="button"
            className="font-medium text-fg underline underline-offset-2"
            onClick={() => inputRef.current?.click()}
          >
            {t("docs.browse")}
          </button>
        </p>
        {!compact && (
          <p className="text-[11px] text-subtle">
            {t("docs.privacy", { size: formatBytes(MAX_FILE_BYTES) })}
          </p>
        )}
        {hasSupabase && !cloudMode && (
          <p className="text-[11px] text-subtle">
            {t("docs.localOnlyNote")}{" "}
            <button
              type="button"
              className="font-medium text-fg underline underline-offset-2"
              onClick={() => setLocalOnly(false)}
            >
              {t("docs.signInLink")}
            </button>
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            ingest(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-fg">
          {error}
        </p>
      )}

      {docs.length > 0 && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {docs.map((doc) => {
            const kind = kindOf(doc.type, doc.name);
            const Icon = ICON_FOR[kind];
            return (
              <li
                key={doc.id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-fg">
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">
                    {doc.name}
                  </span>
                  <span className="tabular block text-xs text-muted">
                    {formatBytes(doc.size)}
                  </span>
                </span>

                {kind !== "file" && (
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1"
                    onClick={() => setPreview(doc)}
                    aria-label={t("docs.preview", { name: doc.name })}
                  >
                    <Eye size={15} />
                  </button>
                )}
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1"
                  onClick={() => downloadDoc(doc.id, doc.name, doc.storagePath)}
                  aria-label={t("docs.download", { name: doc.name })}
                >
                  <Download size={15} />
                </button>
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1 hover:!bg-accent-soft"
                  onClick={() => handleDelete(doc)}
                  aria-label={t("docs.delete", { name: doc.name })}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {preview && (
        <PreviewModal doc={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

export function PreviewModal({ doc, onClose }) {
  const { t } = useI18n();
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let revoked = false;
    let current = null;

    objectUrlFor(doc.id, doc.storagePath).then((next) => {
      // The modal may have closed while we were reading from IndexedDB.
      if (revoked) {
        if (next) URL.revokeObjectURL(next);
        return;
      }
      current = next;
      setUrl(next);
    });

    return () => {
      revoked = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [doc.id, doc.storagePath]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const kind = kindOf(doc.type, doc.name);

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center bg-scrim p-4"
      role="dialog"
      aria-modal="true"
      aria-label={doc.name}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-card bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
          <p className="truncate text-sm font-semibold">{doc.name}</p>
          <button
            type="button"
            className="btn-ghost !px-2"
            onClick={onClose}
            aria-label={t("docs.closePreview")}
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-raised p-3">
          {!url ? (
            <p className="p-8 text-center text-sm text-muted">
              {t("docs.loading")}
            </p>
          ) : kind === "image" ? (
            <img
              src={url}
              alt={doc.name}
              className="mx-auto max-h-[70vh] rounded-lg object-contain"
            />
          ) : (
            <iframe
              src={url}
              title={doc.name}
              className="h-[70vh] w-full rounded-lg border-0 bg-surface"
            />
          )}
        </div>
      </div>
    </div>
  );
}
