#!/usr/bin/env node
import { Command } from 'commander';
import { searchCommand } from './commands/search.js';
import { useCommand } from './commands/use.js';
import { findCommand } from './commands/find.js';
import { inspectCommand } from './commands/inspect.js';
import { checkCommand } from './commands/check.js';
import { reportCommand } from './commands/report.js';
import { configCommand } from './commands/config.js';
import { publishCommand } from './commands/publish.js';
import { importCommand } from './commands/import.js';
import { validateCommand } from './commands/validate.js';
import { createPackCommand } from './commands/pack.js';
import { promoteCommand } from './commands/promote.js';
import { releaseCommand } from './commands/release-publish.js';
import { installCommand, listCommand, syncCommand, uninstallCommand, updateCommand } from './commands/install.js';
import { mcpCommand } from './commands/mcp.js';
import { addCommand } from './commands/add.js';
import { libraryCommand } from './commands/library.js';
import { kitCommand } from './commands/kit.js';
import { routeUsageErrors } from './lib/run-command.js';

/** Injected at build time from packages/cli/package.json by tsup (see tsup.config.ts). */
declare const __SKILLX_VERSION__: string;

const program = new Command();

program
  .name('skillx')
  .description('The Only Skill That Your AI Agent Needs.')
  .version(__SKILLX_VERSION__);

program.addCommand(searchCommand);
program.addCommand(useCommand);
program.addCommand(findCommand);
program.addCommand(inspectCommand);
program.addCommand(checkCommand);
program.addCommand(reportCommand);
program.addCommand(configCommand);
program.addCommand(importCommand);
program.addCommand(validateCommand);
program.addCommand(createPackCommand());
program.addCommand(publishCommand);
program.addCommand(promoteCommand);
program.addCommand(releaseCommand);
for (const command of [installCommand, updateCommand, uninstallCommand, listCommand, syncCommand, mcpCommand]) program.addCommand(command);
program.addCommand(addCommand);
program.addCommand(libraryCommand);
program.addCommand(kitCommand);

// Parse errors exit 2 (and print a usage_error envelope under --json); see docs/cli-reference.md.
routeUsageErrors(program);
await program.parseAsync(process.argv);
