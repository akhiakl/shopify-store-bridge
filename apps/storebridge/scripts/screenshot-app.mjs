#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "@playwright/test";

import { startServer } from "./lib/screenshot-server.mjs";
import {
  seedScenarios,
  signSessionToken,
  resetScenarios,
  teardown,
} from "./lib/screenshot-fixtures.mjs";

// See scripts/README.md for what this generates and why it's mocked rather
// than run against a real Shopify store.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.resolve(ROOT, "docs/screenshots");
const MOCK_CSS = readFileSync(path.join(__dirname, "mock-polaris.css"), "utf8");

const API_KEY = "screenshot-fixture-key";
const API_SECRET = "screenshot-fixture-secret";
const PORT = 3900;

/** Any local machine's Chromium works; this path just skips a redundant
 * download when the sandbox's pre-installed browser is present. */
const CHROMIUM_PATH = "/opt/pw-browsers/chromium";
const executablePath = existsSync(CHROMIUM_PATH) ? CHROMIUM_PATH : undefined;

async function screenshotRoute(page, { baseUrl, shop, route, outFile }) {
  const token = signSessionToken(shop, API_KEY, API_SECRET);
  await page.context().setExtraHTTPHeaders({
    Authorization: `Bearer ${token}`,
  });
  await page.goto(`${baseUrl}${route}?shop=${shop}&embedded=1`, {
    waitUntil: "load",
  });
  await page.addStyleTag({ content: MOCK_CSS });
  await page.waitForSelector("s-page");
  await page.screenshot({ path: outFile, fullPage: true });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must point at a migrated Postgres database (npx prisma migrate deploy first).",
    );
  }
  mkdirSync(OUT_DIR, { recursive: true });

  if (!existsSync(path.join(ROOT, "build/server/index.js"))) {
    throw new Error("Run `npm run build` first - no build/server/index.js found.");
  }

  const { emptyShop, mainShop } = await seedScenarios();

  const server = startServer({
    port: PORT,
    env: {
      NODE_ENV: "production",
      SHOPIFY_API_KEY: API_KEY,
      SHOPIFY_API_SECRET: API_SECRET,
      SCOPES: "read_products",
      SHOPIFY_APP_URL: `http://localhost:${PORT}`,
      DATABASE_URL: process.env.DATABASE_URL,
    },
  });

  try {
    await server.ready;

    const browser = await chromium.launch({ executablePath });
    // cdn.shopify.com (real Polaris + App Bridge + the Inter font sheet) is
    // unreachable from this environment's network policy - short-circuit
    // those requests instead of letting them fail slowly, and rely on
    // mock-polaris.css (added per-page below) for legible styling instead.
    // authenticate.admin() rejects bot-looking requests with 410 before
    // even checking the session token (see @shopify/shopify-app-react-router's
    // respondToBotRequest, via the `isbot` package) - Playwright's default
    // headless UA string ("HeadlessChrome") matches that check, so a real
    // desktop UA is required for the app to render at all here.
    const context = await browser.newContext({ ...devices["Desktop Chrome"] });
    await context.route("https://cdn.shopify.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/plain", body: "" }),
    );
    const page = await context.newPage();

    await screenshotRoute(page, {
      baseUrl: server.baseUrl,
      shop: emptyShop,
      route: "/app/stores",
      outFile: path.join(OUT_DIR, "stores-empty.png"),
    });
    await screenshotRoute(page, {
      baseUrl: server.baseUrl,
      shop: mainShop,
      route: "/app/stores",
      outFile: path.join(OUT_DIR, "stores-populated.png"),
    });

    await browser.close();
    console.log(`Screenshots written to ${OUT_DIR}`);
  } finally {
    server.stop();
    await resetScenarios();
    await teardown();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
