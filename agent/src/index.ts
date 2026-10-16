#!/usr/bin/env node

/**
 * codehere CLI entry: `check` re-runs a project's tests and reports what actually passed.
 * The earlier orchestrator, daemon, web UI and the other commands are on the legacy/2026-10 branch.
 */

import { Command } from 'commander';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

// A crash must stop the process: `process.exitCode = 1` is only honoured once the event loop drains.
function safeVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf-8')).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function crashReport(kind: string, err: unknown): string {
  const e = err instanceof Error ? err : new Error(String(err));
  return [
    '',
    `[codehere] ${kind} — this process is stopping.`,
    `  version : ${safeVersion()}`,
    `  node    : ${process.version} on ${process.platform} ${process.arch}`,
    '',
    (e.stack ?? e.message)
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n'),
    '',
    '  Report at https://github.com/muhammadegaa/codehere/issues with the block above.',
    '',
  ].join('\n');
}

process.on('uncaughtException', (err) => {
  console.error(crashReport('uncaughtException', err));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(crashReport('unhandledRejection', reason));
  process.exit(1);
});

import { executeCheckCommand } from './presentation/cli/commands/check-command.js';
import { executeHelpCommand } from './presentation/cli/commands/help-command.js';
import { error } from './ui.js';
import { getVersion } from './utils/version.js';
import { checkTypo, looksLikeUnknownCommand } from './utils/typo-guard.js';

const program = new Command();

program
  .name('codehere')
  .description('Re-run your project\'s tests yourself, so an AI\'s "all tests pass" is checked, not taken on trust.')
  .version(getVersion())
  .configureHelp({ helpWidth: 80, sortSubcommands: true });

// Bare `codehere` prints help. Anything else that is not a command goes through the typo guard.
program.allowExcessArguments(true).action(() => {
  const input = program.args.join(' ').trim();
  if (!input) {
    program.outputHelp();
    return;
  }
  const known = program.commands.map((c) => c.name());
  const suggestions = checkTypo(input, known);
  const unknown = suggestions
    ? input.split(/\s+/)[0]
    : (looksLikeUnknownCommand(input, known) ?? input.split(/\s+/)[0]);
  console.error(`codehere: unknown command '${unknown}'.`);
  console.error('');
  if (suggestions) {
    console.error('  Did you mean:');
    for (const s of suggestions) console.error(`    codehere ${s}`);
  } else {
    console.error('  Run `codehere help` to see available commands.');
  }
  console.error('');
  process.exit(1);
});

program
  .command('check')
  .description('Re-run your tests independently — proof of what the AI actually did, not what it claimed')
  .argument('[target]', 'Repo or directory to check (default: current directory)')
  .option('--json', 'Machine-readable output')
  .option('--proof', 'Emit a paste-ready proof block for a PR description or review comment')
  .option('--claim <text>', "The AI's own summary: test files it names that are not in the repo are flagged")
  .option('--base <ref>', 'Look for weakened tests in everything since this branch left <ref> (e.g. origin/main)')
  .action(async (target?: string, options?: { json?: boolean; proof?: boolean; claim?: string; base?: string }) => {
    try {
      process.exitCode = await executeCheckCommand(target, {
        json: options?.json,
        proof: options?.proof,
        claim: options?.claim,
        base: options?.base,
      });
    } catch (err) {
      console.error(error('Error:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('help')
  .description('Show help for commands')
  .argument('[command]', 'Command name to get help for')
  .action(async (commandName?: string) => {
    await executeHelpCommand(commandName);
  });

program.parse();
