"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  uploadAssetCover,
  clearAssetCover,
  type CoverFormState,
} from "@/lib/assets/cover-actions";
import { COVER_ALLOWED_TYPES } from "@/lib/assets/cover";

/**
 * Asset cover-image management: upload a public image (jpg/png/webp, ≤5 MB),
 * preview the current one, and remove it. Copy makes clear the image is public.
 * The URL text field on the asset form remains as a fallback.
 */
export function CoverImageSection({
  assetId,
  coverUrl,
}: {
  assetId: string;
  coverUrl: string | null;
}) {
  const [uploadState, uploadAction, uploading] = useActionState<
    CoverFormState,
    FormData
  >(uploadAssetCover.bind(null, assetId), {});
  const [clearState, clearAction, clearing] = useActionState<
    CoverFormState,
    FormData
  >(clearAssetCover.bind(null, assetId), {});

  const error = uploadState.error ?? clearState.error;

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div>
        <h2 className="font-medium">Cover image</h2>
        <p className="text-sm text-muted-foreground">
          Cover images are public and will appear on the QR scan page.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt="Current cover"
          className="aspect-video w-full max-w-xs rounded-md border object-cover"
        />
      ) : (
        <div className="flex aspect-video w-full max-w-xs items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
          No cover image yet
        </div>
      )}

      <form
        action={uploadAction}
        encType="multipart/form-data"
        className="flex flex-col gap-2"
      >
        <input
          type="file"
          name="file"
          accept={COVER_ALLOWED_TYPES.join(",")}
          required
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
        />
        <span className="text-xs text-muted-foreground">
          JPG, PNG, or WebP · up to 5 MB.
        </span>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={uploading}>
            {uploading ? "Uploading…" : "Upload cover image"}
          </Button>
        </div>
      </form>

      {coverUrl ? (
        <form action={clearAction}>
          <Button type="submit" variant="outline" disabled={clearing}>
            {clearing ? "Removing…" : "Remove cover image"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
