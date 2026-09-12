import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  NOJS_CONTINUE_HREF,
  REQUIRES_JAVASCRIPT_ATTRIBUTE,
  REQUIRES_JAVASCRIPT_HIDE_CSS,
  noJsRewrites,
} from "./nojs";

// No-JavaScript fallback routing (lib/public/nojs.ts).

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const onlyWithFlag = [{ type: "query", key: "nojs", value: "1" }];

/** `/nojs/forms/:shortCode/damage` → `app/nojs/forms/[shortCode]/damage` */
const routeDir = (route: string) => join(ROOT, "app", ...route.split("/").filter(Boolean).map((s) => s.replace(/^:(.+)$/, "[$1]")));

/**
 * Where each streamed source keeps its skeleton. Form skeletons sit in a `(form)` route group so they wrap only the
 * form page: a skeleton above `/thanks` would refresh the confirmation into `?nojs=1` (dropping `ref`) with no copy
 * to serve it — a refresh loop.
 */
const SOURCE_SKELETON: Record<string, string> = {
  "/t/:shortCode": "app/t/[shortCode]/loading.tsx",
  "/forms/:shortCode/damage": "app/forms/[shortCode]/damage/(form)/loading.tsx",
  "/forms/:shortCode/support": "app/forms/[shortCode]/support/(form)/loading.tsx",
  "/forms/:shortCode/return": "app/forms/[shortCode]/return/(form)/loading.tsx",
};

describe("no-JavaScript rewrites", () => {
  it("never put a skeleton above a /thanks confirmation", () => {
    for (const form of ["damage", "support", "return"]) {
      const dir = join(ROOT, "app/forms/[shortCode]", form);
      expect(existsSync(join(dir, "thanks", "page.tsx")), `${form}/thanks page`).toBe(true);
      expect(existsSync(join(dir, "loading.tsx")), `${form}/loading.tsx wraps thanks`).toBe(false);
      expect(existsSync(join(dir, "thanks", "loading.tsx")), `${form}/thanks/loading.tsx`).toBe(false);
      expect(existsSync(join(ROOT, "app/forms/[shortCode]/loading.tsx")), "forms/[shortCode]/loading.tsx").toBe(false);
    }
  });

  it("send exactly the streamed public routes to their non-streaming copies, and only with ?nojs=1", () => {
    expect(noJsRewrites()).toEqual([
      { source: "/t/:shortCode", destination: "/nojs/t/:shortCode", has: onlyWithFlag },
      { source: "/forms/:shortCode/damage", destination: "/nojs/forms/:shortCode/damage", has: onlyWithFlag },
      { source: "/forms/:shortCode/support", destination: "/nojs/forms/:shortCode/support", has: onlyWithFlag },
      { source: "/forms/:shortCode/return", destination: "/nojs/forms/:shortCode/return", has: onlyWithFlag },
    ]);
  });

  it("never touch thanks, staff, admin or owner routes", () => {
    for (const { source } of noJsRewrites()) expect(source).not.toMatch(/thanks|staff|dashboard|owner/);
  });

  it("each source streams a skeleton, and each destination renders without one", () => {
    for (const { source, destination } of noJsRewrites()) {
      expect(existsSync(join(ROOT, SOURCE_SKELETON[source])), `${source} skeleton`).toBe(true);
      expect(existsSync(join(routeDir(destination), "page.tsx")), `${destination} page.tsx`).toBe(true);
      // No loading boundary anywhere on the copy's path, or it would stream again.
      const segments = destination.split("/").filter(Boolean);
      for (let i = 1; i <= segments.length; i++) {
        const dir = routeDir(`/${segments.slice(0, i).join("/")}`);
        expect(existsSync(join(dir, "loading.tsx")), `${dir} must not have loading.tsx`).toBe(false);
      }
    }
  });

  it("are wired into next.config.ts as beforeFiles rewrites", () => {
    const config = readFileSync(join(ROOT, "next.config.ts"), "utf8");
    expect(config).toContain("beforeFiles: noJsRewrites()");
  });

  it("continue on the same path with the flag", () => {
    expect(NOJS_CONTINUE_HREF).toBe("?nojs=1");
  });
});

describe("JavaScript-only UI", () => {
  it("the public return checklist form carries the attribute the no-JavaScript style hides", () => {
    const form = readFileSync(join(ROOT, "components/public/return-inspection-form.tsx"), "utf8");
    expect(form).toContain(`${REQUIRES_JAVASCRIPT_ATTRIBUTE}=""`);
    expect(REQUIRES_JAVASCRIPT_HIDE_CSS).toBe("[data-requires-javascript]{display:none!important}");
  });
});
