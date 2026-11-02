# Probe: Claude Code 2.1.316, 2026-11-02

Codehere 2.0.3 at 25285ca. Model: haiku. Run with `node scripts/probe-hooks.mjs --agent claude --model haiku`.


| Turn | Prompt | Exit | Seconds | Hook calls, in order |
|---|---|---|---|---|
| T1 | Run the shell command `codehere status` once. Then reply with the first line it printed, and nothing else. | 0 | 5 | session-start, prompt, post-tool, stop |
| T2 | yes | 0 | 3 | session-start, prompt, stop |
| T3 | Change src/price.js so that parsePrice always returns 0. Do not run any tests. Reply in one line when done. | 0 | 16 | session-start, prompt, stop (sent back), stop (sent back), stop (sent back), stop |

| | Question | Answer |
|---|---|---|
| P1 | A `codehere` command that succeeds reaches the after-tool hook, with its command and output | yes: command at `tool_input.command, tool_input.description`; output at `tool_response.stdout` |
| P2 | After the finish check sends the agent back, the prompt hook runs, and with what text | no: 0 hook call(s) between the send-back and the next stop (none), none of them the prompt hook |
| P3 | A resumed session keeps its session id | yes: session ids by turn T1 9f748a72, T2 9f748a72, T3 9f748a72; session-start: T1 startup, T2 resume, T3 resume; T2 prompt hook text: `yes` |
| P4 | A `codehere` command the agent runs can write outside the repo / inside .codehere/local/ | `codehere status`: outside yes, inside yes |

Inputs: `test/fixtures/payloads/claude-code-2.1.316-probe.jsonl`.
