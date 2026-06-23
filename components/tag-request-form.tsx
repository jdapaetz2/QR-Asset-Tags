"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { createTagRequest, type TagRequestState } from "@/lib/tags/actions";
import {
  MATERIAL_OPTIONS,
  MOUNTING_OPTIONS,
  TAG_SIZE_OPTIONS,
} from "@/lib/qr/production";

const selectClass =
  "rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

export type SelectableAsset = {
  id: string;
  asset_code: string;
  asset_name: string;
  category: string | null;
};

export function TagRequestForm({ assets }: { assets: SelectableAsset[] }) {
  const [state, formAction, pending] = useActionState<TagRequestState, FormData>(
    createTagRequest,
    {}
  );

  if (assets.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        No active assets to request tags for. Create or restore an asset first.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {/* Tag spec */}
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Material</span>
          <select name="material" defaultValue="" required className={selectClass}>
            <option value="" disabled>
              Choose…
            </option>
            {MATERIAL_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Mounting</span>
          <select name="mounting_method" defaultValue="" required className={selectClass}>
            <option value="" disabled>
              Choose…
            </option>
            {MOUNTING_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Tag size</span>
          <select name="tag_size" defaultValue="" required className={selectClass}>
            <option value="" disabled>
              Choose…
            </option>
            {TAG_SIZE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Quantity / notes (optional)</span>
        <input
          name="quantity_notes"
          placeholder="e.g. 2 tags per machine, spares for the trailer fleet"
          className={`${selectClass} w-full max-w-xl`}
        />
      </label>

      {/* Asset selection */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Assets ({assets.length} active)</legend>
        <div className="max-h-80 overflow-y-auto rounded-lg border">
          <table className="w-full text-sm">
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="select"
                        value={a.id}
                        className="size-4"
                      />
                      <span className="font-medium">{a.asset_code}</span>
                      <span className="text-muted-foreground">{a.asset_name}</span>
                      {a.category ? (
                        <span className="text-xs text-muted-foreground">
                          · {a.category}
                        </span>
                      ) : null}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Submitting…" : "Request tags"}
      </Button>
    </form>
  );
}
