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
