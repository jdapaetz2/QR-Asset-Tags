"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { DocumentFormState } from "@/lib/documents/actions";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_VISIBILITIES,
  LINK_STATUSES,
} from "@/lib/documents/validate";
import { DOC_ALLOWED_TYPES } from "@/lib/documents/upload";

const fieldClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

type DocumentFormAction = (
  state: DocumentFormState,
  formData: FormData
) => Promise<DocumentFormState>;

export type DocumentDefaults = {
  title?: string | null;
  document_type?: string | null;
  visibility?: string | null;
  url?: string | null;
  link_status?: string | null;
};

export function DocumentForm({
  action,
  submitLabel,
  defaults,
  showUrl,
  showFile,
  showLinkStatus,
  cancelHref,
}: {
  action: DocumentFormAction;
  submitLabel: string;
  defaults?: DocumentDefaults;
  showUrl: boolean;
  showFile: boolean;
  showLinkStatus: boolean;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<DocumentFormState, FormData>(
    action,
    {}
  );

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Title *</span>
        <input
          className={fieldClass}
          name="title"
          defaultValue={defaults?.title ?? undefined}
          required
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Type</span>
          <select
            className={fieldClass}
            name="document_type"
            defaultValue={defaults?.document_type ?? "manual"}
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Visibility</span>
          <select
            className={fieldClass}
            name="visibility"
            defaultValue={defaults?.visibility ?? "private"}
          >
            {DOCUMENT_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {v[0].toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showLinkStatus ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Link status</span>
          <select
            className={fieldClass}
            name="link_status"
            defaultValue={defaults?.link_status ?? "unknown"}
          >
            {LINK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showUrl ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Link URL</span>
          <input
            className={fieldClass}
            type="url"
            name="url"
            inputMode="url"
            placeholder="https://…"
            defaultValue={defaults?.url ?? undefined}
          />
        </label>
      ) : null}

      {showFile ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Or upload a file (PDF, image, or video — 50 MB max)</span>
          <input
            className={fieldClass}
            type="file"
            name="file"
            accept={DOC_ALLOWED_TYPES.join(",")}
          />
          <span className="text-xs text-muted-foreground">
            Provide a link or a file — not both.
          </span>
        </label>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link
          href={cancelHref}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
