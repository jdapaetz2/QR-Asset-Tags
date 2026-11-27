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

// Fitting the screen (operator, 2026-11-27): the card never grows past the screen, and its ✕ is always in view.
describe("ack-prompt — fits the screen, with the ✕ always in view", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const css = readFileSync(resolve(root, "app/globals.css"), "utf8").replace(/\r\n/g, "\n");
  const tsx = src.replace(/\r\n/g, "\n");

  it("caps the card at the screen height less a 2.5rem strip of the page and the overlay's own space under it", () => {
    expect(css).toContain('[data-ack-prompt] > [role="dialog"] {\n  max-height: calc(100svh - 3.5rem);\n}');
    expect(css).toContain('@media (width >= 40rem) {\n  [data-ack-prompt] > [role="dialog"] {\n    max-height: calc(100svh - 4.5rem);\n  }');
    // The space under the card that each cap subtracts besides the strip: pb-4 on phones, plus sm:bottom-4 from 40rem.
    expect(tsx).toContain('className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:bottom-4"');
  });

  it("keeps the title row and the ✕ outside the part that scrolls, which holds everything else", () => {
    const body = tsx.indexOf('<div data-ack-prompt-body="" className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">');
    const close = tsx.indexOf('aria-label="Dismiss"');
    expect(body).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(-1);
    expect(close).toBeLessThan(body);
    expect(tsx).toContain('className="mx-auto flex max-w-md flex-col rounded-lg border border-l-4 bg-card shadow-lg"');
    expect(tsx).toContain('<div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-4 pb-2">');
    const scrolling = tsx.slice(body);
    expect(scrolling).toContain("<AcknowledgementForm");
    expect(scrolling).toContain("Dismiss for now");
    expect(scrolling).not.toContain('aria-label="Dismiss"');
  });
});
