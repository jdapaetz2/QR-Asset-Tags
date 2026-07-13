"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/action-button";
import { ReturnTemplatePreview } from "@/components/inspections/return-template-preview";
import { ADDABLE_FIELD_TYPES } from "@/lib/inspections/org-templates";
import {
  saveDraft,
  publishTemplate,
  createNewVersion,
  retireTemplate,
  discardDraft,
  moveAssignedAssetsToVersion,
  type OrgTemplateState,
} from "@/lib/inspections/org-templates-actions";
import type {
  InspectionField,
  InspectionFieldType,
  InspectionSection,
  InspectionTemplate,
} from "@/lib/inspections/types";
import type { OrgTemplateStatus } from "@/lib/inspections/org-templates";

const inputClass =
  "w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

const TYPE_LABEL: Record<InspectionFieldType, string> = {
  pass_fail_na: "Pass / Fail / N/A",
  yes_no: "Yes / No",
  select: "Choose one",
  short_text: "Short text",
  long_text: "Long text",
  numeric_meter: "Number",
  fuel_charge_level: "Fuel / charge",
  accessory_checklist: "Accessory checklist",
  photo_slot: "Photos",
  acknowledgement: "Attestation",
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
function slugId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}
function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * Constrained editor for an organization return-inspection template (Phase 2). Structured (no drag-drop),
 * closed field-type set only, single-equality conditions only. All edits are local draft state; Save posts
 * the whole definition and the server re-validates authoritatively. Published/retired versions render
 * read-only (preview + lifecycle actions).
 */
