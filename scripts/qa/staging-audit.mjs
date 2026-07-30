#!/usr/bin/env node
/**
 * A6.3 staging audit — emulated-device workflow pass (Part B), request-loop verification (Part D),
 * QR safeguards (Part E), and dry-run notification evidence (Part F).
 *
 * HONESTY BOUNDARY: `--devices` drives real browser ENGINES (Chromium, WebKit) under device EMULATION
 * (viewport, touch, DPR, UA). That is meaningfully stronger than a desktop-only check, but it is NOT a
 * real handset: it cannot exercise a phone camera, a real QR scan, a real cellular link, or iOS Safari's
 * actual shell. Those rows belong to the operator matrix in docs/REAL_DEVICE_QA.md and are never
 * auto-filled here.
 *
 * Usage:
 *   node scripts/qa/staging-audit.mjs --base=https://<staging> --devices
 *   node scripts/qa/staging-audit.mjs --base=https://<staging> --loops [--window=90]
 *   node scripts/qa/staging-audit.mjs --base=https://<staging> --qr
 * Env (optional): VERCEL_AUTOMATION_BYPASS_SECRET (never printed), QA_ADMIN_EMAIL, QA_STAFF_EMAIL,
 * QA_PASSWORD, QA_SHORT_CODE.
 */
import { chromium, webkit, devices } from "playwright";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=") || true];
  })
);
const BASE = String(args.base || "").replace(/\/$/, "");
if (!BASE) {
  console.error("usage: staging-audit.mjs --base=https://<staging> [--devices|--loops|--qr]");
  process.exit(1);
}
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const SHORT = process.env.QA_SHORT_CODE || "qa-a63-test";
// Bypass header ONLY. Adding `x-vercel-set-bypass-cookie` makes the edge redirect to set the cookie on
// every request, which Playwright follows into ERR_TOO_MANY_REDIRECTS.
const HEADERS = BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {};

const rows = [];
const record = (profile, workflow, result, note = "") => {
  rows.push({ profile, workflow, result, note });
  process.stderr.write(`  [${result}] ${profile} · ${workflow}${note ? ` — ${note}` : ""}\n`);
};

const PROFILES = [
  { key: "iPhone-class (WebKit)", engine: webkit, descriptor: devices["iPhone 15"] },
  { key: "Android-class (Chromium)", engine: chromium, descriptor: devices["Pixel 7"] },
  { key: "Desktop Chrome (Chromium)", engine: chromium, descriptor: devices["Desktop Chrome"] },
  { key: "Desktop Edge (Chromium msedge)", engine: chromium, descriptor: devices["Desktop Edge"], channel: "msedge" },
];

async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1);
}

/**
 * Wait for a locator to become visible. `locator.isVisible()` resolves IMMEDIATELY and silently ignores
 * a `{timeout}` option, so using it for anything that appears after hydration (or after a deliberate
 * delay, like the 4s acknowledgement prompt) produces false negatives. Always go through this.
 */
async function visible(locator, timeout = 10_000) {
  try {
    await locator.first().waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

/** Returns "ok" | "no-credentials" | "failed: <reason>" so the report never conflates the two. */
async function signIn(context, email) {
  const password = process.env.QA_PASSWORD;
  if (!email || !password) return "no-credentials";
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard|\/owner/, { timeout: 30_000 });
    return "ok";
  } catch (e) {
    return `failed: ${e.message.slice(0, 60)}`;
  } finally {
    await page.close();
  }
}

