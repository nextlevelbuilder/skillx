import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

/**
 * Single source of truth for the CLI version is the package manifest. It is injected at build
 * time so the built binary can never drift from package.json (issue #24). `process.env`
 * npm_package_version is deliberately not used: it is absent when a user runs an installed binary.
 */
function readCliVersion(): string {
  try {
    const raw = readFileSync(new URL('./package.json', import.meta.url), 'utf8');
    const version = (JSON.parse(raw) as { version?: string }).version;
    if (!version) throw new Error('package.json has no version field');
    return version;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`tsup: cannot read the CLI version from packages/cli/package.json: ${detail}`);
  }
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  dts: true,
  splitting: false,
  sourcemap: true,
  shims: true,
  define: {
    __SKILLX_VERSION__: JSON.stringify(readCliVersion()),
  },
});
