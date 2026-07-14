import type { GallerySource } from "@/lib/inspections/photo-gallery";
import type { PhotoSource } from "@/lib/inspections/session-comparison";

const SOURCE_LABEL: Record<PhotoSource, string> = {
  outbound: "Outbound baseline",
  renter: "Renter return report",
  staff: "Staff return inspection",
};

/**
 * Responsive tiled photo gallery for session evidence (Phase 3C.5). Photos are grouped by source, then rendered
 * as fixed-aspect thumbnails in a responsive grid (2 cols mobile → 3 tablet → 4 desktop) rather than one full-
 * width image per row. Each tile shows its slot caption(s) — a path used for multiple slots is deduped upstream
 * (`galleryBySource`) and lists every caption. Clicking opens the signed image in a new tab (no lightbox exists);
 * Download is preserved. Private media stays behind short-lived signed URLs; raw storage paths are never exposed.
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
          <ul className="evidence-gallery-grid grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {group.tiles.map((tile) => {
              const url = signedByPath.get(tile.path) ?? null;
              const caption = tile.labels.join(" · ");
              return (
                <li key={tile.path} className="flex flex-col gap-1">
                  {url ? (
                    <>
                      <a href={url} target="_blank" rel="noopener noreferrer" title={caption}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={caption}
                          className="aspect-square w-full rounded-md border object-cover"
                        />
                      </a>
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-words text-xs text-muted-foreground">{caption}</span>
                        <a
                          href={url}
                          download
                          className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:underline print:hidden"
                        >
                          Download
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                      Photo unavailable
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