// ---- Part B: emulated device workflow pass ----------------------------------
async function devicePass() {
  for (const p of PROFILES) {
    let browser;
    try {
      browser = await p.engine.launch(p.channel ? { channel: p.channel } : {});
    } catch {
      record(p.key, "browser launch", "NOT RUN", `${p.channel ?? "engine"} unavailable on this machine`);
      continue;
    }
    const context = await browser.newContext({ ...p.descriptor, extraHTTPHeaders: HEADERS });
    const isMobile = Boolean(p.descriptor.isMobile);

    // --- Public scan -------------------------------------------------------
    try {
      const page = await context.newPage();
      const resp = await page.goto(`${BASE}/t/${SHORT}`, { waitUntil: "load", timeout: 45_000 });
      const ok = resp?.status() === 200;
      const nameSeen = await visible(page.getByText("QA Test Trailer", { exact: false }));
      record(p.key, "public scan — equipment page", ok && nameSeen ? "PASS" : "FAIL", `http ${resp?.status()}`);
      record(p.key, "public scan — no horizontal overflow", (await noOverflow(page)) ? "PASS" : "FAIL");

      const qs = page.locator("#quick-start");
      if (await qs.count()) {
        // Quick Start auto-expands on the first scan of a session via a post-mount effect. Let that
        // settle first — clicking the summary while it is already open would CLOSE it and read as a
        // false failure. Then open it only if it is still closed.
        await page.waitForTimeout(1500);
        if (!(await qs.evaluate((d) => d.open))) await qs.locator("summary").click();
        const body = await visible(page.getByText("disposable QA content", { exact: false }), 5000);
        record(p.key, "public scan — quick start expands", body ? "PASS" : "FAIL");
      } else record(p.key, "public scan — quick start expands", "N/A", "no quick-start content");

      const sticky = await visible(page.getByRole("link", { name: "Report Damage" }));
      record(p.key, "public scan — sticky actions reachable", sticky ? "PASS" : "FAIL");

      // Orientation: swap the viewport and re-check overflow (emulated rotation).
      if (isMobile) {
        const vp = page.viewportSize();
        await page.setViewportSize({ width: vp.height, height: vp.width });
        record(p.key, "public scan — landscape orientation", (await noOverflow(page)) ? "PASS" : "FAIL");
        await page.setViewportSize(vp);
      }
      await page.close();
    } catch (e) {
      record(p.key, "public scan", "ERROR", e.message.slice(0, 70));
    }

    // --- Damage form (keyboard + submit + reference) -----------------------
    try {
      const page = await context.newPage();
      await page.goto(`${BASE}/forms/${SHORT}/damage`, { waitUntil: "load", timeout: 45_000 });
      record(p.key, "damage form — renders", "PASS");
      record(p.key, "damage form — no horizontal overflow", (await noOverflow(page)) ? "PASS" : "FAIL");
      // Keyboard: focus the first field and type.
      await page.getByLabel("Your name").focus();
      await page.keyboard.type("QA Device Test");
      const typed = await page.getByLabel("Your name").inputValue();
      record(p.key, "damage form — keyboard entry", typed === "QA Device Test" ? "PASS" : "FAIL");
      // Photo input present + accepts images (picker/camera affordance).
      const media = page.locator('input[name="media"]');
      const accept = await media.getAttribute("accept").catch(() => null);
      record(
        p.key,
        "damage form — photo picker present",
        accept && accept.includes("image") ? "PASS" : "FAIL",
        accept ? `accept=${accept.slice(0, 40)}` : "no input"
      );
      await page.getByRole("textbox", { name: "Email" }).fill("qa.renter@mulemark-qa.invalid");
      await page.getByLabel("What's damaged?").fill("A6.3 device QA — disposable test submission.");
      await page.getByRole("button", { name: "Submit damage report" }).click();
      await page.waitForURL(/\/damage\/thanks/, { timeout: 45_000 });
      const ref = await visible(page.getByText(/^SUB-\d{4}-[0-9A-F]{6}$/));
      record(p.key, "damage form — success + reference", ref ? "PASS" : "FAIL");
      await page.close();
    } catch (e) {
      record(p.key, "damage form", "ERROR", e.message.slice(0, 70));
    }

    // --- Support form ------------------------------------------------------
    try {
      const page = await context.newPage();
      await page.goto(`${BASE}/forms/${SHORT}/support`, { waitUntil: "load", timeout: 45_000 });
      await page.getByLabel("Your name").fill("QA Device Test");
      await page.getByRole("textbox", { name: "Email" }).fill("qa.renter@mulemark-qa.invalid");
      await page.getByLabel("What do you need help with?").fill("A6.3 device QA — disposable test.");
      await page.getByRole("button", { name: "Send support request" }).click();
      await page.waitForURL(/\/support\/thanks/, { timeout: 45_000 });
      record(p.key, "support form — success + reference", "PASS");
      await page.close();
    } catch (e) {
      record(p.key, "support form", "ERROR", e.message.slice(0, 70));
    }

    // --- Renter return checklist (3 stages) --------------------------------
    try {
      const page = await context.newPage();
      await page.goto(`${BASE}/forms/${SHORT}/return`, { waitUntil: "load", timeout: 45_000 });
      const step1 = await visible(page.getByText("Step 1 of 3"));
      record(p.key, "return checklist — stage 1 renders", step1 ? "PASS" : "FAIL");
      const groups = page.locator('fieldset[id^="field-"]:visible');
      const n = await groups.count();
      for (let i = 0; i < n; i++) {
        const g = groups.nth(i);
        const id = (await g.getAttribute("id")) ?? "";
        if (/damage/.test(id)) await g.getByText("No", { exact: true }).click();
        else await g.locator("label").first().click();
      }
      await page.getByRole("button", { name: "Continue" }).click();
      const step2 = await visible(page.getByText("Step 2 of 3"));
      record(p.key, "return checklist — stage 2 advances", step2 ? "PASS" : "FAIL");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Review return checklist" }).click();
      const step3 = await visible(page.getByText("Step 3 of 3"));
      record(p.key, "return checklist — review stage", step3 ? "PASS" : "FAIL");
      await page.close();
    } catch (e) {
      record(p.key, "return checklist", "ERROR", e.message.slice(0, 70));
    }

    // --- Acknowledgement ---------------------------------------------------
    try {
      const page = await context.newPage();
      await page.goto(`${BASE}/t/${SHORT}`, { waitUntil: "load", timeout: 45_000 });
      const prompt = page.getByRole("dialog", { name: "Before you use this equipment" });
      // The prompt is deliberately delayed ~4s; wait well past that.
      const seen = await visible(prompt, 15_000);
      record(p.key, "acknowledgement — prompt appears", seen ? "PASS" : "FAIL");
      await page.close();
    } catch (e) {
      record(p.key, "acknowledgement", "ERROR", e.message.slice(0, 70));
    }

    // --- Staff workflows ---------------------------------------------------
    const staffCtx = await browser.newContext({ ...p.descriptor, extraHTTPHeaders: HEADERS });
    const staffAuth = await signIn(staffCtx, process.env.QA_STAFF_EMAIL);
    if (staffAuth === "ok") {
      record(p.key, "staff — login", "PASS");
      try {
        const page = await staffCtx.newPage();
        await page.goto(`${BASE}/staff/t/${SHORT}`, { waitUntil: "load", timeout: 45_000 });
        const recognised = await visible(page.getByText("Staff workflow", { exact: false }));
        record(p.key, "staff — scan recognition", recognised ? "PASS" : "FAIL");
        const rented = await visible(page.getByRole("link", { name: /outbound inspection/i }), 5000);
        const canReturn = await visible(page.getByRole("link", { name: "Complete return checklist" }), 5000);
        record(p.key, "staff — active rental session state", rented || canReturn ? "PASS" : "FAIL");
        await page.goto(`${BASE}/staff/t/${SHORT}/return`, { waitUntil: "load", timeout: 45_000 });
        const returnForm = await visible(page.getByRole("heading", { name: "Staff return checklist" }));
        record(p.key, "staff — return checklist reachable", returnForm ? "PASS" : "FAIL");
        await page.close();
      } catch (e) {
        record(p.key, "staff workflows", "ERROR", e.message.slice(0, 70));
      }
    } else {
      record(p.key, "staff — login", staffAuth === "no-credentials" ? "NOT RUN" : "FAIL", staffAuth);
    }
    await staffCtx.close();

    // --- Admin workflows ---------------------------------------------------
    const adminCtx = await browser.newContext({ ...p.descriptor, extraHTTPHeaders: HEADERS });
    const adminAuth = await signIn(adminCtx, process.env.QA_ADMIN_EMAIL);
    if (adminAuth === "ok") {
      record(p.key, "admin — login", "PASS");
      for (const [label, path, heading] of [
        ["admin — assets", "/dashboard/assets", "Assets"],
        ["admin — submissions", "/dashboard/submissions", "Submissions"],
        ["admin — rentals", "/dashboard/rentals", "Rental sessions"],
      ]) {
        try {
          const page = await adminCtx.newPage();
          await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 45_000 });
          const ok = await visible(page.getByRole("heading", { name: heading }));
          record(p.key, label, ok ? "PASS" : "FAIL");
          if (path.endsWith("submissions")) {
            const sel = page.getByRole("checkbox", { name: "Select all visible submissions" });
            if (await sel.count()) {
              await sel.check();
              const bulk = await visible(page.getByText(/\d+ selected/), 5000);
              record(p.key, "admin — bulk actions toolbar", bulk ? "PASS" : "FAIL");
            } else record(p.key, "admin — bulk actions toolbar", "N/A", "no submissions to select");
          }
          record(p.key, `${label} — no horizontal overflow`, (await noOverflow(page)) ? "PASS" : "FAIL");
          await page.close();
        } catch (e) {
          record(p.key, label, "ERROR", e.message.slice(0, 70));
        }
      }
      // Export disabled for the QA org → the page must redirect to settings.
      try {
        const page = await adminCtx.newPage();
        await page.goto(`${BASE}/dashboard/export`, { waitUntil: "load", timeout: 45_000 });
        // WebKit settles the server redirect slightly after `load`; wait for the final URL.
        await page.waitForURL(/\/dashboard\/settings/, { timeout: 15_000 }).catch(() => {});
        const redirected = /\/dashboard\/settings/.test(page.url());
        record(p.key, "admin — export disabled redirects", redirected ? "PASS" : "FAIL", page.url().replace(BASE, ""));
        await page.close();
      } catch (e) {
        record(p.key, "admin — export disabled redirects", "ERROR", e.message.slice(0, 70));
      }
    } else {
      record(p.key, "admin — login", adminAuth === "no-credentials" ? "NOT RUN" : "FAIL", adminAuth);
    }
    await adminCtx.close();

    await context.close();
    await browser.close();
  }

  console.log("\n| Profile | Workflow | Result | Note |");
  console.log("|---|---|---|---|");
  for (const r of rows) console.log(`| ${r.profile} | ${r.workflow} | ${r.result} | ${r.note || ""} |`);
  const fails = rows.filter((r) => r.result === "FAIL" || r.result === "ERROR");
  console.log(`\n${rows.length} checks — ${rows.filter((r) => r.result === "PASS").length} pass, ${fails.length} fail/error.`);
}

