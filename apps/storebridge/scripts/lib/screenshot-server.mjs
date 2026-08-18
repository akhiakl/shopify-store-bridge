import { spawn } from "node:child_process";

/**
 * Starts the app's production server (`npm run start` — assumes `npm run
 * build` already ran) and resolves once it responds, or rejects if it
 * doesn't come up within `timeoutMs`. Mirrors playwright.config.ts's own
 * webServer block, but driven manually since this script isn't a Playwright
 * test and shouldn't go through the `playwright test` runner.
 */
export function startServer({ port, env, timeoutMs = 60_000 }) {
  const child = spawn("npm", ["run", "start"], {
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));

  const baseUrl = `http://localhost:${port}`;
  const deadline = Date.now() + timeoutMs;

  const ready = (async () => {
    while (Date.now() < deadline) {
      try {
        const res = await fetch(baseUrl);
        if (res.status < 500) return;
      } catch {
        // Not listening yet - keep polling.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(
      `App server didn't respond on ${baseUrl} within ${timeoutMs}ms.\n${output}`,
    );
  })();

  return {
    baseUrl,
    ready,
    // Awaited by callers before resetting DB fixtures - a fire-and-forget
    // SIGTERM would let resetScenarios() race the server's own in-flight
    // Prisma queries. SIGKILL after a grace period covers a child that
    // ignores SIGTERM instead of leaving it orphaned.
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolve();
          return;
        }
        const forceKill = setTimeout(() => child.kill("SIGKILL"), 5_000);
        child.once("exit", () => {
          clearTimeout(forceKill);
          resolve();
        });
        child.kill("SIGTERM");
      }),
  };
}
