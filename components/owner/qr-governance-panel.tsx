"use client";

import { useActionState, useState } from "react";

import { AssetTagChip } from "@/components/ui/asset-tag-chip";
import { ActionButton } from "@/components/action-button";
import { CopyableUrl } from "@/components/copyable-url";
import { buildPublicQrUrl } from "@/lib/qr/url";
import { normalizeCustomShortCode } from "@/lib/qr/custom-code";
import {
  ownerCreateQrLink,
  ownerSelectQrForProduction,
  ownerSetQrLinkStatus,
  type OwnerQrActionState,
} from "@/lib/qr/owner-actions";

export type OwnerQrLink = {
  id: string;
  shortCode: string;
  url: string;
  status: string;
  isProductionPrimary: boolean;
  /** short_code of the link this one replaced, if any (audit lineage). */
  supersedesCode: string | null;
  lastScannedAt: string | null;
  createdAt: string;
};

const REPLACEMENT_WARNING =
  "Creating a new code does not update existing physical tags. Keep the old code active unless you intend those tags to stop working.";
const DISABLE_WARNING =
  "Disabling this code will make every physical tag using it unavailable.";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

/**
 * Owner QR governance for a single asset. Create a custom/replacement code, select which active
 * link production encodes, and disable/enable codes — all owner-only server actions. URLs are the
 * server-computed `/t/{code}` (never the stored public_url). Creating a code never breaks an
 * existing tag; disabling is warned + confirmed; the production-primary code cannot be disabled.
 */
export function QrGovernancePanel({
  assetId,
  assetCode,
  baseUrl,
  links,
}: {
  assetId: string;
  assetCode: string;
  baseUrl: string;
  links: OwnerQrLink[];
}) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <AssetTagChip code={assetCode} />
      </div>

      {links.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">
          No QR code yet. Create one to generate a permanent scan URL.
        </p>
      ) : (
        <ul className="mb-4 flex flex-col gap-4">
          {links.map((link) => {
            const active = link.status === "active";
            return (
              <li
                key={link.id}
                className="flex flex-col gap-2 rounded-md border border-iron-200 p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{link.shortCode}</span>
                  <span
                    className={
                      active
                        ? "rounded-full border px-2 py-0.5 text-xs"
                        : "rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                    }
                  >
                    {link.status}
                  </span>
                  {link.isProductionPrimary ? (
                    <span className="rounded-full border border-brass-500/40 px-2 py-0.5 text-xs text-brass-600">
                      Production
                    </span>
                  ) : null}
                  {link.supersedesCode ? (
                    <span className="text-xs text-muted-foreground">
                      replaces <span className="font-mono">{link.supersedesCode}</span>
                    </span>
                  ) : null}
                </div>

                <CopyableUrl url={link.url} />

                <p className="text-xs text-muted-foreground">
                  Last scanned: {formatDate(link.lastScannedAt)} · Created:{" "}
                  {formatDate(link.createdAt)}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  {active && !link.isProductionPrimary ? (
                    <ActionButton
                      action={ownerSelectQrForProduction.bind(null, link.id)}
                      variant="outline"
                    >
                      Select for production
                    </ActionButton>
                  ) : null}
                  {active ? (
                    <ActionButton
                      action={ownerSetQrLinkStatus.bind(null, link.id, "disabled")}
                      variant="destructive"
                      confirm={DISABLE_WARNING}
                    >
                      Disable
                    </ActionButton>
                  ) : (
                    <ActionButton
                      action={ownerSetQrLinkStatus.bind(null, link.id, "active")}
                      variant="outline"
                    >
                      Enable
                    </ActionButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CreateCodeForm assetId={assetId} baseUrl={baseUrl} links={links} />
    </section>
  );
}

/**
 * Create a custom code, optionally recording which existing code it replaces. Shows the EXACT
 * computed URL live before submission. When a "replaces" target is chosen it is a rotation, so the
 * replacement warning + an explicit confirm apply. Leaving the code blank auto-generates one.
 */
function CreateCodeForm({
  assetId,
  baseUrl,
  links,
}: {
  assetId: string;
  baseUrl: string;
  links: OwnerQrLink[];
}) {
  const [state, formAction, pending] = useActionState<OwnerQrActionState, FormData>(
    ownerCreateQrLink.bind(null, assetId),
    {}
  );
  const [code, setCode] = useState("");
  const [supersedesId, setSupersedesId] = useState("");

  const normalized = normalizeCustomShortCode(code);
  const previewUrl = buildPublicQrUrl(baseUrl, normalized || "your-code");
  const isReplacement = supersedesId.length > 0;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (isReplacement && !window.confirm(REPLACEMENT_WARNING)) {
          e.preventDefault();
        }
      }}
      className="flex flex-col gap-2 border-t border-iron-200 pt-3"
    >
      <label className="text-xs font-medium text-muted-foreground" htmlFor={`code-${assetId}`}>
        Add a code (blank = auto-generate)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`code-${assetId}`}
          name="short_code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. excavator-17"
          autoComplete="off"
          spellCheck={false}
          className="min-w-48 flex-1 rounded-md border px-2 py-1 font-mono text-sm"
        />
        {links.length > 0 ? (
          <select
            name="supersedes_id"
            value={supersedesId}
            onChange={(e) => setSupersedesId(e.target.value)}
            className="rounded-md border px-2 py-1 text-sm"
            aria-label="Replaces (optional)"
          >
            <option value="">Replaces… (optional)</option>
            {links.map((l) => (
              <option key={l.id} value={l.id}>
                replaces {l.shortCode}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Creating…" : isReplacement ? "Create replacement" : "Create code"}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Will create: <span className="font-mono">{previewUrl}</span>
      </p>
      {isReplacement ? (
        <p className="text-xs text-warning">{REPLACEMENT_WARNING}</p>
      ) : null}
      {state.error ? (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
