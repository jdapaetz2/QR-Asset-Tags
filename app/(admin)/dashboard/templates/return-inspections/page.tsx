import Link from "next/link";

import { requireCustomerAdminOrgId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getOrgCategories, normalizeCategoryKey } from "@/lib/assets/categories";
import { getOrgCategoryDefaults } from "@/lib/inspections/category-defaults-data";
import {
  assetsToApplyDefault,
  buildCategoryDefaultLookup,
  classifyReviewAssets,
  type AssetForDefault,
} from "@/lib/inspections/category-defaults";
import {
  removeCategoryDefault,
  applyCategoryDefaultToUnassigned,
} from "@/lib/inspections/category-defaults-actions";
import { copySystemTemplate } from "@/lib/inspections/org-templates-actions";
import {
  getOrgTemplates,
  latestPublishedPerFamily,
} from "@/lib/inspections/org-templates-data";
import { RETURN_TEMPLATES, RETURN_TEMPLATE_KEYS } from "@/lib/inspections/templates";
import { returnTemplateName } from "@/lib/inspections/resolve";
import type { InspectionField } from "@/lib/inspections/types";
import { ReturnTemplatePreview } from "@/components/inspections/return-template-preview";
import { CategoryDefaultForm } from "@/components/inspections/category-default-form";
import { ActionButton } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type AssetRow = AssetForDefault & { asset_code: string; asset_name: string };

const REVIEW_COPY: Record<string, string> = {
  unassigned: "No template assigned",
  generic: "Using the generic inspection",
  differs_from_default: "Differs from the category default — review recommended",
};

function requiredPhotoSlots(fields: InspectionField[][]): string[] {
  return fields
    .flat()
    .filter((f) => f.type === "photo_slot" && (f.photo?.minPhotos ?? 0) > 0)
    .map((f) => f.label);
}

