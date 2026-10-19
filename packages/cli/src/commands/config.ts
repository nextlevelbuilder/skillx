import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout, stderr } from 'node:process';
import { CliError } from '../lib/output.js';
import { runCommand } from '../lib/run-command.js';
import {
  getApiKey,
  getApiKeySource,
  getBaseUrl,
  getConfigPath,
  setApiKey,
  setBaseUrl,
} from '../utils/config-store.js';

interface JsonOption {
  json?: boolean;
}

/** Never prints a whole key: a prefix, a mask, and the last four characters. */
export function maskApiKey(apiKey: string): string {
  return `${apiKey.substring(0, 8)}${'*'.repeat(Math.max(0, apiKey.length - 12))}${apiKey.substring(Math.max(8, apiKey.length - 4))}`;
}

function apiKeyState() {
  const apiKey = getApiKey();
  return { configured: Boolean(apiKey), source: getApiKeySource(), masked: apiKey ? maskApiKey(apiKey) : null };
}

export const configCommand = new Command('config').description('Manage SkillX CLI configuration');

configCommand
  .command('set-key')
  .description('Set your SkillX API key (read from the prompt, or from stdin when piped)')
  .option('--json', 'emit a machine-readable envelope; the prompt goes to stderr')
  .action((options: JsonOption) => {
    const json = options.json === true;
    return runCommand(
      { json },
      async () => {
        // With --json, stdout carries only the envelope, so the prompt is written to stderr.
        const rl = readline.createInterface({ input, output: json ? stderr : stdout });
        let apiKey: string;
        try {
          if (!json) {
            console.log(chalk.bold('\nSkillX API Key Configuration'));
            console.log(chalk.dim('Get your API key from: https://skillx.sh/settings/api\n'));
          }
          apiKey = (await rl.question(json ? 'Enter your API key: ' : chalk.cyan('Enter your API key: '))).trim();
        } finally {
          rl.close();
        }
        if (apiKey.length === 0) throw new CliError('usage_error', 'API key cannot be empty.');

        setApiKey(apiKey);
        return { saved: true, path: getConfigPath(), apiKey: apiKeyState() };
      },
      (result) => {
        console.log(chalk.green('\n✓ API key saved successfully'));
        console.log(chalk.dim(`Stored in: ${result.path}`));
        if (result.apiKey.source === 'env') {
          console.log(chalk.yellow('SKILLX_API_KEY is set and takes precedence over the saved key.'));
        }
      },
    );
  });

configCommand
  .command('set-url')
  .description('Set custom API base URL (default: https://skillx.sh)')
  .argument('<url>', 'Base URL for SkillX API')
  .option('--json', 'emit a machine-readable envelope instead of text')
  .action((url: string, options: JsonOption) =>
    runCommand(
      { json: options.json === true },
      async () => {
        try {
          new URL(url);
        } catch {
          throw new CliError('usage_error', `Invalid URL format: ${url}`, { hint: 'Example: https://api.skillx.sh' });
        }
        setBaseUrl(url);
        return { baseUrl: url };
      },
      (result) => console.log(chalk.green(`\n✓ Base URL set to: ${result.baseUrl}`)),
    ),
  );

configCommand
  .command('show')
  .description('Display current configuration')
  .option('--json', 'emit a machine-readable envelope instead of text')
  .action((options: JsonOption) =>
    runCommand(
      { json: options.json === true },
      async () => ({ baseUrl: getBaseUrl(), path: getConfigPath(), apiKey: apiKeyState() }),
      (state) => {
        console.log(chalk.bold('\nSkillX Configuration:\n'));
        console.log(chalk.cyan('Base URL:'), state.baseUrl);
        if (state.apiKey.masked) {
          console.log(chalk.cyan('API Key: '), state.apiKey.masked);
          const from = state.apiKey.source === 'env' ? 'SKILLX_API_KEY environment variable' : state.path;
          console.log(chalk.dim(`  (loaded from ${from})`));
        } else {
          console.log(chalk.cyan('API Key: '), chalk.dim('not configured'));
          console.log(chalk.dim(`  Run ${chalk.cyan('skillx config set-key')} to configure`));
        }
        console.log();
      },
    ),
  );
