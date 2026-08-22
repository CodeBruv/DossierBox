#!/usr/bin/env node
/**
 * Route latency measurement.
 *
 * The development server prints "Compiling /profile ..." and then "GET /profile
 * 200 in 6.5s". Those two numbers are not separable from the log: the reported
 * duration for the first request to a route includes compiling it. Reading that
 * log and concluding the application is slow — or concluding it is only slow
 * because of Turbopack — is guesswork either way.
 *
 * This script separates them by measuring the same route several times in a row
 * within one server process. The first request pays for compilation; the ones
 * after it do not, because the route is already built. So:
 *
 *   cold             = compile + render + data
 *   warm (median)    = render + data          <- the real request latency
 *   cold - warm      = what compilation cost  <- disappears in production
 *
 * Only the warm figure describes what a user experiences on a deployed build.
 * Optimise against that number. A large cold/warm gap is a development-mode
 * characteristic; a large warm number is an application problem.
 *
 * It also splits each request into time-to-first-byte and body transfer. With
 * streaming SSR, TTFB is roughly "the server finished the blocking work" — for
 * these pages that is session lookup plus database reads — so a warm request
 * whose time sits almost entirely in TTFB is waiting on data, not on rendering
 * or on the network.
 *
 * Usage
 *   node ./scripts/measure-routes.mjs                        (public routes)
 *   node ./scripts/measure-routes.mjs --cookie "$COOKIE"     (signed in)
 *   node ./scripts/measure-routes.mjs --runs 6 --json
 *
 * Options
 *   --base <url>     Server to measure. Default http://localhost:3000
 *   --runs <n>       Requests per route, first is cold. Default 4
 *   --cookie <str>   Cookie header. Or set MEASURE_ROUTES_COOKIE
 *   --routes <list>  Comma-separated paths, replaces the default set
 *   --json           Machine-readable output
 *   --timeout <ms>   Per-request timeout. Default 60000
 *
 * Getting a session cookie: sign in normally, then copy the Cookie header from
 * any document request in the browser's network panel. It contains a live
 * session token, so treat it as a credential — pass it by environment variable
 * rather than typing it into a shared terminal, and do not commit it.
 *
 * Authenticated routes redirect to sign-in without a valid cookie. That redirect
 * is fast and measures almost nothing, so the script marks those rows instead of
 * letting them be misread as good news.
 */

const DEFAULT_ROUTES = [
  "/",
  "/home",
  "/account",
  "/documents",
  "/profile",
  "/profile/basics",
  "/profile/sections",
  "/profile/experience",
  "/profile/education",
  "/profile/skills",
  "/profile/projects",
  "/profile/credentials",
  "/profile/languages",
  "/profile/memberships",
  "/profile/links",
  "/profile/review",
];

/** Routes that only make sense signed in; used to explain redirects. */
const AUTHENTICATED_PREFIXES = ["/home", "/account", "/documents", "/profile"];

const options = parseArguments(process.argv.slice(2));

if (options.help) {
  process.stdout.write(usage());
  process.exit(0);
}

const routes = options.routes ?? DEFAULT_ROUTES;
const cookie = options.cookie ?? process.env.MEASURE_ROUTES_COOKIE ?? null;

await main();

