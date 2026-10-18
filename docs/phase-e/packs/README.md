# Showcase content packs (Engineering Phase E2A)

One folder per model, named by its `model_key`. Nothing here is published: E2C imports these packs into Northridge only after the operator approves them.

| Path | What it is | Edited by |
|---|---|---|
| `<model_key>/pack.json` | The pack, in the [equipment-content schema](../schema/equipment-content.schema.json) 1.1.0: identity, configuration, sourced specs, steps, warnings, staff notes, panels, photo, public page text, documents, showcase story, review state | Hand, then the generators |
| `<model_key>/review.md`, `storyboard.md` | Readable copies of the pack | Generated |
| `<model_key>/media/` | Photo derivatives and `media.json` (every edit, crop, credit and hash) | Generated |
| `<model_key>/guide/` | Original panel artwork (SVG), web renders (`web/`) and the Start-Up Guide PDF | Generated |
| `<model_key>/import-manifest.json` | Field-level E2C import plan: every change, its current value and its status | Generated |
| `SOURCES_REGISTER.json` | Every source with hash, applicability, rights and availability; [SOURCES.md](SOURCES.md) is the readable copy | Hand |
| `MODEL_PACK_INDEX.json`, [`MODEL_PACK_INDEX.md`](MODEL_PACK_INDEX.md) | Reusable index: tier, completeness, reuse limits | Generated |
| [`EXTENSIONS.md`](EXTENSIONS.md) | App changes the packs would benefit from (not built) | Hand |
| [`marketing/`](marketing/README.md) | Candidate patches for getmulemark.com (not pushed) | Hand |
| `REVIEW_GALLERY.html` | Public-safe review gallery (text and derivative images only) | Generated |

The private copies stay outside Git, in the source vault (`%USERPROFILE%\Mulemark-Sources\e2a`): original manuals and photos, page renders, before-and-after crops and the private review gallery.

## Regenerating

These are `npm run` commands, so run them from the project folder:

```
npm.cmd run phase-e:packs:build
```

That builds the panels and guides, refreshes the review copies, index and galleries, then rewrites the import manifests, in that order. Run it after any edit to a `pack.json`, the register or the panel drawings (`scripts/phase-e/packs/pictogram-*.mjs`). Output is deterministic: unchanged content gives byte-identical files.

`npm.cmd run phase-e:packs:photos` rebuilds the photo derivatives; it needs the source vault. The pack tests (`scripts/phase-e/packs/packs.test.mjs`) run with the normal test suite.

## Status words

Every spec, step, panel, photo, page field and document carries one:
- **READY**: sourced and reviewed;
- **REVIEW_REQUIRED**: sourced; the named reviewer (the operator) has not approved it yet;
- **BLOCKED**: a source, permission or fact is missing, and its `status_reason` says which.

A model can be READY only when nothing in it is REVIEW_REQUIRED or BLOCKED, and an import manifest allows applying only when every operation is READY.