export default async function ReturnInspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireCustomerAdminOrgId();
  const sp = await searchParams;
  const applied = typeof sp.applied === "string" ? Number(sp.applied) : null;
  const moved = typeof sp.moved === "string" ? Number(sp.moved) : null;

  const supabase = await createClient();

  // One assets query + one defaults query, reduced into Maps (no N+1).
  const { data: assetRows } = await supabase
    .from("assets")
    .select(
      "id, asset_code, asset_name, category, return_inspection_template_key, return_inspection_template_id"
    )
    .is("archived_at", null);
  const assets = (assetRows ?? []) as AssetRow[];
  const defaults = await getOrgCategoryDefaults(supabase);
  const categories = await getOrgCategories(supabase);
  const orgTemplates = await getOrgTemplates(supabase);
  const assignable = latestPublishedPerFamily(orgTemplates);

  // Group org templates by family for the "Your return templates" list.
  const familyMap = new Map<string, typeof orgTemplates>();
  for (const t of orgTemplates) {
    const list = familyMap.get(t.family_key) ?? [];
    list.push(t);
    familyMap.set(t.family_key, list);
  }
  const families = Array.from(familyMap.values())
    .map((versions) => versions.slice().sort((a, b) => b.version - a.version))
    .sort((a, b) => a[0].name.toLowerCase().localeCompare(b[0].name.toLowerCase()));

  const lookup = buildCategoryDefaultLookup(defaults);
  const reviewIds = new Set(classifyReviewAssets(assets, lookup).map((r) => r.id));

  // Assets explicitly using each system template (non-archived).
  const usingByKey = new Map<string, number>();
  for (const a of assets) {
    if (a.return_inspection_template_key) {
      usingByKey.set(
        a.return_inspection_template_key,
        (usingByKey.get(a.return_inspection_template_key) ?? 0) + 1
      );
    }
  }

  // Category union: every category currently in use + every mapped category (which may have no assets yet).
  const catMap = new Map<string, string>(); // normalized → display spelling
  for (const a of assets) {
    if (a.category && a.category.trim()) {
      const n = normalizeCategoryKey(a.category);
      if (!catMap.has(n)) catMap.set(n, a.category.trim());
    }
  }
  for (const d of defaults) {
    if (!catMap.has(d.normalized_category_value)) {
      catMap.set(d.normalized_category_value, d.category_value);
    }
  }
  const defaultByNorm = new Map(defaults.map((d) => [d.normalized_category_value, d]));

  const categoryStats = Array.from(catMap.entries())
    .map(([norm, display]) => {
      const inCat = assets.filter(
        (a) => a.category && normalizeCategoryKey(a.category) === norm
      );
      const mapping = defaultByNorm.get(norm) ?? null;
      const assigned = inCat.filter(
        (a) => a.return_inspection_template_key || a.return_inspection_template_id
      ).length;
      const review = inCat.filter((a) => reviewIds.has(a.id)).length;
      const applyTargets = mapping ? assetsToApplyDefault(inCat, lookup).length : 0;
      return { norm, display, assetCount: inCat.length, mapping, assigned, review, applyTargets };
    })
    .sort((a, b) => a.display.toLowerCase().localeCompare(b.display.toLowerCase()));

  const reviewList = classifyReviewAssets(assets, lookup)
    .map((r) => {
      const asset = assets.find((a) => a.id === r.id);
      return asset ? { ...r, asset_code: asset.asset_code, asset_name: asset.asset_name } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <Link
          href="/dashboard/templates"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Templates
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Return inspections</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Preview the built-in return-inspection templates and map your categories to a default. Defaults
          are applied when creating or importing assets; the chosen template is always stored on each
          asset, so the public inspection never depends on these mappings.
        </p>
      </section>

      {applied != null ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-muted-foreground">
          Applied the default to {applied} unassigned asset{applied === 1 ? "" : "s"}.
        </p>
      ) : null}
      {moved != null ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-muted-foreground">
          Moved {moved} asset{moved === 1 ? "" : "s"} to the new version.
        </p>
      ) : null}

      {/* 1. System template catalog (read-only) */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium">System templates</h2>
          <p className="text-sm text-muted-foreground">
            Curated, read-only inspections. Preview each one and see how many assets use it.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {RETURN_TEMPLATE_KEYS.map((key) => {
            const template = RETURN_TEMPLATES[key];
            const photoSlots = requiredPhotoSlots(template.sections.map((s) => s.fields));
            const using = usingByKey.get(key) ?? 0;
            return (
              <div key={key} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium">{template.name}</h3>
                    <p className="text-sm text-muted-foreground">{template.description}</p>
                  </div>
                  <Badge tone={using > 0 ? "info" : "neutral"}>
                    {using} asset{using === 1 ? "" : "s"}
                  </Badge>
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Equipment types
                    </dt>
                    <dd>{template.equipmentTypes.join(", ")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Sections</dt>
                    <dd>{template.sections.map((s) => s.title).join(" · ")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Required photos
                    </dt>
                    <dd>{photoSlots.length > 0 ? photoSlots.join(", ") : "None"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Damage</dt>
                    <dd>Damage details + at least one photo appear when damage is reported.</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <details className="flex-1">
                    <summary className="cursor-pointer text-sm font-medium text-foreground underline-offset-4 hover:underline">
                      Preview inspection
                    </summary>
                    <ReturnTemplatePreview template={template} />
                  </details>
                  <ActionButton action={copySystemTemplate.bind(null, key)} variant="outline">
                    Copy &amp; customize
                  </ActionButton>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Your custom templates (versioned) */}
      {families.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-medium">Your return templates</h2>
            <p className="text-sm text-muted-foreground">
              Copied from a system template and customized. Only published versions can be assigned to
              assets; editing a published version creates a new draft version.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {families.map((versions) => {
              const head = versions[0];
              return (
                <div key={head.family_key} className="rounded-lg border bg-card p-4">
                  <h3 className="font-medium">{head.name}</h3>
                  <p className="text-sm text-muted-foreground">{head.description}</p>
                  <ul className="mt-3 flex flex-col gap-1">
                    {versions.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge
                          tone={
                            v.status === "published"
                              ? "success"
                              : v.status === "retired"
                                ? "neutral"
                                : "info"
                          }
                        >
                          v{v.version} · {v.status}
                        </Badge>
                        <Link
                          href={`/dashboard/templates/return-inspections/custom/${v.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {v.status === "draft" ? "Edit" : "View"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* 2. Organization category defaults */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium">Category defaults</h2>
          <p className="text-sm text-muted-foreground">
            Map an exact category to a default template. Saving an existing category updates its mapping.
            Changing or removing a mapping never changes assets already assigned — it only affects future
            creation, import, and apply.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium">Add or change a mapping</h3>
          <CategoryDefaultForm categories={categories} orgTemplates={assignable} />
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Assets</th>
                <th className="px-3 py-2 font-medium">Default template</th>
                <th className="px-3 py-2 font-medium">Assigned</th>
                <th className="px-3 py-2 font-medium">Needs review</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categoryStats.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                    No categories yet. Add assets, then map their categories here.
                  </td>
                </tr>
              ) : (
                categoryStats.map((c) => (
                  <tr key={c.norm} className="border-b align-top last:border-0">
                    <td className="px-3 py-2 font-medium">{c.display}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.assetCount}</td>
                    <td className="px-3 py-2">
                      {c.mapping ? (
                        returnTemplateName(c.mapping.return_template_key)
                      ) : (
                        <span className="text-muted-foreground">Unmapped</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {c.assigned}/{c.assetCount}
                    </td>
                    <td className="px-3 py-2">
                      {c.review > 0 ? (
                        <span className="text-warning">{c.review}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {c.mapping && c.applyTargets > 0 ? (
                          <ActionButton
                            action={applyCategoryDefaultToUnassigned.bind(null, c.norm)}
                            variant="outline"
                            confirm={`Apply "${returnTemplateName(
                              c.mapping.return_template_key
                            )}" to ${c.applyTargets} unassigned asset${
                              c.applyTargets === 1 ? "" : "s"
                            } in "${c.display}"? Assets with an explicit template are not changed.`}
                          >
                            Apply to {c.applyTargets} unassigned
                          </ActionButton>
                        ) : null}
                        {c.mapping ? (
                          <ActionButton
                            action={removeCategoryDefault.bind(null, c.mapping.id)}
                            variant="destructive"
                            confirm="Remove this mapping? Existing asset assignments are kept."
                          >
                            Remove
                          </ActionButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Assets needing review */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium">Assets needing review</h2>
          <p className="text-sm text-muted-foreground">
            Suggestions, not errors. A differing explicit assignment may be intentional.
          </p>
        </div>
        {reviewList.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing to review — every active asset has a template that matches its category default.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Asset</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Current</th>
                  <th className="px-3 py-2 font-medium">Category default</th>
                  <th className="px-3 py-2 font-medium">Why</th>
                </tr>
              </thead>
              <tbody>
                {reviewList.map((r) => (
                  <tr key={r.id} className="border-b align-top last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        href={`/dashboard/assets/${r.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {r.asset_code}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{r.asset_name}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.category ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.currentKey ? returnTemplateName(r.currentKey) : "Unassigned"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.defaultKey ? returnTemplateName(r.defaultKey) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {REVIEW_COPY[r.reason]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
