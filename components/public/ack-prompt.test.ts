import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Client component (no jsdom) → asserted structurally (Phase 3C.6): staff-aware suppression + non-persistent
// dismissal.
const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ack-prompt.tsx"), "utf8");

describe("ack-prompt — staff-aware + non-persistent dismiss", () => {
  it("suppresses entirely for an authorized staff viewer", () => {
    expect(src).toContain("viewerIsAuthorizedStaff");
    expect(src).toContain("if (viewerIsAuthorizedStaff || !sessionId || !visible) return null;");
  });

  it("only COMPLETION writes the storage key; DISMISS does not", () => {
    // completeAndHide persists; dismissForNow must not touch localStorage.
    expect(src).toContain("completeAndHide");
    expect(src).toContain("localStorage.setItem");
    const dismiss = src.slice(src.indexOf("dismissForNow = useCallback"), src.indexOf("dismissForNow = useCallback") + 200);
    expect(dismiss).not.toContain("localStorage.setItem");
    // The form's completion triggers persistence; the visible dismiss control does not.
    expect(src).toContain("onAcknowledged={completeAndHide}");
  });

  it("replaces the persistent 'I'm staff' control with a transient Dismiss for now", () => {
    expect(src).not.toContain("I&apos;m staff");
    expect(src).not.toContain("dismiss for this rental on this device");
    expect(src).toContain("Dismiss for now");
    expect(src).toContain("appear again the next time this tag is scanned");
  });

  it("does not reopen during the same mounted view after dismissal", () => {
    expect(src).toContain("dismissedRef");
    expect(src).toContain("if (!dismissedRef.current) setVisible(true)");
  });
});

// WCAG 2.2 SC 2.4.11 (Focus Not Obscured): keyboard focus scrolls clear of what is fixed to the bottom of a scan page —
// the sticky action bar, and the open prompt — while the prompt stays non-blocking. Line endings normalized (Windows).
describe("ack-prompt — keyboard focus is never hidden behind the prompt or the sticky bar", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");
  const css = read("app/globals.css");
  const bar = read("components/public/public-scanner-view.tsx");

  it("publishes how much of the viewport it covers while open, keeps it current, and removes it when it closes", () => {
    expect(src).toContain('const COVER_PROPERTY = "--ack-prompt-cover";');
    expect(src).toContain('data-ack-prompt=""');
    expect(src).toContain("new ResizeObserver(publish)");
    expect(src).toContain("root.style.removeProperty(COVER_PROPERTY)");
  });

  it("stays non-blocking: it never takes focus and never makes the page inert or modal", () => {
    for (const blocking of [".focus(", "inert", "aria-modal", "showModal"]) expect(src).not.toContain(blocking);
  });

  it("scan pages keep focus clear of the sticky bar (phones) and of the open prompt, and reserve room for it", () => {
    expect(css).toContain(
      "@media (width < 40rem) {\n  html:has([data-sticky-actions]) {\n    scroll-padding-bottom: calc(1px + 4rem + max(0.5rem, env(safe-area-inset-bottom)));"
    );
    expect(css).toContain("html:has([data-ack-prompt]) {\n  scroll-padding-bottom: calc(var(--ack-prompt-cover, 0px) + 0.5rem);");
    expect(css).toContain("main:has(> [data-ack-prompt]) {\n  padding-bottom: calc(var(--ack-prompt-cover, 0px) + 0.5rem);");
    expect(css).toContain("html:has([data-ack-prompt]) [data-sticky-actions] {\n  visibility: hidden;");
  });

  it("marks only the public sticky bar, never the admin preview frame", () => {
    expect(bar).toContain('data-sticky-actions={preview ? undefined : ""}');
  });
});
