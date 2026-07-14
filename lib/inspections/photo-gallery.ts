/**
 * Deduplicated photo gallery model for the session-evidence "Photos by source" view (Phase 3C.5). Pure — no I/O.
 *
 * `photoSlotsBySource` groups by source THEN slot, so one storage path assigned to multiple slots (or repeated)
 * appears in several groups. This collapses each source to one tile per UNIQUE path, merging every slot label
 * that references it — so a repeated image renders once with all its captions instead of filling a column.
 */
import type { PhotoSlotGroup, PhotoSource } from "@/lib/inspections/session-comparison";

export type GalleryTile = { path: string; labels: string[] };
export type GallerySource = { source: PhotoSource; tiles: GalleryTile[] };

const SOURCE_ORDER: PhotoSource[] = ["outbound", "renter", "staff"];

export function galleryBySource(groups: PhotoSlotGroup[]): GallerySource[] {
  // source → (path → ordered unique labels)
  const bySource = new Map<PhotoSource, Map<string, string[]>>();
  for (const group of groups) {
    let pathMap = bySource.get(group.source);
    if (!pathMap) {
      pathMap = new Map();
      bySource.set(group.source, pathMap);
    }
    for (const path of group.paths) {
      const labels = pathMap.get(path) ?? [];
      if (!labels.includes(group.label)) labels.push(group.label);
      pathMap.set(path, labels);
    }
  }

  const out: GallerySource[] = [];
  for (const source of SOURCE_ORDER) {
    const pathMap = bySource.get(source);
    if (!pathMap || pathMap.size === 0) continue;
    out.push({
      source,
      tiles: [...pathMap.entries()].map(([path, labels]) => ({ path, labels })),
    });
  }
  return out;
}

/** Total number of unique photo tiles across all sources (drives the disclosure summary count). */
export function galleryPhotoCount(sources: GallerySource[]): number {
  return sources.reduce((n, s) => n + s.tiles.length, 0);
}

/**
 * Deduped tiles for a SINGLE source (Phase 3C.6) — used to render each inspection's own photo grid inside its
 * evidence disclosure, reusing the same signed URLs as the aggregate gallery (no extra signing/query). Merges
 * every slot label for a repeated path so one image shows once with all its captions.
 */
export function tilesForSource(groups: PhotoSlotGroup[], source: PhotoSource): GalleryTile[] {
  const pathLabels = new Map<string, string[]>();
  for (const group of groups) {
    if (group.source !== source) continue;
    for (const path of group.paths) {
      const labels = pathLabels.get(path) ?? [];
      if (!labels.includes(group.label)) labels.push(group.label);
      pathLabels.set(path, labels);
    }
  }
  return [...pathLabels.entries()].map(([path, labels]) => ({ path, labels }));
}
