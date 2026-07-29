// Vitest stub for the `server-only` / `client-only` marker packages. They intentionally throw when
// imported outside their target environment; under the node test runner we replace them with a no-op so
// server modules (e.g. lib/ratelimit/*) can be unit-tested. This changes nothing at build/runtime — the
// real packages still enforce the boundary in the app.
export {};
