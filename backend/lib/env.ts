import { config } from "dotenv";

/**
 * Loads environment variables from a local file.
 *
 * `dotenv` was a dependency but nothing ever called it, so `.env.local` was
 * silently ignored and every locally-run server behaved as if no variables were
 * set. Managed hosts (Vercel, Railway, ...) inject real variables into the
 * process, and `config()` never overwrites an existing value, so this is a
 * no-op there.
 *
 * Import this module *before* anything that reads `process.env` at module
 * scope — ES modules evaluate imports in declaration order.
 */
config({ path: ".env.local" });
config();
