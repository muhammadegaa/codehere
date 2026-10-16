import chalk from 'chalk';

// Color roles (DESIGN.md §1): color carries meaning.
//   verified = green (independently verified ONLY)   caught = red (a contradiction caught ONLY)
//   warn = amber (attention)                         evidence = dim (machine facts, metadata)
//   identity = cyan (an id, sparingly)               heading = bold (the one thing that matters)
export const colors = {
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  dim: chalk.dim,
  bold: chalk.bold,
  cyan: chalk.cyan,
  magenta: chalk.magenta,
  yellow: chalk.yellow,
  red: chalk.red,
  green: chalk.green,
  gray: chalk.gray,
  blue: chalk.blue,
  verified: chalk.green,
  caught: chalk.red,
  warn: chalk.yellow,
  evidence: chalk.dim,
  identity: chalk.cyan,
  heading: chalk.bold,
};

// Glyph language (DESIGN.md): the sanctioned geometric set plus ANSI color,
// never emoji-as-icon.
export const symbols = {
  success: '✓',
  error: '✕',
  warning: '!',
  info: '›',
  processing: '›',
  arrow: '›',
  dot: '·',
  check: '✓',
  cross: '✕',
  pipe: '│',
  dash: '─',
  plus: '+',
  minus: '-',
  bullet: '•',
};

export function error(message: string): string {
  return colors.red(symbols.error + ' ' + message);
}

export function newline(count: number = 1): void {
  for (let i = 0; i < count; i++) {
    console.log();
  }
}