export function OrgTemplateEditor({
  id,
  status,
  version,
  initialName,
  initialDescription,
  definition,
  assignedCount,
  moveToId,
  moveToVersion,
}: {
  id: string;
  status: OrgTemplateStatus;
  version: number;
  initialName: string;
  initialDescription: string;
  definition: InspectionTemplate;
  assignedCount: number;
  /** A newer published version of the same family — target of "Move assigned assets". */
  moveToId?: string;
  moveToVersion?: number;
}) {
  const editable = status === "draft";
  const [state, formAction, pending] = useActionState<OrgTemplateState, FormData>(
    saveDraft.bind(null, id),
    {}
  );

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [def, setDef] = useState<InspectionTemplate>(() => clone(definition));

  const previewDef = useMemo<InspectionTemplate>(
    () => ({ ...def, name, description }),
    [def, name, description]
  );

  const allFieldIds = useMemo(
    () => def.sections.flatMap((s) => s.fields.map((f) => f.id)),
    [def]
  );

  function updateSections(fn: (sections: InspectionSection[]) => InspectionSection[]) {
    setDef((prev) => ({ ...prev, sections: fn(clone(prev.sections)) }));
  }
  function patchField(si: number, fi: number, patch: Partial<InspectionField>) {
    updateSections((secs) => {
      secs[si].fields[fi] = { ...secs[si].fields[fi], ...patch };
      return secs;
    });
  }
  function patchSection(si: number, patch: Partial<InspectionSection>) {
    updateSections((secs) => {
      secs[si] = { ...secs[si], ...patch };
      return secs;
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Editor / read-only view */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status === "published" ? "success" : status === "retired" ? "neutral" : "info"}>
            {status} · v{version}
          </Badge>
          {!editable ? (
            <span className="text-xs text-muted-foreground">
              This version is read-only. Create a new version to edit.
            </span>
          ) : null}
        </div>

        {state.error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}

        {editable ? (
          <form action={formAction} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Template name</span>
              <input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Customer-facing description</span>
              <textarea
                name="description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
              />
            </label>

            {def.sections.map((section, si) => (
              <fieldset key={section.id} className="flex flex-col gap-3 rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={section.title}
                    onChange={(e) => patchSection(si, { title: e.target.value })}
                    className={`${inputClass} font-medium`}
                    aria-label="Section title"
                  />
                  <div className="flex gap-1">
                    <MiniBtn label="↑" onClick={() => updateSections((s) => move(s, si, -1))} />
                    <MiniBtn label="↓" onClick={() => updateSections((s) => move(s, si, 1))} />
                    <MiniBtn
                      label="Remove"
                      onClick={() => updateSections((s) => s.filter((_, k) => k !== si))}
                    />
                  </div>
                </div>
                {section.visible_when ? (
                  <p className="text-xs text-amber-700 dark:text-amber-500">
                    Shown only when “{section.visible_when.field}” = “{section.visible_when.equals}”.
                  </p>
                ) : null}

                {section.fields.map((field, fi) => (
                  <FieldEditor
                    key={field.id}
                    field={field}
                    fieldIds={allFieldIds}
                    onPatch={(patch) => patchField(si, fi, patch)}
                    onMoveUp={() => updateSections((s) => {
                      s[si].fields = move(s[si].fields, fi, -1);
                      return s;
                    })}
                    onMoveDown={() => updateSections((s) => {
                      s[si].fields = move(s[si].fields, fi, 1);
                      return s;
                    })}
                    onRemove={() => updateSections((s) => {
                      s[si].fields = s[si].fields.filter((_, k) => k !== fi);
                      return s;
                    })}
                  />
                ))}

                <AddField
                  onAdd={(type, label) =>
                    updateSections((s) => {
                      s[si].fields.push(newField(type, label));
                      return s;
                    })
                  }
                />
              </fieldset>
            ))}

            <AddSection
              onAdd={(title) =>
                updateSections((s) => {
                  s.push({ id: slugId("section"), title, fields: [] });
                  return s;
                })
              }
            />

            {/* The whole definition travels in one hidden field; the server re-validates it. */}
            <input type="hidden" name="definition_json" value={JSON.stringify(def)} />
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save draft"}
              </Button>
              <ActionButton
                action={publishTemplate.bind(null, id)}
                variant="outline"
                confirm="Publish this version? Published versions are immutable — editing later creates a new version."
              >
                Publish
              </ActionButton>
              <ActionButton
                action={discardDraft.bind(null, id)}
                variant="destructive"
                confirm="Discard this draft? This cannot be undone."
              >
                Discard draft
              </ActionButton>
            </div>
            <p className="text-xs text-muted-foreground">
              Save keeps this as a draft. Publishing makes the version available to assign to assets.
            </p>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-medium">{name}</p>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ActionButton action={createNewVersion.bind(null, id)}>Create new version</ActionButton>
              {status === "published" && moveToId && assignedCount > 0 ? (
                <ActionButton
                  action={moveAssignedAssetsToVersion.bind(null, id, moveToId)}
                  variant="outline"
                  confirm={`Move ${assignedCount} assigned asset${
                    assignedCount === 1 ? "" : "s"
                  } from v${version} to v${moveToVersion}?`}
                >
                  Move {assignedCount} asset{assignedCount === 1 ? "" : "s"} to v{moveToVersion}
                </ActionButton>
              ) : null}
              {status === "published" ? (
                <ActionButton
                  action={retireTemplate.bind(null, id)}
                  variant="destructive"
                  confirm="Retire this version? Assigned assets will need review; existing submissions are unchanged."
                >
                  Retire
                </ActionButton>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {assignedCount} asset{assignedCount === 1 ? "" : "s"} currently assigned to this version.
            </p>
          </div>
        )}

        <Link
          href="/dashboard/templates/return-inspections"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to return inspections
        </Link>
      </div>

      {/* Live preview */}
      <div className="flex flex-col gap-2 lg:sticky lg:top-20 lg:self-start">
        <p className="text-sm font-medium">Preview</p>
        <div className="rounded-lg border bg-card p-4">
          <ReturnTemplatePreview template={previewDef} />
        </div>
      </div>
    </div>
  );
}

function MiniBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
    >
      {label}
    </button>
  );
}

function newField(type: InspectionFieldType, label: string): InspectionField {
  const field: InspectionField = { id: slugId("field"), type, label: label || TYPE_LABEL[type] };
  if (type === "select") field.options = [{ value: "option_1", label: "Option 1" }];
  if (type === "accessory_checklist") field.items = [{ id: "item_1", label: "Item 1" }];
  if (type === "photo_slot") field.photo = { minPhotos: 0, maxPhotos: 6 };
  return field;
}

function FieldEditor({
  field,
  fieldIds,
  onPatch,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  field: InspectionField;
  fieldIds: string[];
  onPatch: (patch: Partial<InspectionField>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const isAttestation = field.type === "acknowledgement";
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {TYPE_LABEL[field.type]}
        </span>
        <div className="ml-auto flex gap-1">
          <MiniBtn label="↑" onClick={onMoveUp} />
          <MiniBtn label="↓" onClick={onMoveDown} />
          {!isAttestation ? <MiniBtn label="Remove" onClick={onRemove} /> : null}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Label</span>
        <input value={field.label} onChange={(e) => onPatch({ label: e.target.value })} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Help text</span>
        <input value={field.help ?? ""} onChange={(e) => onPatch({ help: e.target.value })} className={inputClass} />
      </label>

      {!isAttestation && field.type !== "photo_slot" ? (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={field.required ?? false}
            onChange={(e) => onPatch({ required: e.target.checked })}
          />
          <span>Required</span>
        </label>
      ) : null}

      {field.type === "photo_slot" ? (
        <div className="flex gap-2 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Min photos</span>
            <input
              type="number"
              min={0}
              value={field.photo?.minPhotos ?? 0}
              onChange={(e) =>
                onPatch({ photo: { minPhotos: Number(e.target.value), maxPhotos: field.photo?.maxPhotos ?? 6 } })
              }
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Max photos</span>
            <input
              type="number"
              min={1}
              value={field.photo?.maxPhotos ?? 6}
              onChange={(e) =>
                onPatch({ photo: { minPhotos: field.photo?.minPhotos ?? 0, maxPhotos: Number(e.target.value) } })
              }
              className={inputClass}
            />
          </label>
        </div>
      ) : null}

      {field.type === "numeric_meter" ? (
        <div className="flex gap-2 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Unit</span>
            <input value={field.unit ?? ""} onChange={(e) => onPatch({ unit: e.target.value })} className={inputClass} />
          </label>
        </div>
      ) : null}

      {field.type === "select" ? (
        <OptionsEditor
          options={field.options ?? []}
          onChange={(options) => onPatch({ options })}
        />
      ) : null}

      {field.type === "accessory_checklist" ? (
        <ItemsEditor items={field.items ?? []} onChange={(items) => onPatch({ items })} />
      ) : null}

      <ConditionEditor
        label="Show only when"
        condition={field.visible_when}
        fieldIds={fieldIds.filter((fid) => fid !== field.id)}
        onChange={(visible_when) => onPatch({ visible_when })}
      />
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: { value: string; label: string }[];
  onChange: (o: { value: string; label: string }[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">Options</span>
      {options.map((o, i) => (
        <div key={i} className="flex gap-1">
          <input
            value={o.label}
            onChange={(e) => {
              const next = options.slice();
              next[i] = { value: o.value || slugId("opt"), label: e.target.value };
              onChange(next);
            }}
            className={inputClass}
            placeholder="Option label"
          />
          <MiniBtn label="×" onClick={() => onChange(options.filter((_, k) => k !== i))} />
        </div>
      ))}
      <MiniBtn
        label="+ Add option"
        onClick={() => onChange([...options, { value: slugId("opt"), label: "New option" }])}
      />
    </div>
  );
}

function ItemsEditor({
  items,
  onChange,
}: {
  items: { id: string; label: string }[];
  onChange: (i: { id: string; label: string }[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">Accessory items</span>
      {items.map((it, i) => (
        <div key={i} className="flex gap-1">
          <input
            value={it.label}
            onChange={(e) => {
              const next = items.slice();
              next[i] = { id: it.id || slugId("item"), label: e.target.value };
              onChange(next);
            }}
            className={inputClass}
            placeholder="Item label"
          />
          <MiniBtn label="×" onClick={() => onChange(items.filter((_, k) => k !== i))} />
        </div>
      ))}
      <MiniBtn
        label="+ Add item"
        onClick={() => onChange([...items, { id: slugId("item"), label: "New item" }])}
      />
    </div>
  );
}

function ConditionEditor({
  label,
  condition,
  fieldIds,
  onChange,
}: {
  label: string;
  condition: { field: string; equals: string } | undefined;
  fieldIds: string[];
  onChange: (c: { field: string; equals: string } | undefined) => void;
}) {
  if (!condition) {
    return (
      <MiniBtn
        label={`+ ${label} a condition`}
        onClick={() => onChange({ field: fieldIds[0] ?? "", equals: "" })}
      />
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={condition.field}
        onChange={(e) => onChange({ ...condition, field: e.target.value })}
        className="rounded-md border bg-background px-1.5 py-1"
      >
        {fieldIds.map((fid) => (
          <option key={fid} value={fid}>
            {fid}
          </option>
        ))}
      </select>
      <span>=</span>
      <input
        value={condition.equals}
        onChange={(e) => onChange({ ...condition, equals: e.target.value })}
        className="w-24 rounded-md border bg-background px-1.5 py-1"
        placeholder="value"
      />
      <MiniBtn label="Clear" onClick={() => onChange(undefined)} />
    </div>
  );
}

function AddField({ onAdd }: { onAdd: (type: InspectionFieldType, label: string) => void }) {
  const [type, setType] = useState<InspectionFieldType>(ADDABLE_FIELD_TYPES[0]);
  const [label, setLabel] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-2 text-xs">
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Add field</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as InspectionFieldType)}
          className="rounded-md border bg-background px-1.5 py-1"
        >
          {ADDABLE_FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Field label"
        className={inputClass}
      />
      <MiniBtn
        label="Add"
        onClick={() => {
          onAdd(type, label);
          setLabel("");
        }}
      />
    </div>
  );
}

function AddSection({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-2 text-xs">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New section title"
        className={inputClass}
      />
      <MiniBtn
        label="Add section"
        onClick={() => {
          if (title.trim()) onAdd(title.trim());
          setTitle("");
        }}
      />
    </div>
  );
}
