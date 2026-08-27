import { useEffect, useState } from "react";
import { objectUrlFor } from "../lib/docs.js";

/**
 * A trip's picture, in order of preference: an uploaded cover (a blob in
 * IndexedDB/Storage), then a Places photo URL, then the emoji.
 *
 * `cover` fills the parent (the picker card banner); otherwise it's a small
 * rounded thumbnail sized by `size`. A remote photo that fails to load
 * (Google's links can lapse) falls back to the emoji rather than a broken image.
 */
export default function TripAvatar({
  trip,
  size = 20,
  cover = false,
  emojiClassName = "",
  className = "",
  onUrl,
}) {
  const [failedUrl, setFailedUrl] = useState("");
  const [blobUrl, setBlobUrl] = useState("");
  const coverDoc = trip?.coverDoc;

  // Resolve an uploaded cover to an object URL, revoking it when the doc
  // changes or the component unmounts so the blob isn't pinned in memory.
  useEffect(() => {
    let alive = true;
    let created = "";
    if (coverDoc?.id) {
      objectUrlFor(coverDoc.id, coverDoc.storagePath).then((url) => {
        if (!alive) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        created = url || "";
        setBlobUrl(url || "");
      });
    } else {
      setBlobUrl("");
    }
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [coverDoc?.id, coverDoc?.storagePath]);

  const remote =
    trip?.photoUrl && trip.photoUrl !== failedUrl ? trip.photoUrl : "";
  const url = blobUrl || remote;

  // Report the actually-shown URL (a live object URL for an uploaded cover, or
  // the remote photo) so a parent can preview exactly what's displayed.
  useEffect(() => {
    onUrl?.(url);
  }, [url, onUrl]);

  if (url) {
    const onError = () => {
      if (!blobUrl) setFailedUrl(trip.photoUrl);
    };
    if (cover) {
      return (
        <img
          src={url}
          alt=""
          aria-hidden
          onError={onError}
          className={`h-full w-full object-cover ${className}`}
        />
      );
    }
    return (
      <img
        src={url}
        alt=""
        aria-hidden
        onError={onError}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-md object-cover ${className}`}
      />
    );
  }

  return (
    <span aria-hidden className={emojiClassName}>
      {trip?.emoji}
    </span>
  );
}
