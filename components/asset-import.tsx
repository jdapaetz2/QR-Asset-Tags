"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { importAssets, type ImportState } from "@/lib/onboarding/actions";
import { parseImportRows, type ParsedImport } from "@/lib/onboarding/import";
import {
  detectNewCategories,
  normalizeCategoryKey,
} from "@/lib/assets/categories";

export function AssetImport({
  orgTemplateKeys = [],
  orgCategories = [],
}: {
  /** This org's custom template keys, so the preview matches server resolution. */
  orgTemplateKeys?: string[];
  /** This org's existing categories, to warn about new ones in the upload. */
  orgCategories?: string[];
}) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(
    importAssets,
    {}
  );
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [fileName, setFileName] = useState("");
  const [wantChange, setWantChange] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setWantChange(false);
    const file = e.target.files?.[0];
    if (!file) {
      setCsvText("");
      setParsed(null);
      setFileName("");
      return;
    }
    const text = await file.text();
    setCsvText(text);
    setParsed(parseImportRows(text, new Set(orgTemplateKeys)));
    setFileName(file.name);
  }

  // Result view after a completed import.
  if (state.summary) {
    const s = state.summary;
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-medium">Import complete</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
            <li>Assets created: {s.created}</li>
            <li>Rows skipped: {s.skipped}</li>
            <li>Equipment pages created: {s.pagesCreated}</li>
            <li>QR links created: {s.qrCreated}</li>
            {s.newCategories.length > 0 ? (
              <li>New categories added: {s.newCategories.join(", ")}</li>
            ) : null}
          </ul>
          {s.rowErrors.length > 0 ? (
            <div className="mt-3 text-sm">
              <p className="font-medium text-destructive">Skipped rows</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {s.rowErrors.map((e) => (
                  <li key={e.row}>
                    Row {e.row} ({e.assetCode || "—"}): {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <Link
          href="/dashboard/assets"
          className="inline-flex w-fit rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
        >
          Back to assets
        </Link>
      </div>
    );
  }

  const validCount = parsed
    ? parsed.rows.filter((r) => r.errors.length === 0).length
    : 0;
  const errorCount = parsed
    ? parsed.rows.filter((r) => r.errors.length > 0).length
    : 0;
  // Categories in the upload that don't exist yet — these gate the import.
  const validRows = parsed ? parsed.rows.filter((r) => r.errors.length === 0) : [];
  const newCategories = detectNewCategories(
    validRows.map((r) => r.asset?.category ?? null),
    orgCategories
  );
  // Affected row numbers per new category (for a clear, specific warning).
  const newCategoryRows = newCategories.map((category) => {
    const key = normalizeCategoryKey(category);
    const rows = validRows
      .filter((r) => r.asset?.category && normalizeCategoryKey(r.asset.category) === key)
      .map((r) => r.index);
    return { category, rows };
  });
  const hasNewCategories = newCategories.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
        />
      </label>

      {parsed ? (
        <>
          {parsed.fileWarnings.length > 0 ? (
            <ul className="flex list-disc flex-col gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-5 py-2 text-xs text-muted-foreground">
              {parsed.fileWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          <p className="text-sm text-muted-foreground">
            {fileName}: {parsed.rows.length} row
            {parsed.rows.length === 1 ? "" : "s"} · {validCount} ready ·{" "}
            {errorCount} with errors
          </p>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Template</th>
                  <th className="px-3 py-2 font-medium">QR</th>
                  <th className="px-3 py-2 font-medium">Publish</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((row) => (
                  <tr key={row.index} className="border-b align-top last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{row.index}</td>
                    <td className="px-3 py-2 font-medium">{row.assetCode || "—"}</td>
                    <td className="px-3 py-2">{row.asset?.asset_name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.flags?.templateKey ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.flags?.createQrLink ? "yes" : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.flags?.publishAsset ? "public" : "private"}
                    </td>
                    <td className="px-3 py-2">
                      {row.errors.length > 0 ? (
                        <span className="text-xs text-destructive">
                          {row.errors.join(" ")}
                        </span>
                      ) : row.warnings.length > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          Ready · {row.warnings.join(" ")}
                        </span>
                      ) : (
                        <span className="text-xs text-foreground">Ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {parsed && validCount > 0 && hasNewCategories ? (
        // New categories detected → require an explicit decision before importing.
        <div className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              New categories detected
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              These categories are new for this organization. Proceeding will add
              assets using these categories. Choose <strong>Change Categories</strong>{" "}
              if these are typos or should match an existing category.
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
              {newCategoryRows.map(({ category, rows }) => (
                <li key={category}>
                  <span className="font-medium text-foreground">{category}</span>
                  {rows.length > 0 ? ` (row${rows.length === 1 ? "" : "s"} ${rows.join(", ")})` : ""}
                </li>
              ))}
            </ul>
          </div>

          {wantChange ? (
            <p className="text-sm text-muted-foreground">
              No assets have been imported. Update your CSV categories and upload
              again.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <form action={formAction}>
                <input type="hidden" name="csv" value={csvText} />
                <input type="hidden" name="confirm_new_categories" value="true" />
                <Button type="submit" disabled={pending}>
                  {pending ? "Importing…" : "Proceed with Import"}
                </Button>
              </form>
              <Button
                type="button"
                variant="outline"
                onClick={() => setWantChange(true)}
              >
                Change Categories
              </Button>
            </div>
          )}
        </div>
      ) : (
        <form action={formAction}>
          <input type="hidden" name="csv" value={csvText} />
          <Button type="submit" disabled={pending || validCount === 0}>
            {pending
              ? "Importing…"
              : `Import ${validCount} valid asset${validCount === 1 ? "" : "s"}`}
          </Button>
        </form>
      )}
    </div>
  );
}
