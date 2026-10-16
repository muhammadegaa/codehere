/**
 * Help Command
 * Contextual help for the commands codehere ships: check and help.
 */

import { colors, newline } from '../../../ui.js';

interface CommandInfo {
  name: string;
  description: string;
  usage: string;
  examples: string[];
  options?: { flag: string; description: string }[];
}

const COMMAND_INFO: Record<string, CommandInfo> = {
  check: {
    name: 'check',
    description: 'Re-run your tests and report what actually passed',
    usage: 'codehere check [target] [options]',
    examples: [
      'codehere check',
      'codehere check --base origin/main',
      'codehere check --claim "added tests, all pass"',
      'codehere check --proof',
    ],
    options: [
      { flag: '--json', description: 'Machine-readable output' },
      { flag: '--proof', description: 'Paste-ready proof block for a pull request' },
      { flag: '--claim <text>', description: "The AI's summary: test files it names that do not exist are flagged" },
      { flag: '--base <ref>', description: 'Look for weakened tests in everything since this branch left <ref>' },
    ],
  },
  help: {
    name: 'help',
    description: 'Show help for commands',
    usage: 'codehere help [command]',
    examples: ['codehere help', 'codehere help check'],
  },
};

function displayCommandHelp(commandName: string): void {
  const command = COMMAND_INFO[commandName.toLowerCase()];

  if (!command) {
    newline();
    console.error(colors.red(`Command '${commandName}' not found.`));
    console.log(colors.dim('Run') + ' ' + colors.cyan('codehere --help') + ' ' + colors.dim('to see all commands.'));
    newline();
    return;
  }

  newline();
  console.log(colors.bold(command.name) + colors.dim(' · ' + command.description));
  newline();

  console.log(colors.bold('Usage'));
  console.log('  ' + colors.cyan(command.usage));
  newline();

  console.log(colors.bold('Examples'));
  command.examples.forEach((example) => {
    console.log(colors.dim('  $ ') + colors.cyan(example));
  });
  newline();

  if (command.options && command.options.length > 0) {
    console.log(colors.bold('Options'));
    command.options.forEach((opt) => {
      console.log('  ' + colors.cyan(opt.flag.padEnd(24)) + colors.dim(opt.description));
    });
    newline();
  }
}

function displayGeneralHelp(): void {
  newline();
  console.log(colors.bold('codehere') + colors.dim(' · re-run the tests an AI says passed'));
  newline();
  console.log(colors.bold('Check'));
  console.log('  ' + colors.cyan('check'.padEnd(14)) + colors.dim('Re-run your tests and report what actually passed'));
  newline();
  console.log(colors.dim('Run ') + colors.cyan('codehere help check') + colors.dim(' for its options.'));
  newline();
}

export async function executeHelpCommand(commandName?: string): Promise<void> {
  if (commandName) {
    displayCommandHelp(commandName);
  } else {
    displayGeneralHelp();
  }
}
