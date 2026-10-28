#!/usr/bin/env node
import { runHook } from '../src/hooks.js';
import * as cmd from '../src/commands.js';

const argv = process.argv.slice(2);
const BOOLEAN = new Set(['gemma', 'solved', 'all', 'help', 'h']);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--') && a.indexOf('=') > 2) {
    flags[a.slice(2, a.indexOf('='))] = a.slice(a.indexOf('=') + 1);
  } else if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!BOOLEAN.has(key) && next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else flags[key] = true;
  } else pos.push(a);
}

const [command, ...rest] = pos;

const USAGE = `codehere · a git-native team brain for vibe coders

Setup
  codehere init [--agent claude,codex] [--test "npm test"]
                                      set up .codehere/ and the agents' hooks (default: Claude Code)
  codehere approve                    let the finish check run the test command on this machine
  codehere uninstall                  remove Codehere's hooks, and .codehere/ if it holds no team content

Team brain
  codehere rule ["text"]              add a team rule (or list rules)
  codehere lesson ["problem" --fix "what fixed it" --sig "error text"]
                                      add a lesson (or list lessons)

When you're stuck
  codehere brief [--gemma]            write a restart brief; the next session loads it
  codehere help ["question"] [--gemma]
                                      write a redacted help card for a teammate
  codehere inbox [--all]              see teammates' help cards
  codehere show <id>                  read a help card
  codehere reply <id> "answer" [--solved]
                                      answer; --solved turns it into a team lesson

  codehere status                     what Codehere has seen
  codehere stats                      turns to green, loops stopped, session size

Hooks (called by the agent, not by you)
  codehere hook session-start | prompt | post-tool | stop [--agent codex]
`;

const run = async () => {
  switch (command) {
    case 'hook':
      return runHook(rest[0], flags.agent);
    case 'init':
      return cmd.init(flags);
    case 'approve':
      return cmd.approve();
    case 'uninstall':
      return cmd.uninstall();
    case 'rule':
    case 'rules':
      return cmd.rule(rest.join(' '));
    case 'lesson':
    case 'lessons':
      return cmd.lesson(rest.join(' '), flags);
    case 'brief':
      return cmd.brief(flags);
    case 'help':
      if (flags.h) return console.log(USAGE);
      return cmd.help(rest.join(' '), flags);
    case 'inbox':
      return cmd.inbox(flags);
    case 'show':
      return cmd.show(rest[0]);
    case 'reply':
      return cmd.reply(rest[0], rest.slice(1).join(' '), flags);
    case 'status':
      return cmd.status();
    case 'stats':
      return cmd.stats();
    default:
      if (!command || command === '-h') return console.log(USAGE);
      // stderr only: a hook's stdout can land in the agent's context (e.g. a codehere 1.x
      // user-level hook such as `codehere scan-tool`). Exit 0 when a hook called us.
      console.error(`Unknown command "${command}". Run codehere --help.`);
      if (process.stdin.isTTY) process.exitCode = 1;
  }
};

run().catch((err) => {
  // hooks must never break the agent
  if (command === 'hook') process.exit(0);
  console.error(err.message);
  process.exit(1);
});
