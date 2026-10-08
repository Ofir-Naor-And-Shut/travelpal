import { useMemo } from "react";
import PlaceSearchInput from "./PlaceSearchInput.jsx";
import { useI18n } from "../lib/i18n.js";

/** Google types that mean "somewhere you sleep". */
const STAY_TYPES = new Set(["lodging", "campground", "rv_park"]);

/**
 * Prefer places you can stay in, but never show an empty list.
 *
 * Asking Google to filter by `lodging` in the *request* looked like the
 * obvious approach and was wrong twice over: it made Google ignore the
 * location bias entirely, and combined with strict bounds it returned nothing
 * at all. Filtering here instead keeps the search local and still sorts the
 * hotels to the front. The fallback matters because small guesthouses are
 * often tagged only `point_of_interest`, and hiding someone's actual booking
 * would be worse than showing a bar alongside it.
 */
const preferStays = (rows) => {
  const stays = rows.filter((r) => r.types?.some((t) => STAY_TYPES.has(t)));
  return stays.length > 0 ? stays : rows;
};

/**
 * The accommodation name field, with a place lookup behind it.
 *
 * Shared by the destination's default stay and a night's override, which are
 * the same card in two places. Typing freely still works — a guesthouse no
 * index has heard of is a perfectly good name to write down — but picking a
 * suggestion also fills the address, which is the whole point of the search.
 *
 * Results are confined to the destination, so "hilton" means the one in
 * *this* city. Without a Google key the lookup falls back to OpenStreetMap,
 * which is bounded to the same box, so that path stays local too.
 */
export default function HotelSearchInput({ name, onPatch, lat, lng }) {
  const { t } = useI18n();

  // Same reason as LODGING: a new object each render would retrigger the
  // search effect, which takes `center` as a dependency.
  const center = useMemo(
    () => (lat || lng ? { lat, lng } : undefined),
    [lat, lng],
  );

  const value = useMemo(() => ({ name }), [name]);

  return (
    <PlaceSearchInput
      value={value}
      onChange={(place) =>
        onPatch({
          name: place.name,
          // Absent when the text was typed rather than picked, so a hand
          // written address survives further edits to the name.
          ...(place.address ? { address: place.address } : {}),
        })
      }
      center={center}
      // Confine results to the destination: a hotel for this stop is never
      // on another continent, whatever the name happens to match.
      strictBounds
      // Wider than the default bias radius: a destination can be a whole
      // island or province, and with strict bounds too small a circle hides
      // a real booking entirely rather than merely ranking it lower.
      radiusMeters={60000}
      refine={preferStays}
      placeholder={t("sleeping.placeholder")}
      label={t("dayStay.name")}
      className="mt-1"
    />
  );
}
