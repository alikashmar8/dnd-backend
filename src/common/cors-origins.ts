/**
 * Parses the `CORS_ORIGIN` env var into the `origin` option for
 * `app.enableCors()`.
 *
 * - Comma-separated list of origins → exact-origin allowlist.
 * - `*` (or an empty/missing value) → `true`, which reflects the request's
 *   Origin back to the caller. Reflecting is the only way to combine
 *   cross-origin requests with `credentials: true`; a literal `*` is rejected
 *   by browsers whenever credentials are sent, so we never emit it.
 *
 * Production deployments should set an explicit list, e.g.
 * `CORS_ORIGIN=https://admin.dishanddash.com,https://www.dishanddash.com`.
 */
export function parseCorsOrigins(raw: string | undefined): string[] | boolean {
  if (!raw || raw.trim() === '') {
    return true;
  }

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    return true;
  }

  // An explicit `*` entry means "allow any origin" (dev convenience). Reflect
  // the request origin so credentialed requests keep working.
  if (origins.includes('*')) {
    return true;
  }

  return origins;
}
