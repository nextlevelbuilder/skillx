import { Command } from 'commander';
import chalk from 'chalk';
import { fetchSkillInspection, isActionable, type CompatibilityAnswer } from '../lib/skill-lookup.js';
import { CliError, EXIT_CODES } from '../lib/output.js';
import { runCommand } from '../lib/run-command.js';

interface CheckOptions {
  target: string;
  json?: boolean;
}

export interface CheckResult {
  slug: string;
  target: { runtime: string; version: string | null };
  status: string;
  versions: string | null;
  requirements: CompatibilityAnswer['requirements'];
  evidence: CompatibilityAnswer['evidence'];
  reasons: CompatibilityAnswer['reasons'];
  actionable: boolean;
}

/** Builds the `check` result from the API's target answer; the decision is the contract's. */
export function toCheckResult(slug: string, requested: string, answer: CompatibilityAnswer): CheckResult {
  return {
    slug,
    target: { runtime: answer.runtime, version: requested.includes('@') ? requested.split('@')[1] : null },
    status: answer.status,
    versions: answer.versions,
    requirements: answer.requirements,
    evidence: answer.evidence,
    reasons: answer.reasons,
    actionable: isActionable(answer.status),
  };
}

function render(result: CheckResult): void {
  const { actionable } = result;
  const paint = actionable ? chalk.green : chalk.red;
  console.log(`\n${paint(actionable ? '✓' : '✗')} ${result.slug} on ${result.target.runtime}: ${paint(result.status)}`);
  if (result.versions) console.log(chalk.dim(`  declared range ${result.versions}`));
  for (const reason of result.reasons) {
    console.log(`  ${chalk.bold(reason.code)} ${reason.message}`);
  }
  if (result.evidence) {
    console.log(
      chalk.dim(`  evidence ${result.evidence.probeId} by ${result.evidence.verifier} at ${result.evidence.verifiedAt}`),
    );
  }
  if (!actionable) {
    console.log(chalk.dim('\nOnly `declared` and `verified` mean the skill will run. A missing declaration is not support.'));
  }
  console.log();
}

/**
 * `check` is a gate, so its exit code is the answer: 0 when the target may be
 * acted on, 4 when it may not. A caller can branch on that without reading text.
 * The envelope is `ok: true` either way, because the check itself succeeded.
 */
export const checkCommand = new Command('check')
  .description('Decide whether a skill can run on a target, and print the reason')
  .argument('<identifier>', 'slug, author/skill, or org/repo/skill')
  .requiredOption('--target <runtime[@version]>', 'runtime to evaluate, optionally runtime@version')
  .option('--json', 'emit a machine-readable envelope instead of text')
  .action((identifier: string, options: CheckOptions) =>
    runCommand(
      {
        json: options.json === true,
        exitCode: (result: CheckResult) => (result.actionable ? EXIT_CODES.ok : EXIT_CODES.incompatible),
        errors: { notFoundMessage: `Skill not found: ${identifier}` },
      },
      async () => {
        const { slug, inspection } = await fetchSkillInspection(identifier, options.target);
        const answer = inspection.compatibility?.target;
        // The API returns no target answer only when the request never carried one.
        if (!answer) {
          throw new CliError('unexpected_error', 'The API did not return a target answer.', {
            details: { slug, target: options.target },
          });
        }
        return toCheckResult(slug, options.target, answer);
      },
      render,
    ),
  );
