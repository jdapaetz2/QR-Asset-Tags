import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  GRANT_PARITY_SQL,
  STANDALONE_IMAGE,
  STANDALONE_PORT,
  assertLoopbackTargets,
  blockedPorts,
  configuredPorts,
  listenerProblems,
  localParityBlocks,
  loopbackProblem,
  parseExcludedPortRanges,
  portExclusionCommands,
  standaloneDbUrl,
  standalonePostgresPlan,
} from "./local-stack.mjs";

// The Phase E1 local-target guard (scripts/lib/local-stack.mjs): both URLs loopback, the standalone container bound
// explicitly to 127.0.0.1 with data in memory, and the listener check that gates loading a real archive.

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("loopback guard", () => {
  it("accepts loopback API and DB URLs only", () => {
    expect(loopbackProblem("API URL", "http://127.0.0.1:54321")).toBeNull();
    expect(loopbackProblem("DB URL", "postgresql://postgres:postgres@localhost:54322/postgres")).toBeNull();
    expect(loopbackProblem("DB URL", "postgresql://u:p@[::1]:5432/db")).toBeNull();
    expect(loopbackProblem("DB URL", "postgresql://u:p@db.apeiswnkheiwrpvumder.supabase.co:5432/postgres")).toBe(
      "DB URL is not loopback (host: db.apeiswnkheiwrpvumder.supabase.co)"
    );
    expect(loopbackProblem("API URL", "http://192.168.1.20:54321")).toMatch(/not loopback/);
    // 0.0.0.0 is a bind-all address, not a loopback destination.
    expect(loopbackProblem("API URL", "http://0.0.0.0:54321")).toMatch(/not loopback/);
    expect(loopbackProblem("API URL", "not a url")).toBe("API URL is not a valid URL");
  });

  it("checks BOTH URLs and names every problem without echoing credentials", () => {
    expect(() => assertLoopbackTargets({ "API URL": "http://127.0.0.1:54321", "DB URL": "postgresql://postgres:secret@localhost:54322/postgres" })).not.toThrow();
    let message = "";
    try {
      assertLoopbackTargets({ "API URL": "http://127.0.0.1:54321", "DB URL": "postgresql://postgres:secret@db.example.supabase.co:5432/postgres" });
    } catch (err) {
      message = err.message;
    }
    expect(message).toMatch(/refusing to touch a non-local database: DB URL is not loopback/);
    expect(message).not.toContain("secret");
    expect(() => assertLoopbackTargets({ "API URL": undefined, "DB URL": "postgresql://u:p@127.0.0.1:1/x" })).not.toThrow();
  });
});

describe("standalone restore target", () => {
  it("binds explicitly to 127.0.0.1, keeps data on tmpfs, removes itself and mounts no volume", () => {
    const plan = standalonePostgresPlan("pw");
    expect(plan).toContain(`127.0.0.1:${STANDALONE_PORT}:5432`);
    expect(plan.slice(plan.indexOf("--tmpfs"), plan.indexOf("--tmpfs") + 2)).toEqual(["--tmpfs", "/var/lib/postgresql/data:rw"]);
    expect(plan).toContain("--rm");
    expect(plan).not.toContain("-v");
    expect(plan).not.toContain("--volume");
    expect(plan).not.toContain("--mount");
    expect(plan.filter((a) => /^-p$|^--publish$/.test(a))).toHaveLength(1);
    expect(plan.at(-1)).toBe(STANDALONE_IMAGE);
    expect(new URL(standaloneDbUrl("p@ss/word")).hostname).toBe("127.0.0.1");
    expect(new URL(standaloneDbUrl("p@ss/word")).port).toBe(String(STANDALONE_PORT));
  });

  it("requires every listener on the port to be loopback, and at least one", () => {
    const port = STANDALONE_PORT;
    expect(listenerProblems([{ LocalAddress: "127.0.0.1", LocalPort: port }], [port])).toEqual([]);
    expect(listenerProblems([{ LocalAddress: "::1", LocalPort: port }, { LocalAddress: "127.0.0.1", LocalPort: port }], [port])).toEqual([]);
    expect(listenerProblems([], [port])).toEqual([`nothing is listening on ${port}`]);
    expect(listenerProblems([{ LocalAddress: "0.0.0.0", LocalPort: port }], [port])).toEqual([`port ${port} listens on 0.0.0.0 (not loopback)`]);
    expect(listenerProblems([{ LocalAddress: "127.0.0.1", LocalPort: port }, { LocalAddress: "::", LocalPort: port }], [port])).toEqual([
      `port ${port} listens on :: (not loopback)`,
    ]);
    expect(listenerProblems([{ LocalAddress: "192.168.1.20", LocalPort: String(port) }], [port])).toHaveLength(1);
  });
});

