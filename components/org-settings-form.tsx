"use client";

import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { OrgSettingsState } from "@/lib/org/actions";
import { LOGO_ALLOWED_TYPES } from "@/lib/org/logo";
import { isHexColor, safeBrandColor } from "@/lib/public/brand";

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

type OrgSettingsAction = (
  state: OrgSettingsState,
  formData: FormData
) => Promise<OrgSettingsState>;

export type OrgSettingsDefaults = {
  name: string | null;
  support_phone: string | null;
  support_email: string | null;
  website_url: string | null;
  primary_color: string | null;
  logo_url: string | null;
};

export function OrgSettingsForm({
  action,
  org,
  sampleHref,
  submitLabel = "Save settings",
}: {
  action: OrgSettingsAction;
  org: OrgSettingsDefaults;
  /** A public /t/[shortCode] link to open a sample scan page, or null. */
  sampleHref: string | null;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<OrgSettingsState, FormData>(
    action,
    {}
  );
  const [name, setName] = useState(org.name ?? "");
  const [phone, setPhone] = useState(org.support_phone ?? "");
  const [email, setEmail] = useState(org.support_email ?? "");
  const [color, setColor] = useState(org.primary_color ?? "");
  const [logo, setLogo] = useState(org.logo_url ?? "");
  const [logoFilePreview, setLogoFilePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setLogoFilePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }
  function removeLogo() {
    setLogo("");
    setLogoFilePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  const logoPreview = logoFilePreview ?? (logo.trim() || null);
  const swatch = safeBrandColor(color);
  const colorPickerValue = isHexColor(color) ? color : "#1d4ed8";

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {/* Organization */}
      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Organization</legend>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Name<span className="text-destructive"> *</span>
          </span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Website</span>
          <input
            name="website_url"
            type="url"
            defaultValue={org.website_url ?? ""}
            placeholder="https://…"
            className={inputClass}
          />
        </label>
      </fieldset>

      {/* Public scanner branding */}
      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Public scanner branding</legend>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Primary color</span>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={colorPickerValue}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Pick primary color"
              className="h-9 w-12 rounded-md border"
            />
            <input
              name="primary_color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#1d4ed8"
              className={`${inputClass} max-w-[10rem] font-mono`}
            />
            <span
              className="size-9 rounded-md border"
              style={{ backgroundColor: swatch }}
              aria-hidden
            />
          </div>
          <span className="text-xs text-muted-foreground">
            Used as an accent color on public QR scan pages. Strict #RRGGBB hex.
          </span>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium">Logo</span>
          <p className="text-xs text-muted-foreground">
            Your logo is public and appears on QR scan pages.
          </p>
          {logoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoPreview}
              alt="Logo preview"
              className="size-16 rounded-md border bg-background object-contain"
            />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
              No logo
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            name="file"
            accept={LOGO_ALLOWED_TYPES.join(",")}
            onChange={onLogoFileChange}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
          />
          <span className="text-xs text-muted-foreground">
            JPG, PNG, or WebP · up to 2 MB. Uploads when you save.
          </span>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              …or paste an image URL / path (a chosen file replaces it on save)
            </span>
            <input
              name="logo_url"
              type="text"
              value={logo}
              onChange={(e) => setLogo(e.target.value)}
              placeholder="https://… or /demo-assets/…"
              className={inputClass}
            />
          </label>
          {logo.trim() || logoFilePreview ? (
            <Button
              type="button"
              variant="outline"
              onClick={removeLogo}
              className="self-start"
            >
              Remove logo
            </Button>
          ) : null}
        </div>
      </fieldset>

      {/* Support contact */}
      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Support contact</legend>
        <p className="text-xs text-muted-foreground">
          Shown on scan pages for assets without their own override.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Phone</span>
            <input
              name="support_phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Email</span>
            <input
              name="support_email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      {/* Preview */}
      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">Preview</h2>
        <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: swatch }} />
        <div className="flex items-center gap-3">
          {logoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoPreview}
              alt=""
              className="size-10 rounded-md border bg-background object-contain"
            />
          ) : (
            <div
              className="flex size-10 items-center justify-center rounded-md text-sm font-semibold"
              style={{ backgroundColor: swatch, color: "#ffffff" }}
            >
              {(name || "R").charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-sm font-medium">{name || "Your organization"}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {phone || email
            ? [phone && `Call ${phone}`, email && `Email ${email}`]
                .filter(Boolean)
                .join(" · ")
            : "No support contact set"}
        </p>
        {sampleHref ? (
          <a
            href={sampleHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline-offset-4 hover:underline"
          >
            Open a sample scan page ↗
          </a>
        ) : null}
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
