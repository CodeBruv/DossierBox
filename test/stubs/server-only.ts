/**
 * No-op stand-in for the `server-only` package, used by Vitest only.
 *
 * Ten modules in `src/` open with `import "server-only"` so that a client
 * component importing them fails the build instead of leaking database access,
 * secrets or session logic into the browser bundle. That guard is load-bearing
 * and must stay exactly where it is.
 *
 * It is, however, unresolvable under Vitest: `server-only` is not installed as a
 * top-level package here. It ships inside Next as
 * `next/dist/compiled/server-only`, whose `exports` map resolves to a throwing
 * module outside a `react-server` environment. So any unit test that touches one
 * of those ten modules — even to exercise a pure helper beside them — dies on
 * the import rather than on anything it was testing.
 *
 * `vitest.config.ts` aliases the bare specifier to this file to close that gap.
 * Two reasons it points here rather than at Next's copy: this does not depend on
 * a private path inside another package that can move between Next releases, and
 * it makes the substitution visible to anyone reading the test setup.
 *
 * It also replaces a per-file `vi.mock("server-only", () => ({}))` that two test
 * files carried above their imports. That hack only ever covered the files that
 * remembered it — `auth/session.test.ts` did not, and failed — and it asked
 * Vitest to resolve the very specifier that cannot be resolved before it could
 * register the mock. Resolution is the right layer for this, not each test file.
 *
 * This changes nothing about production. Next never reads `vitest.config.ts`, so
 * `next build` still resolves the real `server-only` and still fails a build that
 * imports a server module from client code. The boundary is enforced by the build
 * that ships; this only stops the test runner from tripping over it.
 */

export {};
