import { Command } from 'commander';
import chalk from 'chalk';
import { apiRequest } from '../lib/api-client.js';
import { CliError } from '../lib/output.js';
import { runCommand } from '../lib/run-command.js';
import { getApiKey } from '../utils/config-store.js';

const OUTCOMES = ['success', 'failure', 'partial'] as const;
type Outcome = (typeof OUTCOMES)[number];

interface ReportPayload {
  skill_slug: string;
  outcome: Outcome;
  model?: string;
  duration_ms?: number;
}

interface ReportResponse {
  success: boolean;
  message: string;
}

interface ReportOptions {
  model?: string;
  duration?: string;
  json?: boolean;
}

/** Validates the arguments before any request, so a bad call is a usage error (exit 2). */
export function buildReportPayload(slug: string, outcome: string, options: ReportOptions): ReportPayload {
  if (!(OUTCOMES as readonly string[]).includes(outcome)) {
    throw new CliError('usage_error', `Invalid outcome "${outcome}". Must be: ${OUTCOMES.join(', ')}.`, {
      details: { outcome, allowed: OUTCOMES },
    });
  }
  const payload: ReportPayload = { skill_slug: slug, outcome: outcome as Outcome };
  if (options.model) payload.model = options.model;
  if (options.duration !== undefined) {
    const duration = Number(options.duration);
    if (!Number.isFinite(duration) || duration < 0) {
      throw new CliError('usage_error', `Invalid duration "${options.duration}". Pass milliseconds as a number.`);
    }
    payload.duration_ms = duration;
  }
  return payload;
}

export const reportCommand = new Command('report')
  .description('Report skill usage to SkillX (requires API key)')
  .argument('<slug>', 'Skill slug identifier')
  .argument('<outcome>', 'Outcome: success, failure, or partial')
  .option('-m, --model <model>', 'AI model used (e.g., claude-sonnet-4)')
  .option('-d, --duration <ms>', 'Execution duration in milliseconds')
  .option('--json', 'emit a machine-readable envelope instead of text')
  .action((slug: string, outcome: string, options: ReportOptions) =>
    runCommand(
      {
        json: options.json === true,
        spinner: `Reporting usage for ${slug}...`,
        errors: { notFoundMessage: `Skill not found: ${slug}` },
      },
      async () => {
        const payload = buildReportPayload(slug, outcome, options);
        if (!getApiKey()) {
          throw new CliError('auth_error', 'API key required for reporting.', {
            hint: 'Run `skillx config set-key` or set SKILLX_API_KEY.',
          });
        }
        const response = await apiRequest<ReportResponse>('/api/report', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        return { ...payload, message: response.message };
      },
      (result) => {
        console.log(chalk.green(`\n✓ ${result.message}`));
        console.log(chalk.dim(`Reported ${chalk.bold(result.outcome)} for skill: ${chalk.cyan(result.skill_slug)}`));
      },
    ),
  );
