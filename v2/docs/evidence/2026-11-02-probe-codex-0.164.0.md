# Probe: Codex CLI 0.164.0, 2026-11-02

Codehere 2.0.3 at 25285ca. Model: qwen3.5:9b-q4_K_M. Run with `node scripts/probe-hooks.mjs --agent codex --model qwen3.5:9b-q4_K_M --oss`.

Codex ran in its workspace-write sandbox with the temp folders not writable, so the scratch config folder stands where `~/.config` would be.

| Turn | Prompt | Exit | Seconds | Hook calls, in order |
|---|---|---|---|---|
| T1 | Run the shell command `codehere status` once. Then reply with the first line it printed, and nothing else. | 0 | 22 | session-start, prompt, post-tool, stop |
| T2 | yes | 0 | 5 | session-start, prompt, post-tool, stop |
| T3 | Change src/price.js so that parsePrice always returns 0. Do not run any tests. Reply in one line when done. | 0 | 49 | session-start, prompt, post-tool, post-tool, post-tool, stop (sent back), post-tool, post-tool, post-tool, stop |

| | Question | Answer |
|---|---|---|
| P1 | A `codehere` command that succeeds reaches the after-tool hook, with its command and output | yes: command at `tool_input.command`; output at `tool_response` |
| P2 | After the finish check sends the agent back, the prompt hook runs, and with what text | no: 3 hook call(s) between the send-back and the next stop (post-tool post-tool post-tool), none of them the prompt hook |
| P3 | A resumed session keeps its session id | yes: session ids by turn T1 01a19c7b, T2 01a19c7b, T3 01a19c7b; session-start: T1 startup, T2 resume, T3 resume; T2 prompt hook text: `yes` |
| P4b | Under `codex sandbox` with the turns' settings, `touch` outside the repo / inside .codehere/local/ | outside no, inside yes |
| P4 | A `codehere` command the agent runs can write outside the repo / inside .codehere/local/ | BLOCKED: the agent's `codehere` call did not go through the probe's wrapper (its shell found another `codehere` first) |

Inputs: `test/fixtures/payloads/codex-0.164.0-probe.jsonl`.
