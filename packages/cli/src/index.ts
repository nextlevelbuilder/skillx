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
import { readCliVersion } from './version.js';

const program = new Command();

program
  .name('skillx')
  .description('The Only Skill That Your AI Agent Needs.')
  // Read from package.json so the reported version cannot drift from the
  // published one (issue #24).
  .version(readCliVersion());

program.addCommand(searchCommand);
program.addCommand(useCommand);
program.addCommand(findCommand);
program.addCommand(inspectCommand);
program.addCommand(checkCommand);
program.addCommand(reportCommand);
program.addCommand(configCommand);
program.addCommand(publishCommand);

program.parse(process.argv);
