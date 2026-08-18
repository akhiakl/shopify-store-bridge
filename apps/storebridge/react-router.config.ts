import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  ssr: true,
  // Vercel sets the VERCEL env var during its own build step. Everywhere
  // else (local dev, Docker/react-router-serve) this stays a no-op so the
  // existing Node server build is unaffected.
  presets: process.env.VERCEL ? [vercelPreset()] : [],
} satisfies Config;