async function main() {
  const reachable = await checkServer();
  if (!reachable.ok) {
    fail(
      `Could not reach ${options.base} (${reachable.reason}).\n` +
        "Start the server first — `npm run dev` for development timings, or " +
        "`npm run build && npm run start` for production timings.",
    );
  }

  if (!options.json) {
    process.stdout.write(
      `Measuring ${routes.length} routes on ${options.base}\n` +
        `${options.runs} requests each (1 cold, ${options.runs - 1} warm)` +
        `${cookie ? ", with a session cookie" : ", no session cookie"}\n\n`,
    );
  }

  const results = [];
  for (const route of routes) {
    const measurement = await measureRoute(route);
    results.push(measurement);
    if (!options.json) process.stdout.write(formatRow(measurement) + "\n");
  }

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        {
          base: options.base,
          runs: options.runs,
          authenticated: Boolean(cookie),
          measuredAt: new Date().toISOString(),
          routes: results,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  process.stdout.write("\n" + summarise(results));
}

async function measureRoute(route) {
  const attempts = [];

  for (let index = 0; index < options.runs; index += 1) {
    attempts.push(await timeRequest(route));
  }

  const successful = attempts.filter((attempt) => !attempt.error);
  const cold = attempts[0];
  const warm = successful.slice(1);

  const warmTotals = warm.map((attempt) => attempt.total);
  const warmTtfbs = warm.map((attempt) => attempt.ttfb);

  return {
    route,
    status: cold.status ?? null,
    error: successful.length ? null : cold.error,
    redirectedTo: cold.location ?? null,
    /**
     * A redirect away from an authenticated route means the page itself was
     * never rendered, so its timings describe the redirect and nothing else.
     */
    skippedBecauseSignedOut:
      isAuthenticatedRoute(route) && isRedirect(cold.status) && !cookie,
    bytes: cold.bytes ?? null,
    coldTotal: cold.total ?? null,
    coldTtfb: cold.ttfb ?? null,
    warmMedian: median(warmTotals),
    warmMin: warmTotals.length ? Math.min(...warmTotals) : null,
    warmMax: warmTotals.length ? Math.max(...warmTotals) : null,
    warmTtfbMedian: median(warmTtfbs),
    /**
     * Attributed to compilation rather than measured directly. Nothing else
     * changes between the first and later requests in one process, but the
     * figure still includes any one-off lazy initialisation on that path —
     * a first database connection, for instance.
     */
    compileCost:
      cold.total !== undefined && median(warmTotals) !== null
        ? Math.max(0, round(cold.total - median(warmTotals)))
        : null,
    attempts: attempts.map((attempt) => ({
      total: attempt.total ?? null,
      ttfb: attempt.ttfb ?? null,
      status: attempt.status ?? null,
      error: attempt.error ?? null,
    })),
  };
}

async function timeRequest(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout);
  const started = performance.now();

  try {
    const response = await fetch(new URL(path, options.base), {
      // Manual redirects keep a 307 to sign-in as its own measurement instead of
      // silently folding the sign-in page's timing into the route being tested.
      redirect: "manual",
      signal: controller.signal,
      headers: {
        // Asking for HTML avoids being served an RSC payload, which has a
        // different cost profile from a document request.
        accept: "text/html,application/xhtml+xml",
        "cache-control": "no-cache",
        ...(cookie ? { cookie } : {}),
      },
    });

    const headersAt = performance.now();
    const body = await response.arrayBuffer();
    const finishedAt = performance.now();

    return {
      status: response.status,
      location: response.headers.get("location"),
      bytes: body.byteLength,
      ttfb: round(headersAt - started),
      total: round(finishedAt - started),
    };
  } catch (error) {
    return {
      error:
        error.name === "AbortError"
          ? `timed out after ${options.timeout}ms`
          : (error.cause?.message ?? error.message),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkServer() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout);
    await fetch(new URL("/", options.base), {
      redirect: "manual",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.cause?.message ?? error.message };
  }
}

function formatRow(result) {
  const label = result.route.padEnd(22);

  if (result.error) {
    return `${label} FAILED  ${result.error}`;
  }

  const status = String(result.status).padEnd(4);
  const cold = `${ms(result.coldTotal)} cold`.padEnd(14);
  const warm = `${ms(result.warmMedian)} warm`.padEnd(14);
  const ttfb = `${ms(result.warmTtfbMedian)} ttfb`.padEnd(14);
  const compile = result.compileCost ? `+${ms(result.compileCost)} compile` : "";

  const notes = [];
  if (result.skippedBecauseSignedOut) {
    notes.push(`redirect to ${short(result.redirectedTo)} — not the page, pass --cookie`);
  } else if (isRedirect(result.status)) {
    notes.push(`redirect to ${short(result.redirectedTo)}`);
  }

  return `${label} ${status} ${cold}${warm}${ttfb}${compile}${
    notes.length ? `\n${" ".repeat(23)}↳ ${notes.join("; ")}` : ""
  }`;
}

function summarise(results) {
  const measured = results.filter(
    (result) => !result.error && !result.skippedBecauseSignedOut && result.warmMedian !== null,
  );

  if (!measured.length) {
    return (
      "No page was actually rendered.\n" +
      (cookie
        ? "Every route failed or redirected. Check the server logs.\n"
        : "Authenticated routes redirected to sign-in. Re-run with --cookie to " +
          "measure them.\n")
    );
  }

  const slowest = [...measured].sort((a, b) => b.warmMedian - a.warmMedian).slice(0, 5);
  const compileTotal = measured.reduce((sum, result) => sum + (result.compileCost ?? 0), 0);
  const warmTotal = measured.reduce((sum, result) => sum + result.warmMedian, 0);
  const ttfbShare = measured.reduce(
    (sum, result) => sum + (result.warmTtfbMedian ?? 0),
    0,
  );

  const lines = [
    `Measured ${measured.length} rendered route(s).`,
    "",
    `Real request latency (warm total):   ${ms(round(warmTotal))}`,
    `Attributed to compilation (cold-warm): ${ms(round(compileTotal))}`,
    `Share of warm time spent before first byte: ${percent(ttfbShare, warmTotal)}`,
    "",
    "Slowest routes by warm median:",
    ...slowest.map(
      (result) =>
        `  ${result.route.padEnd(22)} ${ms(result.warmMedian)}` +
        ` (${ms(result.warmTtfbMedian)} before first byte)`,
    ),
    "",
    "Reading this:",
    `  · Compilation is ${percent(compileTotal, warmTotal + compileTotal)} of the` +
      " cold numbers in the dev log. That cost does not exist in a production" +
      " build — measure `npm run start` to confirm.",
    "  · A warm request that is nearly all time-to-first-byte is waiting on the" +
      " session lookup and database reads, not on rendering.",
    "  · Compare warm medians before and after a change. Cold numbers mostly" +
      " measure the bundler.",
  ];

  return lines.join("\n") + "\n";
}

function parseArguments(argv) {
  const parsed = {
    base: "http://localhost:3000",
    runs: 4,
    timeout: 60_000,
    json: false,
    help: false,
    cookie: undefined,
    routes: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        fail(`${argument} needs a value.`);
      }
      index += 1;
      return value;
    };

    switch (argument) {
      case "--base":
        parsed.base = next();
        break;
      case "--runs":
        parsed.runs = positiveInteger(next(), "--runs");
        break;
      case "--timeout":
        parsed.timeout = positiveInteger(next(), "--timeout");
        break;
      case "--cookie":
        parsed.cookie = next();
        break;
      case "--routes":
        parsed.routes = next()
          .split(",")
          .map((route) => route.trim())
          .filter(Boolean);
        break;
      case "--json":
        parsed.json = true;
        break;
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      default:
        fail(`Unknown option: ${argument}`);
    }
  }

  if (parsed.runs < 2) {
    fail("--runs must be at least 2: one cold request and one warm request.");
  }

  return parsed;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    fail(`${name} must be a positive whole number.`);
  }
  return parsed;
}

function isAuthenticatedRoute(route) {
  return AUTHENTICATED_PREFIXES.some(
    (prefix) => route === prefix || route.startsWith(`${prefix}/`),
  );
}

function isRedirect(status) {
  return typeof status === "number" && status >= 300 && status < 400;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return round(
    sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
  );
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function ms(value) {
  if (value === null || value === undefined) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

function percent(part, whole) {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

function short(value) {
  if (!value) return "elsewhere";
  try {
    const url = new URL(value, options.base);
    return url.pathname;
  } catch {
    return value;
  }
}

function usage() {
  return [
    "Measure route latency, separating dev-server compile time from real request time.",
    "",
    "  node ./scripts/measure-routes.mjs [options]",
    "",
    "  --base <url>     Server to measure (default http://localhost:3000)",
    "  --runs <n>       Requests per route, first is cold (default 4)",
    "  --cookie <str>   Cookie header for authenticated routes",
    "                   (or set MEASURE_ROUTES_COOKIE)",
    "  --routes <list>  Comma-separated paths, replaces the default set",
    "  --json           Machine-readable output",
    "  --timeout <ms>   Per-request timeout (default 60000)",
    "",
  ].join("\n");
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
