# Probe: Copilot CLI 1.0.105, 2026-11-02

Codehere 2.0.3 at 25285ca. Model: qwen3.5:9b-q4_K_M. Run with `node scripts/probe-hooks.mjs --agent copilot --model qwen3.5:9b-q4_K_M --oss --bin <path>/copilot`.

The folder's trust was saved in the scratch `COPILOT_HOME/config.json` (`trustedFolders`), as a developer's own trust is. `--trust-folder` covers one new session only, and Copilot refuses it with `--resume`.

| Turn | Prompt | Exit | Seconds | Hook calls, in order |
|---|---|---|---|---|
| T1 | Run the shell command `codehere status` once. Then reply with the first line it printed, and nothing else. | 0 | 72 | session-start, prompt, post-tool, stop |
| T2 | yes | 0 | 5 | session-start, prompt, stop |
| T3 | Change src/price.js so that parsePrice always returns 0. Do not run any tests. Reply in one line when done. | 0 | 128 | session-start, prompt, stop (sent back), prompt, post-tool, post-tool, stop |

| | Question | Answer |
|---|---|---|
| P1 | A `codehere` command that succeeds reaches the after-tool hook, with its command and output | yes: command at `toolArgs.command, toolArgs.description`; output at `toolResult.textResultForLlm` |
| P2 | After the finish check sends the agent back, the prompt hook runs, and with what text | yes, 1 time(s); the text starts: `` Codehere ran `npm test --silent` and it failed. The task is not done yet.⏎Last l `` |
| P3 | A resumed session keeps its session id | yes: session ids by turn T1 39a26a30, T2 39a26a30, T3 39a26a30; session-start: T1 new, T2 resume, T3 resume; T2 prompt hook text: `yes` |
| P4 | A `codehere` command the agent runs can write outside the repo / inside .codehere/local/ | `codehere status`: outside yes, inside yes |

Inputs: `test/fixtures/payloads/copilot-cli-1.0.105-probe.jsonl`.
