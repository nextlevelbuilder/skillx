import { Command } from 'commander';
import chalk from 'chalk';
import { fetchSkillInspection, isActionable } from '../lib/skill-lookup.js';
import { EXIT_CODES, exitCodeFor, failure, fromError, serialize, success } from '../lib/output.js';

interface CheckOptions {
  target: string;
  json?: boolean;
}

/**
 * `check` is a gate, so its exit code is the answer: 0 when the target may be
 * acted on, 4 when it may not. A caller can branch on that without reading text.
 */
export const checkCommand = new Command('check')
  .description('Decide whether a skill can run on a target, and print the reason')
  .argument('<identifier>', 'slug, author/skill, or org/repo/skill')
  .requiredOption('--target <runtime[@version]>', 'runtime to evaluate, optionally runtime@version')
  .option('--json', 'emit a machine-readable envelope instead of text')
  .action(async (identifier: string, options: CheckOptions) => {
    const useJson = options.json === true;

    try {
      const { slug, inspection } = await fetchSkillInspection(identifier, options.target);
      const answer = inspection.compatibility?.target;

      if (!answer) {
        // The API returns no target answer only when the request never carried one.
        const envelope = failure('unexpected_error', 'The API did not return a target answer.', {
          details: { slug, target: options.target },
        });
        if (useJson) console.log(serialize(envelope));
        else console.error(chalk.red(`\n✗ ${envelope.error.message}`));
        process.exit(exitCodeFor(envelope));
      }

      const actionable = isActionable(answer.status);
      const payload = {
        slug,
        target: { runtime: answer.runtime, version: options.target.includes('@') ? options.target.split('@')[1] : null },
        status: answer.status,
        versions: answer.versions,
        requirements: answer.requirements,
        evidence: answer.evidence,
        reasons: answer.reasons,
        actionable,
      };

      if (useJson) {
        const envelope = success(payload);
        console.log(serialize(envelope));
        process.exit(actionable ? EXIT_CODES.ok : EXIT_CODES.incompatible);
      }

      const paint = actionable ? chalk.green : chalk.red;
      console.log(`\n${paint(actionable ? '✓' : '✗')} ${slug} on ${answer.runtime}: ${paint(answer.status)}`);
      if (answer.versions) console.log(chalk.dim(`  declared range ${answer.versions}`));
      for (const reason of answer.reasons) {
        console.log(`  ${chalk.bold(reason.code)} ${reason.message}`);
      }
      if (answer.evidence) {
        console.log(
          chalk.dim(
            `  evidence ${answer.evidence.probeId} by ${answer.evidence.verifier} at ${answer.evidence.verifiedAt}`,
          ),
        );
      }
      if (!actionable) {
        console.log(
          chalk.dim(
            '\nOnly `declared` and `verified` mean the skill will run. A missing declaration is not support.',
          ),
        );
      }
      console.log();
      process.exit(actionable ? EXIT_CODES.ok : EXIT_CODES.incompatible);
    } catch (error) {
      const envelope = fromError(error);
      if (useJson) console.log(serialize(envelope));
      else console.error(chalk.red(`\n✗ ${envelope.error.message}`));
      process.exit(exitCodeFor(envelope));
    }
  });
