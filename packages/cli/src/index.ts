#!/usr/bin/env node
import { Command } from 'commander';
import { searchCommand } from './commands/search.js';
import { useCommand } from './commands/use.js';
import { findCommand } from './commands/find.js';
import { reportCommand } from './commands/report.js';
import { configCommand } from './commands/config.js';
import { publishCommand } from './commands/publish.js';

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
program.addCommand(reportCommand);
program.addCommand(configCommand);
program.addCommand(publishCommand);

program.parse(process.argv);
