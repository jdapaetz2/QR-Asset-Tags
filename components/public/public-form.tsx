"use client";

import { startTransition, useActionState, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { PublicFormState } from "@/lib/forms/submit";
import { HONEYPOT_FIELD, IDEMPOTENCY_FIELD } from "@/lib/forms/validate";
import { MAX_FILES } from "@/lib/forms/media";
import { EVIDENCE_PHOTO, PHOTO_ACCEPT } from "@/lib/media/photo-policy";
import { usePhotoInput } from "@/lib/media/consumer-photo/use-photo-input";
import { PhotoInputStatus } from "@/components/photo-input-status";
import { withActionErrorRecovery } from "@/lib/forms/action-recovery";
import { MEDIA_PATHS_FIELD, type PrepareUploadsAction } from "@/lib/forms/upload-contract";
import { collectSelectedPhotos, stripSelectedPhotos, uploadPhotosDirect } from "@/lib/forms/upload-client";

export const fieldClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

type PublicFormAction = (
  state: PublicFormState,
  formData: FormData
) => Promise<PublicFormState>;

/**
 * Shared public-form shell: name + contact + a form-specific section
 * (`children`) + optional media + honeypot + submit. Used by the damage and
 * support forms so layout and anti-abuse stay consistent.
 *
 * With JavaScript, photos upload straight to storage first (`prepareUploads`, lib/forms/upload-contract.ts) and the
 * submit carries only text plus the uploaded paths — so no request body approaches Vercel's 4.5 MB limit. Without
 * JavaScript the native form posts files through the server action.
 */
export function PublicForm({
  action,
  prepareUploads,
  submitLabel,
  requireName = false,
  contactNote,
  children,
}: {
  action: PublicFormAction;
  prepareUploads: PrepareUploadsAction;
  submitLabel: string;
  requireName?: boolean;
  contactNote: string;
  children?: React.ReactNode;
}) {
  // No-JavaScript path: the plain server action, so a submit before hydration still posts natively.
  const [serverState, serverFormAction, serverPending] = useActionState<PublicFormState, FormData>(
    action,
    {}
  );
  // JavaScript path: the same action, wrapped so an undeliverable request keeps the form and what was entered.
  const recoveringAction = useMemo(() => withActionErrorRecovery(action), [action]);
  const [state, formAction, pending] = useActionState<PublicFormState, FormData>(recoveringAction, {});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Mint one idempotency token per mount (client-only, so it never mismatches SSR). If a rapid
  // double-submit reaches the server twice, both carry this same token → the second is a PK no-op.
  const [idempotencyKey, setIdempotencyKey] = useState("");
  useEffect(() => {
    // One-shot, client-only token. Set in a mount effect (not lazy init) so SSR and the first client
    // render both produce an empty value — no hydration mismatch — then the real UUID fills in.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  // Picked photos are prepared on the device first (HEIC, AVIF and very large photos become JPEG).
  const photos = usePhotoInput(EVIDENCE_PHOTO);
  const busy = pending || serverPending || progress !== null || photos.preparing !== null;
  const error = uploadError ?? state.error ?? serverState.error;

  async function submit(form: HTMLFormElement) {
    const formData = new FormData(form);
    setUploadError(null);
    const photos = collectSelectedPhotos(formData);
    if (photos.length > 0) {
      setProgress({ done: 0, total: photos.length });
      const result = await uploadPhotosDirect({
        photos,
        submissionId: idempotencyKey || crypto.randomUUID(),
        honeypot: String(formData.get(HONEYPOT_FIELD) ?? ""),
        prepare: prepareUploads,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setProgress(null);
      if (!result.ok) {
        setUploadError(result.error);
        return;
      }
      // The server's id owns the uploaded prefix; keep it for any retry from this page.
      if (result.submissionId !== idempotencyKey) setIdempotencyKey(result.submissionId);
      stripSelectedPhotos(formData);
      formData.set(IDEMPOTENCY_FIELD, result.submissionId);
      formData.set(MEDIA_PATHS_FIELD, JSON.stringify(result.claims));
    }
    startTransition(() => formAction(formData));
  }

  return (
    <form
      // Kept so a submit that happens before hydration (or without JavaScript) still posts to the server action.
      action={serverFormAction}
      onSubmit={(e) => {
        // React resets a `<form action>` after the action completes — even when it returned an error — which wiped
        // everything the renter typed. Dispatching the same action in a transition from onSubmit skips that reset.
        e.preventDefault();
        if (busy) return;
        void submit(e.currentTarget);
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name={IDEMPOTENCY_FIELD} value={idempotencyKey} readOnly />
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Your name{requireName ? " *" : ""}</span>
        <input
          className={fieldClass}
          name="name"
          autoComplete="name"
          required={requireName}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input className={fieldClass} type="email" name="email" autoComplete="email" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Phone</span>
          <input className={fieldClass} type="tel" name="phone" autoComplete="tel" />
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{contactNote}</p>

      {children}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Photos (optional, up to {MAX_FILES})</span>
        <input
          className={fieldClass}
          type="file"
          name="media"
          accept={PHOTO_ACCEPT}
          multiple
          onChange={photos.onChange}
        />
        <span className="text-xs text-muted-foreground">
          Photos are optional but helpful, especially for visible damage.
        </span>
        <PhotoInputStatus preparing={photos.preparing} problems={photos.problems} onCancel={photos.cancel} />
        <noscript>
          <span className="text-xs text-muted-foreground">
            With JavaScript turned off, photos must be JPG, PNG or WebP and total less than 4 MB.
          </span>
        </noscript>
      </label>

      {/* Honeypot: hidden from humans; bots that fill it are silently dropped. */}
      <div aria-hidden className="hidden">
        <label>
          Company website
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Button type="submit" disabled={busy}>
        {progress
          ? `Uploading photos ${progress.done} of ${progress.total}…`
          : photos.preparing
            ? "Preparing photos…"
            : pending || serverPending
              ? "Submitting…"
              : submitLabel}
      </Button>
    </form>
  );
}
