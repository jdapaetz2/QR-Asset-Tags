"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { QUIET_ZONE, SIZE_OPTIONS } from "@/lib/qr/constants";
import {
  LOGO_ALLOWED_TYPES,
  LOGO_MAX_PCT,
  LOGO_SAFE_PCT,
  RECOMMENDED_PHYSICAL_NOTE,
  SCAN_CHECKLIST,
  SCAN_DISCLAIMER,
  brandedWarnings,
} from "@/lib/qr/branded";

// Branded/logo exports always use error correction H (scanability over styling).
const BRANDED_EC = "H";

export type BrandedAsset = {
  id: string;
  asset_code: string;
  short_code: string;
  qrUrl: string;
};

const fieldClass =
  "rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

/**
 * Branded QR export (optional). A native multipart POST form to
 * /owner/production/qr.svg (the browser downloads the returned SVG); it is a
 * client component so it can show live scanability warnings. The server enforces
 * the hard rules (a logo forces error correction H, logo size is clamped).
 */
export function BrandedExportForm({
  assets,
  orgHasLogo,
  baseIsProd,
}: {
  assets: BrandedAsset[];
  orgHasLogo: boolean;
  baseIsProd: boolean;
}) {
  const [short, setShort] = useState(assets[0]?.short_code ?? "");
  const [size, setSize] = useState<string>("2.0");
  const [fg, setFg] = useState("#000000");
  const [bg, setBg] = useState("#ffffff");
  const [logoSource, setLogoSource] = useState<"none" | "org" | "upload">("none");
  const [logoPct, setLogoPct] = useState(LOGO_SAFE_PCT);
  const [hasFile, setHasFile] = useState(false);

  if (assets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No assets with a QR link yet — create QR links first.
      </p>
    );
  }

  const selected = assets.find((a) => a.short_code === short) ?? assets[0];
  const hasLogo =
    (logoSource === "org" && orgHasLogo) || (logoSource === "upload" && hasFile);

  const warnings = brandedWarnings({
    hasLogo,
    ec: BRANDED_EC,
    logoPct,
    sizeInches: size,
    baseIsProd,
    fg,
    bg,
  });

  return (
    <form
      method="post"
      action="/owner/production/qr.svg"
      encType="multipart/form-data"
      className="flex flex-col gap-4"
    >
      {/* `short` is the controlled select below (name="short"). */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Asset</span>
          <select
            name="short"
            value={short}
            onChange={(e) => setShort(e.target.value)}
            className={fieldClass}
          >
            {assets.map((a) => (
              <option key={a.id} value={a.short_code}>
                {a.asset_code}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Error correction</span>
          <input type="hidden" name="ec" value={BRANDED_EC} />
          <p className="py-1.5">H, forced for branded/logo exports</p>
          <span className="text-xs text-muted-foreground">
            Use H for dirty, scratched, or logo-bearing equipment tags.
          </span>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Size (in)</span>
          <select
            name="size"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className={fieldClass}
          >
            {SIZE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Foreground</span>
            <input
              type="color"
              name="fg"
              value={fg}
              onChange={(e) => setFg(e.target.value)}
              className="h-9 w-14 rounded-md border"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Background</span>
            <input
              type="color"
              name="bg"
              value={bg}
              onChange={(e) => setBg(e.target.value)}
              className="h-9 w-14 rounded-md border"
            />
          </label>
        </div>
      </div>

      {/* Logo */}
      <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Logo (optional)</legend>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Source</span>
          <select
            name="logoSource"
            value={logoSource}
            onChange={(e) =>
              setLogoSource(e.target.value as "none" | "org" | "upload")
            }
            className={fieldClass}
          >
            <option value="none">No logo</option>
            {orgHasLogo ? <option value="org">Organization logo</option> : null}
            <option value="upload">Upload a logo</option>
          </select>
        </label>

        {logoSource === "upload" ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Logo file (PNG/JPEG/WebP/SVG, 2 MB max)</span>
            <input
              type="file"
              name="logo"
              accept={LOGO_ALLOWED_TYPES.join(",")}
              onChange={(e) => setHasFile(Boolean(e.target.files?.length))}
              className={fieldClass}
            />
          </label>
        ) : null}

        {logoSource !== "none" ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">
              Logo size: {logoPct}% (≤{LOGO_SAFE_PCT}% recommended, ≤{LOGO_MAX_PCT}% max)
            </span>
            <input
              type="range"
              name="logoPct"
              min={5}
              max={LOGO_MAX_PCT}
              value={logoPct}
              onChange={(e) => setLogoPct(Number(e.target.value))}
            />
          </label>
        ) : (
          <input type="hidden" name="logoPct" value={logoPct} />
        )}
      </fieldset>

      {/* Scanability summary */}
      <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
        <p>
          Encoded URL:{" "}
          <code className="font-mono text-foreground">{selected.qrUrl}</code>
        </p>
        <p className="mt-1">
          Error correction: {BRANDED_EC} · Quiet zone: {QUIET_ZONE} modules · Logo:{" "}
          {hasLogo ? `${logoPct}%` : "none"}
        </p>
        <p className="mt-1">{RECOMMENDED_PHYSICAL_NOTE}</p>
      </div>

      {warnings.length > 0 ? (
        <ul
          role="alert"
          className="flex list-disc flex-col gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-5 py-2 text-xs text-muted-foreground"
        >
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <Button type="submit" className="self-start">
        Export branded SVG
      </Button>

      <div className="text-xs text-muted-foreground">
        <p className="font-medium">Before producing tags in bulk:</p>
        <ul className="mt-1 list-disc pl-5">
          {SCAN_CHECKLIST.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-2">{SCAN_DISCLAIMER}</p>
      </div>
    </form>
  );
}