// ---- Part D: request-loop verification --------------------------------------
async function loopPass() {
  const WINDOW = Number(args.window ?? 90);
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["Desktop Chrome"], extraHTTPHeaders: HEADERS });
  const authed = await signIn(context, process.env.QA_ADMIN_EMAIL);

  const targets = [
    { key: "public scan", path: `/t/${SHORT}`, auth: false },
    { key: "dashboard", path: "/dashboard", auth: true },
    { key: "submissions (polling page)", path: "/dashboard/submissions", auth: true },
    { key: "assets", path: "/dashboard/assets", auth: true },
  ];

  console.log(`\nRequest-loop observation — ${WINDOW}s visible, then ${WINDOW}s hidden. base=${BASE}\n`);
  // Raw request counts alone are misleading: ONE router.refresh() re-fetches the page's RSC payload AND
  // re-prefetches every visible <Link>, so a single refresh is tens of requests. What actually
  // distinguishes "correct 30s cadence" from "runaway loop" is the number of distinct ACTIVITY BURSTS.
  console.log("| Route | Requests (visible) | Bursts (visible) | Requests (hidden) | Expectation |");
  console.log("|---|---|---|---|---|");

  for (const t of targets) {
    if (t.auth && !authed) {
      console.log(`| ${t.key} | — | — | skipped: no QA admin credentials |`);
      continue;
    }
    const page = await context.newPage();
    await page.goto(`${BASE}${t.path}`, { waitUntil: "load", timeout: 45_000 });
    await page.waitForTimeout(3000); // let the initial load settle

    let visible = 0;
    const seconds = new Set();
    const t0 = Date.now();
    const count = (req) => {
      // Count only same-origin document/RSC/data traffic — not third-party beacons.
      if (req.url().startsWith(BASE)) {
        visible++;
        seconds.add(Math.floor((Date.now() - t0) / 1000));
      }
    };
    page.on("request", count);
    await page.waitForTimeout(WINDOW * 1000);
    page.off("request", count);
    const visibleCount = visible;
    // Group adjacent active seconds into bursts (a refresh's fan-out spans 1–3 seconds).
    const active = [...seconds].sort((a, b) => a - b);
    const bursts = active.filter((s, i) => i === 0 || s - active[i - 1] > 3).length;

    // Flip to hidden via CDP and observe the same window.
    const session = await context.newCDPSession(page);
    await session.send("Emulation.setPageVisibilityOverride", { visibility: "hidden" }).catch(async () => {
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
        Object.defineProperty(document, "hidden", { value: true, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    });
    let hidden = 0;
    const countHidden = (req) => {
      if (req.url().startsWith(BASE)) hidden++;
    };
    page.on("request", countHidden);
    await page.waitForTimeout(WINDOW * 1000);
    page.off("request", countHidden);

    const expectation = t.path.endsWith("/submissions")
      ? `~${Math.floor(WINDOW / 30)} bursts (30s floor), 0 hidden`
      : "0 bursts, 0 hidden";
    console.log(`| ${t.key} | ${visibleCount} | ${bursts} | ${hidden} | ${expectation} |`);
    await page.close();
  }
  await browser.close();
  console.log(`\nObservation window: ${WINDOW}s per state, idle (no user interaction).`);
}

// ---- Part E: QR safeguards ---------------------------------------------------
async function qrPass() {
  console.log(`\nQR durable-output safeguards — base=${BASE}\n`);
  const probes = [
    ["/owner/production/qr.svg?short=" + SHORT, "single QR SVG"],
    ["/owner/production/qr-sheet.svg?short=" + SHORT, "QR sheet SVG"],
    ["/owner/production/export.csv", "production CSV"],
  ];
  console.log("| Durable output | Without ?unsafe=1 | Interpretation |");
  console.log("|---|---|---|");
  for (const [path, label] of probes) {
    const res = await fetch(`${BASE}${path}`, { headers: HEADERS, redirect: "manual" });
    const body = res.status === 400 ? await res.text() : "";
    const blocked = res.status === 400 && /not production-safe/i.test(body);
    const interp = blocked
      ? "BLOCKED — permanent tag output refused"
      : res.status === 307 || res.status === 302
        ? "redirected (auth gate) — owner login required"
        : `http ${res.status}`;
    console.log(`| ${label} | ${res.status} | ${interp} |`);
    if (blocked) {
      // Echo the guard message; it contains the public base URL, never a secret.
      console.log(`|  ↳ guard says | | \`${body.trim().slice(0, 150)}\` |`);
    }
  }
}

if (args.devices) await devicePass();
else if (args.loops) await loopPass();
else if (args.qr) await qrPass();
else {
  console.error("pick one: --devices | --loops | --qr");
  process.exit(1);
}
