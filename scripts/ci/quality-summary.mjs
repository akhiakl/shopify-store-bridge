// Builds the failure part of the Quality Gate PR comment from the
// `ci-results-*` artifacts the verify and e2e jobs upload (see ci.yml):
// one short line per failing check, with the individual failures listed
// below it, collapsed into a <details> block when there are many.
import fs from "node:fs";
import path from "node:path";

/** Lists longer than this collapse into a <details> block. */
export const INLINE_LIMIT = 5;
const MESSAGE_LENGTH = 200;

// Terminal color codes (ESC [ ... m), built from the char code since a
// literal escape in a regex trips no-control-regex.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** One readable line: no colors, first line only, capped in length. */
export function oneLine(text) {
  const line = String(text ?? "")
    .replace(ANSI, "")
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) return "";
  return line.length > MESSAGE_LENGTH
    ? `${line.slice(0, MESSAGE_LENGTH - 1)}…`
    : line;
}

/** Paths relative to the checkout, so they read the same on any runner. */
function relative(file) {
  const root = process.env.GITHUB_WORKSPACE;
  return root && file.startsWith(root) ? path.relative(root, file) : file;
}

/** ESLint's default (stylish) output: a file path line, then one line per
 * problem under it. Warnings don't fail lint, so only errors count. */
export function parseEslint(log) {
  const failures = [];
  let file = "";
  for (const raw of log.replace(ANSI, "").split("\n")) {
    if (/^\S.*\.(?:[cm]?[jt]sx?)$/.test(raw.trim()) && !raw.startsWith(" ")) {
      file = relative(raw.trim());
      continue;
    }
    const match = raw.match(/^\s+(\d+):\d+\s+error\s+(.+?)\s{2,}(\S+)\s*$/);
    if (match) {
      failures.push(`\`${file}:${match[1]}\` ${match[2]} (${match[3]})`);
    }
  }
  return failures;
}

/** `tsc` errors: `file(line,col): error TS1234: message`. */
export function parseTsc(log) {
  const failures = [];
  for (const raw of log.replace(ANSI, "").split("\n")) {
    const match = raw.match(/^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/);
    if (match) {
      failures.push(
        `\`${relative(match[1])}:${match[2]}\` ${match[3]}: ${oneLine(match[4])}`,
      );
    }
  }
  return failures;
}

/** Vitest's JSON reporter: failed tests, files that failed to load, and
 * coverage thresholds (those only show in the log). */
export function parseVitest(results, log = "") {
  const failures = [];
  for (const file of results?.testResults ?? []) {
    const failed = (file.assertionResults ?? []).filter(
      (test) => test.status === "failed",
    );
    for (const test of failed) {
      failures.push(
        `\`${relative(file.name)}\` › ${test.fullName}: ${oneLine(test.failureMessages?.[0])}`,
      );
    }
    if (failed.length === 0 && file.status === "failed" && file.message) {
      failures.push(`\`${relative(file.name)}\`: ${oneLine(file.message)}`);
    }
  }
  for (const raw of log.replace(ANSI, "").split("\n")) {
    if (/does not meet .*threshold/i.test(raw)) {
      failures.push(oneLine(raw.replace(/^ERROR:\s*/, "")));
    }
  }
  return failures;
}

/** Playwright's JSON reporter: every spec that didn't pass, with the
 * error from its last attempt (CI retries twice). */
export function parsePlaywright(results) {
  const failures = [];
  const walk = (suite, titles) => {
    const here = suite.title ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      if (spec.ok) continue;
      const attempts = spec.tests?.[0]?.results ?? [];
      const error = attempts[attempts.length - 1]?.error?.message;
      failures.push(
        `${[...here, spec.title].join(" › ")}: ${oneLine(error) || "failed"}`,
      );
    }
    for (const child of suite.suites ?? []) walk(child, here);
  };
  for (const suite of results?.suites ?? []) walk(suite, []);
  return failures;
}

/** The last lines of a log, for a step whose output has no structure. */
export function tail(log, lines = 15) {
  return log.replace(ANSI, "").trimEnd().split("\n").slice(-lines).join("\n");
}

