/**
 * Next-step hints for package visibility failures, shared by `skillx
 * visibility` and `skillx publish`: the CLI holds an API key, which may narrow
 * a package's visibility; widening needs a signed-in approval in the web
 * dashboard of the same registry.
 */
import type { PackageVisibility } from '@skillx/contracts';
import { CliError } from './output.js';

/** Where the owner changes what the CLI may not: the web dashboard of the registry. */
export const dashboardUrl = (base: string) => `${base}/dashboard`;

/** The next step for a registry refusal of a visibility change, by its error code. */
export function visibilityHint(failure: { status?: number; code?: string | null }, base: string, name: string): string | undefined {
  if (failure.status === 401) return `Use the owner's unscoped account API key (publish and other scoped keys are refused): \`skillx config set-key\`, or ${dashboardUrl(base)}.`;
  switch (failure.code) {
    case 'visibility.approval_required':
      return `Making a package more visible needs a signed-in approval: open ${dashboardUrl(base)}.`;
    case 'visibility_conflict':
      return `The visibility changed meanwhile; check it with \`skillx visibility get ${name}\` and retry.`;
    default:
      return undefined;
  }
}

/** Names the next step of a `release.visibility_mismatch` refusal: change the visibility first, then publish again. */
export function withVisibilityMismatchHint(error: unknown, base: string, name: string, requested: PackageVisibility | undefined): unknown {
  if (!(error instanceof CliError) || (error.extra.details as { code?: unknown } | undefined)?.code !== 'release.visibility_mismatch') return error;
  const hint =
    `Change the package visibility first, then publish again: \`skillx visibility set ${name} ${requested ?? '<visibility>'}\` ` +
    `(an account API key may make it less visible; making it more visible needs ${dashboardUrl(base)}), or publish without --visibility to keep it.`;
  return new CliError(error.code, error.message, { ...error.extra, hint });
}

