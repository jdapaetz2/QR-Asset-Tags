"use client";

import { useState } from "react";

/**
 * Compact asset thumbnail for list rows. Presentational only — renders the existing
 * cover_image_url, falling back to a clean muted placeholder when the URL is missing
 * or the image fails to load. Client component solely for the onError fallback so a
 * broken external image never shows a broken-image glyph or shifts the layout.
 */
export function AssetThumb({
  src,
  alt,
}: {
  src: string | null;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground"
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="size-10 shrink-0 rounded-md border bg-background object-cover"
    />
  );
}