function read(dir, name) {
  try {
    return fs.readFileSync(path.join(dir, name), "utf8");
  } catch {
    return "";
  }
}

function readJson(dir, name) {
  try {
    return JSON.parse(read(dir, name));
  } catch {
    return undefined;
  }
}

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** What each step's failure is called, where its output is, and how to
 * read it (no parser: show the end of the log). In run order. */
const STEPS = [
  { step: "install", name: "Install", log: "install.log" },
  {
    step: "lint",
    name: "Lint",
    log: "lint.log",
    unit: "error",
    parse: (dir) => parseEslint(read(dir, "lint.log")),
  },
  { step: "codegen", name: "GraphQL codegen", log: "codegen.log" },
  {
    step: "typecheck",
    name: "Typecheck",
    log: "typecheck.log",
    unit: "type error",
    parse: (dir) => parseTsc(read(dir, "typecheck.log")),
  },
  {
    step: "test",
    name: "Unit tests",
    log: "test.log",
    unit: "failure",
    parse: (dir) =>
      parseVitest(readJson(dir, "test-results.json"), read(dir, "test.log")),
  },
  { step: "build", name: "Build", log: "build.log" },
  { step: "migrate", name: "Database migrations", log: "migrate.log" },
  {
    step: "e2e",
    name: "End-to-end tests",
    log: "e2e.log",
    unit: "failed test",
    parse: (dir) => parsePlaywright(readJson(dir, "playwright-results.json")),
  },
];

/** Each failing check of one job: its name, a short count, and either the
 * failures themselves or, when there's nothing to parse, the end of its
 * log. `outcomes.json` maps step ids to GitHub's step outcomes. */
export function collectFailures(dir) {
  const outcomes = readJson(dir, "outcomes.json") ?? {};
  return STEPS.filter(({ step }) => outcomes[step] === "failure").map(
    ({ name, log, unit, parse }) => {
      const items = parse ? parse(dir) : [];
      return items.length > 0
        ? { name, short: plural(items.length, unit), items }
        : { name, short: "failed", log: tail(read(dir, log)) };
    },
  );
}

function details(summary, body) {
  return [
    "<details>",
    `<summary>${summary}</summary>`,
    "",
    body,
    "",
    "</details>",
  ].join("\n");
}

/** Markdown for one check: its failures inline when there are a few,
 * collapsed when there are many, or the end of its log. */
export function renderCheck(label, check) {
  const heading = `**${check.name}** (${label}): ${check.short}`;
  if (check.items?.length) {
    const list = check.items.map((item) => `- ${item}`).join("\n");
    return check.items.length > INLINE_LIMIT
      ? `${heading}\n\n${details(`Show all ${check.items.length}`, list)}`
      : `${heading}\n\n${list}`;
  }
  const log = check.log
    ? `\`\`\`\n${check.log}\n\`\`\``
    : "_No output captured._";
  return `${heading}\n\n${details("Last lines of the log", log)}`;
}

/**
 * The comment's failure section from `<root>/ci-results-*` artifact
 * folders. Jobs whose failures are identical (both Node legs failing the
 * same way) are reported once. Returns "" when nothing failed.
 */
export function buildFailureSection(root) {
  const jobs = [];
  let dirs = [];
  try {
    dirs = fs
      .readdirSync(root)
      .filter((name) => name.startsWith("ci-results-"))
      .sort();
  } catch {
    return "";
  }
  for (const name of dirs) {
    const label = name.replace("ci-results-", "").replace("node-", "Node ");
    const checks = collectFailures(path.join(root, name));
    if (checks.length === 0) continue;
    const key = JSON.stringify(checks);
    const same = jobs.find((job) => job.key === key);
    if (same) same.labels.push(label);
    else jobs.push({ key, labels: [label], checks });
  }
  if (jobs.length === 0) return "";

  const sections = jobs.flatMap((job) =>
    job.checks.map((check) => renderCheck(job.labels.join(" & "), check)),
  );
  return ["### Failures", "", sections.join("\n\n")].join("\n");
}
