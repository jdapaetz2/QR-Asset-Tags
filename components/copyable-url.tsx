"use client";

import { useState } from "react";

/** Shows a URL with a copy-to-clipboard button. The URL is computed server-side. */
export function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context); ignore.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 truncate rounded-md border bg-muted px-2 py-1 text-xs">
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-md border px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
