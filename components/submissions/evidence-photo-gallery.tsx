import type { GallerySource } from "@/lib/inspections/photo-gallery";
import type { PhotoSource } from "@/lib/inspections/session-comparison";
import { PhotoTileGrid } from "@/components/submissions/photo-tile-grid";

const SOURCE_LABEL: Record<PhotoSource, string> = {
  outbound: "Outbound baseline",
  renter: "Renter return checklist",
  staff: "Staff return checklist",
};

/**
 * Aggregate "Photos by source" gallery for session evidence (Phase 3C.5). Groups deduped tiles by source and
 * renders each with the shared {@link PhotoTileGrid}. The same signed URLs are reused by each inspection's own
 * photo section (Phase 3C.6) — no extra signing or query.
 */
export function EvidencePhotoGallery({
  sources,
  signedByPath,
}: {
  sources: GallerySource[];
  signedByPath: Map<string, string | null>;
}) {
  if (sources.length === 0) {
    return <p className="text-sm text-muted-foreground">No photos were attached to this rental.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {sources.map((group) => (
        <div key={group.source} className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {SOURCE_LABEL[group.source]}
          </p>
          <PhotoTileGrid tiles={group.tiles} signedByPath={signedByPath} />
        </div>
      ))}
    </div>
  );
}
