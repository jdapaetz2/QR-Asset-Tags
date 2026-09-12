"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { DocumentFormState } from "@/lib/documents/actions";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_VISIBILITIES,
  LINK_STATUSES,
} from "@/lib/documents/validate";
import { DOC_ALLOWED_TYPES, STORAGE_CLAIM_FIELD } from "@/lib/documents/upload";
import { withActionErrorRecovery } from "@/lib/forms/action-recovery";
import { FILE_SAVE_FAILED_MESSAGE, type PrepareSingleUploadAction } from "@/lib/storage/direct-upload";
import { uploadFileDirect } from "@/lib/storage/signed-upload-client";

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

function chosenFile(form: HTMLFormElement): File | null {
  const input = form.elements.namedItem("file");
  const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
  return file && file.size > 0 ? file : null;
}

/**
 * Add/edit a document. A hosted file (up to 50 MB) uploads straight to storage first (`prepareUpload`,
 * lib/storage/direct-upload.ts) and the save carries only its path, so no request body approaches Vercel's 4.5 MB
 * limit. Without a file — or without JavaScript — the form posts to the action as before.
 */
export function DocumentForm({
  action,
  prepareUpload,
  submitLabel,
  defaults,
  showUrl,
  showFile,
  showLinkStatus,
  cancelHref,
}: {
  action: DocumentFormAction;
  /** Required for `showFile` uploads with JavaScript. */
  prepareUpload?: PrepareSingleUploadAction;
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
  // After a direct upload the save is dispatched here, wrapped so an undeliverable request keeps the form.
  const recoveringAction = useMemo(() => withActionErrorRecovery(action, FILE_SAVE_FAILED_MESSAGE), [action]);
  const [directState, directFormAction, directPending] = useActionState<DocumentFormState, FormData>(
    recoveringAction,
    {}
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const busy = pending || directPending || uploading;
  const error = uploadError ?? directState.error ?? state.error;

  async function uploadThenSave(form: HTMLFormElement, file: File, prepare: PrepareSingleUploadAction) {
    setUploading(true);
    const result = await uploadFileDirect({ file, prepare });
    setUploading(false);
    if (!result.ok) {
      setUploadError(result.error);
      return;
    }
    const formData = new FormData(form);
    formData.delete("file");
    formData.set(STORAGE_CLAIM_FIELD, result.path);
    startTransition(() => directFormAction(formData));
  }

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        setUploadError(null);
        const file = showFile && prepareUpload ? chosenFile(e.currentTarget) : null;
        if (!file || !prepareUpload) return; // no file: the form posts to the action as before
        e.preventDefault();
        if (busy) return;
        const urlInput = e.currentTarget.elements.namedItem("url");
        if (urlInput instanceof HTMLInputElement && urlInput.value.trim()) {
          setUploadError("Provide either a link or a file, not both.");
          return;
        }
        void uploadThenSave(e.currentTarget, file, prepareUpload);
      }}
      className="flex max-w-xl flex-col gap-4"
    >
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
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
        <Button type="submit" disabled={busy}>
          {uploading ? "Uploading file…" : busy ? "Saving…" : submitLabel}
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
