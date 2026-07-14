import type { GalleryTile } from "@/lib/inspections/photo-gallery";

/**
 * Responsive tiled photo grid (Phase 3C.6) — the shared building block for both the per-inspection photo section
 * and the aggregate "Photos by source" gallery on the session-evidence page. Fixed-aspect thumbnails (2 cols
 * mobile → 3 tablet → 4 desktop); each tile lists its slot caption(s). Clicking opens the SIGNED image in a new
 * tab (no lightbox exists); Download preserved. `signedByPath` maps each path to a short-lived signed URL built
 * ONCE by the page, so rendering the same tile here and in the aggregate never re-signs. Raw paths never exposed.
 */
export function PhotoTileGrid({
  tiles,
  signedByPath,
  emptyText = "No photos.",
}: {
  tiles: GalleryTile[];
  signedByPath: Map<string, string | null>;
  emptyText?: string;
}) {
  if (tiles.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className="evidence-gallery-grid grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map((tile) => {
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
  );
}
