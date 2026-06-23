"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { importAssets, type ImportState } from "@/lib/onboarding/actions";
import { parseImportRows, type ParsedImport } from "@/lib/onboarding/import";

export function AssetImport({
  orgTemplateKeys = [],
}: {
  /** This org's custom template keys, so the preview matches server resolution. */
  orgTemplateKeys?: string[];
}) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(
    importAssets,
    {}
  );
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [fileName, setFileName] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
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

      <form action={formAction}>
        <input type="hidden" name="csv" value={csvText} />
        <Button type="submit" disabled={pending || validCount === 0}>
          {pending
            ? "Importing…"
            : `Import ${validCount} valid asset${validCount === 1 ? "" : "s"}`}
        </Button>
      </form>
    </div>
  );
}
