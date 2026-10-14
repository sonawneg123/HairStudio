/**
 * Test stub for the `server-only` package.
 *
 * In production, `server-only` throws a build error when imported from a
 * client bundle, preventing accidental server secret exposure.  In the
 * Vitest Node environment there is no Next.js bundler boundary, so we
 * replace the package with a no-op to let unit tests import server modules
 * normally.
 *
 * The security guarantee is NOT weakened: Next.js production builds still
 * resolve the real `server-only` package (via node_modules), which throws.
 * This file is only reachable via the Vitest `alias` configuration.
 */

// intentional no-op
export {};