describe("grant parity", () => {
  it("never widens anon and re-applies the service-role-only revokes", () => {
    expect(GRANT_PARITY_SQL).not.toMatch(/to\s+anon/i);
    expect(GRANT_PARITY_SQL).toMatch(/revoke all on public\.rate_limit_counters from anon, authenticated/);
    expect(GRANT_PARITY_SQL).toMatch(/revoke all on public\.notification_digest_runs from anon, authenticated/);
  });

  it("reads each migration's local-parity block", () => {
    const blocks = localParityBlocks(REPO);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startsWith("-- local-parity:begin")).toBe(true);
  });
});

describe("Windows port reservations (2026-11-26)", () => {
  // Trimmed `netsh interface ipv4 show excludedportrange protocol=tcp` output (CRLF, as netsh prints it) from the
  // 2026-11-20 failure, when Windows held 54318–54417, plus one administered row.
  const NETSH = [
    "",
    "Protocol tcp Port Exclusion Ranges",
    "",
    "Start Port    End Port      ",
    "----------    --------      ",
    "      5357        5357      ",
    "     54218       54317      ",
    "     54318       54417      ",
    "     55432       55432     *",
    "",
    "* - Administered port exclusions.",
    "",
  ].join("\r\n");

  it("reads Windows' own reservations and the administered ones", () => {
    expect(parseExcludedPortRanges(NETSH)).toEqual([
      { start: 5357, end: 5357, administered: false },
      { start: 54218, end: 54317, administered: false },
      { start: 54318, end: 54417, administered: false },
      { start: 55432, end: 55432, administered: true },
    ]);
    expect(parseExcludedPortRanges("")).toEqual([]);
  });

  it("reads the stack's ports from config.toml and skips commented-out services", () => {
    const toml = [
      "[api]",
      "port = 54321",
      "[db]",
      "port = 54322 # the database",
      "shadow_port = 54320",
      "[inbucket]",
      "port = 54324",
      "# smtp_port = 54325",
      "  # port = 587",
      'site_url = "http://127.0.0.1:3000"',
      "[edge_runtime]",
      "inspector_port = 8083",
    ].join("\r\n");
    expect(configuredPorts(toml)).toEqual([8083, 54320, 54321, 54322, 54324]);
  });

  it("blocks only ports inside Windows' own reservations", () => {
    const ranges = parseExcludedPortRanges(NETSH);
    // 2026-11-20: Windows' 54318–54417 covered every local Supabase port.
    expect(blockedPorts([8083, 54320, 54321, 54322, 54329], ranges)).toEqual([54320, 54321, 54322, 54329]);
    // An administered (operator's) range is not a block.
    expect(blockedPorts([STANDALONE_PORT], ranges)).toEqual([]);
    expect(blockedPorts([54321], [{ start: 54320, end: 54324, administered: true }])).toEqual([]);
    expect(blockedPorts([54321], [])).toEqual([]);
  });

  it("prints one netsh line per run of ports, skipping ports already set aside and those below the dynamic range", () => {
    expect(portExclusionCommands([54322, 54320, 54321, 54321, 54327, 8083])).toEqual([
      "netsh int ipv4 add excludedportrange protocol=tcp startport=54320 numberofports=3",
      "netsh int ipv4 add excludedportrange protocol=tcp startport=54327 numberofports=1",
    ]);
    const ranges = [
      { start: 54320, end: 54324, administered: true },
      { start: 55400, end: 55499, administered: false },
    ];
    expect(portExclusionCommands([54320, 54321, STANDALONE_PORT], ranges)).toEqual([
      "netsh int ipv4 add excludedportrange protocol=tcp startport=55432 numberofports=1",
    ]);
    expect(portExclusionCommands([])).toEqual([]);
  });

  it("documents exactly the netsh lines the repo's config.toml and the standalone port need", () => {
    const ports = [...configuredPorts(readFileSync(path.join(REPO, "supabase", "config.toml"), "utf8")), STANDALONE_PORT];
    const commands = portExclusionCommands(ports);
    // 54325 (SMTP) and 54326 (POP3) are commented out in config.toml, so they are left free.
    expect(commands).toEqual([
      "netsh int ipv4 add excludedportrange protocol=tcp startport=54320 numberofports=5",
      "netsh int ipv4 add excludedportrange protocol=tcp startport=54327 numberofports=1",
      "netsh int ipv4 add excludedportrange protocol=tcp startport=54329 numberofports=1",
      "netsh int ipv4 add excludedportrange protocol=tcp startport=55432 numberofports=1",
    ]);
    const doc = readFileSync(path.join(REPO, "docs", "E2E_TESTING.md"), "utf8");
    for (const command of commands) expect(doc).toContain(command);
  });
});
