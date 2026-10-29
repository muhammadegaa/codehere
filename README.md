# Codehere

**A team brain for vibe coders.** It stops your AI coding agent from going in circles, checks "done" for real, and shares what your team learns. It works through plain files in git.

You keep using Claude Code, Codex CLI or GitHub Copilot CLI as usual. Codehere talks to the agent, not to you, and stays silent unless it helps.

```bash
npm install -g codehere
cd your-project
codehere init --agent claude,codex,copilot   # name only the agents your team uses
```

The full guide is in [v2/README.md](v2/README.md): what it does, the team loop, what works on each agent, and the known limits. Each agent was run for real; the results are in [v2/docs/conformance](v2/docs/conformance).

## `codehere check` (1.x)

Version 1.x re-runs the tests an AI says passed. It stays on npm as `codehere@1`:

```bash
npx codehere@1 check
```

See [agent/README.md](agent/README.md). The GitHub Action in [action/](action/) pins its own 1.x version, so workflows that use it keep working.

MIT licensed.
