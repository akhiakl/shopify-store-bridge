import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildFailureSection,
  collectFailures,
  oneLine,
  parseEslint,
  parsePlaywright,
  parseTsc,
  parseVitest,
  renderCheck,
  tail,
} from "./quality-summary.mjs";

const ESC = String.fromCharCode(27);

describe("parsers", () => {
  it("reads ESLint errors per file, skipping warnings", () => {
    const log = [
      "",
      "/repo/app/a.ts",
      "  3:7  error    'x' is never used  no-unused-vars",
      "  4:1  warning  Unexpected console  no-console",
      "",
      "✖ 2 problems (1 error, 1 warning)",
    ].join("\n");
    expect(parseEslint(log)).toEqual([
      "`/repo/app/a.ts:3` 'x' is never used (no-unused-vars)",
    ]);
  });

  it("reads tsc errors", () => {
    expect(
      parseTsc("app/a.ts(12,5): error TS2322: Type 'string' is not 'number'."),
    ).toEqual(["`app/a.ts:12` TS2322: Type 'string' is not 'number'."]);
  });

  it("reads failed tests, load failures and coverage thresholds", () => {
    const results = {
      testResults: [
        {
          name: "app/a.test.ts",
          status: "failed",
          assertionResults: [
            { status: "passed", fullName: "ok" },
            {
              status: "failed",
              fullName: "A adds",
              failureMessages: [
                `${ESC}[31mexpected 2 to be 3${ESC}[0m\n  at x`,
              ],
            },
          ],
        },
        {
          name: "app/b.test.ts",
          status: "failed",
          message: "Cannot find module './b'",
          assertionResults: [],
        },
      ],
    };
    const log =
      "ERROR: Coverage for lines (79%) does not meet global threshold (80%)";
    expect(parseVitest(results, log)).toEqual([
      "`app/a.test.ts` › A adds: expected 2 to be 3",
      "`app/b.test.ts`: Cannot find module './b'",
      "Coverage for lines (79%) does not meet global threshold (80%)",
    ]);
    expect(parseVitest(undefined)).toEqual([]);
  });

  it("reads failed Playwright specs with their last attempt's error", () => {
    const results = {
      suites: [
        {
          title: "smoke.spec.ts",
          specs: [{ title: "loads", ok: true }],
          suites: [
            {
              title: "embedded",
              specs: [
                {
                  title: "redirects",
                  ok: false,
                  tests: [
                    {
                      results: [
                        { error: { message: "first try" } },
                        { error: { message: "Timed out\nmore" } },
                      ],
                    },
                  ],
                },
                { title: "no detail", ok: false },
              ],
            },
          ],
        },
      ],
    };
    expect(parsePlaywright(results)).toEqual([
      "smoke.spec.ts › embedded › redirects: Timed out",
      "smoke.spec.ts › embedded › no detail: failed",
    ]);
    expect(parsePlaywright(undefined)).toEqual([]);
  });

  it("shortens messages and logs", () => {
    expect(oneLine("x".repeat(300))).toHaveLength(200);
    expect(oneLine("\n\n")).toBe("");
    expect(oneLine(undefined)).toBe("");
    expect(tail("a\nb\nc\n", 2)).toBe("b\nc");
  });

  it("makes paths relative to the checkout", () => {
    process.env.GITHUB_WORKSPACE = "/repo";
    expect(parseTsc("/repo/app/a.ts(1,1): error TS1: x")).toEqual([
      "`app/a.ts:1` TS1: x",
    ]);
    delete process.env.GITHUB_WORKSPACE;
  });
});

describe("renderCheck", () => {
  const items = (n) => Array.from({ length: n }, (_, i) => `failure ${i}`);

  it("lists a few failures inline", () => {
    const md = renderCheck("Node 24", {
      name: "Typecheck",
      short: "2 type errors",
      items: items(2),
    });
    expect(md).toBe(
      "**Typecheck** (Node 24): 2 type errors\n\n- failure 0\n- failure 1",
    );
  });

  it("collapses many failures", () => {
    const md = renderCheck("Node 24", {
      name: "Lint",
      short: "6 errors",
      items: items(6),
    });
    expect(md).toContain("<details>\n<summary>Show all 6</summary>");
    expect(md).toContain("- failure 5");
  });

  it("shows the end of the log when nothing could be parsed", () => {
    expect(
      renderCheck("e2e", { name: "Build", short: "failed", log: "boom" }),
    ).toContain("<summary>Last lines of the log</summary>\n\n```\nboom\n```");
    expect(renderCheck("e2e", { name: "Build", short: "failed" })).toContain(
      "_No output captured._",
    );
  });
});

describe("artifacts", () => {
  let root;
  const write = (dir, files) => {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(
        path.join(root, dir, name),
        typeof body === "string" ? body : JSON.stringify(body),
      );
    }
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "quality-summary-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("reports nothing when every check passed", () => {
    write("ci-results-node-24", { "outcomes.json": { lint: "success" } });
    expect(buildFailureSection(root)).toBe("");
    expect(buildFailureSection(path.join(root, "missing"))).toBe("");
  });

  it("reports identical Node legs once, and each job's failing checks", () => {
    const leg = {
      "outcomes.json": {
        lint: "success",
        typecheck: "failure",
        build: "failure",
      },
      "typecheck.log": "app/a.ts(1,1): error TS2304: Cannot find name 'x'.",
      "build.log": "building\nError: out of memory",
    };
    write("ci-results-node-22", leg);
    write("ci-results-node-24", leg);
    write("ci-results-e2e", {
      "outcomes.json": { migrate: "failure" },
      "migrate.log": "applying migrations...",
    });

    const md = buildFailureSection(root);
    expect(md.startsWith("### Failures")).toBe(true);
    expect(md).toContain("**Typecheck** (Node 22 & Node 24): 1 type error");
    expect(md).toContain("**Build** (Node 22 & Node 24): failed");
    expect(md).toContain("**Database migrations** (e2e): failed");
    expect(md).toContain("applying migrations...");
  });

  it("falls back to the log when a failed check left nothing to parse", () => {
    write("ci-results-e2e", {
      "outcomes.json": { e2e: "failure" },
      "e2e.log": "webServer timed out",
    });
    expect(collectFailures(path.join(root, "ci-results-e2e"))).toEqual([
      { name: "End-to-end tests", short: "failed", log: "webServer timed out" },
    ]);
  });
});
