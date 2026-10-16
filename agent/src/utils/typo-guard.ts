/**
 * Typo guard for the bare `codehere <word>` action.
 *
 * Why this exists: codehere's bare action treats any string as a one-shot task
 * prompt for the Conductor. Without a guard, a typo like `codehere helpp`
 * silently spawns a Claude task to interpret "helpp" as a question, burning
 * API tokens for what was clearly meant to be `codehere help`.
 *
 * Earlier rc.15 attempt (greedy edit-check + prefix match) over-matched and
 * blocked legitimate single-word prompts like "task-runner" or "h". Codex
 * caught the regression in review. The rc.16 version uses real Levenshtein,
 * a length floor, and explicit kebab-case exemption.
 *
 * v0.6 extension: handle multi-token input. Original guard bailed on any
 * whitespace, which let `setupp foo bar` and `daemon start` silently route to
 * the task spawner. Now: checkTypo tokenizes and runs typo-detection on the
 * first token. looksLikeUnknownCommand catches the narrow `cmd subcmd` shape
 * (two short alphabetic tokens, first not a known command, not a typo) so
 * cases like `daemon start` get an "unknown command" message instead of
 * silently spawning an LLM task.
 */

/** Standard Levenshtein distance. Bounded inputs only — no allocation guard. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Internal: typo-check a single token against known commands.
 * Returns up to 3 closest matches (Lev ≤ 2, distance < input length) or null.
 */
function checkTypoSingle(token: string, knownCommands: readonly string[]): string[] | null {
  if (token.length < 4 || token.length > 14) return null;
  if (!/^[a-z]+$/i.test(token)) return null;

  const lower = token.toLowerCase();
  // Defensively normalize knownCommands to lowercase too — Codex rc.16 review
  // flagged this for symmetry. Currently every Commander subcommand is lower
  // already, but a future addition that registers an uppercase name shouldn't
  // silently slip through the equality check.
  const knownLower = knownCommands.map((n) => n.toLowerCase());
  if (knownLower.includes(lower)) return null;

  // Length-prefilter cheap reject before computing DP — same outcome, less work.
  const scored = knownLower
    .filter((n) => Math.abs(n.length - lower.length) <= 2)
    .map((n) => ({ n, d: levenshtein(lower, n) }))
    .filter((s) => s.d > 0 && s.d <= 2 && s.d < lower.length)
    // Deterministic tie-breaker (alphabetical) so ranking is stable across runs.
    .sort((a, b) => a.d - b.d || a.n.localeCompare(b.n))
    .slice(0, 3);

  return scored.length > 0 ? scored.map((s) => s.n) : null;
}

/**
 * Decide whether a bare-action input contains a typo of a known subcommand.
 * Returns suggestions if the FIRST token looks like a typo; null otherwise.
 *
 * Multi-token inputs (e.g. `setupp foo bar`) tokenize on whitespace and only
 * the first token is typo-checked — the rest are treated as positional args
 * the user meant to pass to the suggested command.
 *
 * Heuristics (intentionally narrow — false positives are worse than false negatives):
 *   - First token is 4–14 chars, pure alphabetic, no hyphens (kebab-case is a likely real prompt)
 *   - True Levenshtein distance ≤ 2 to a known command
 *   - Distance must be < input length (avoid 2-char words matching anything)
 *   - Returns up to 3 closest commands ranked by ascending distance
 */
export function checkTypo(input: string, knownCommands: readonly string[]): string[] | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0];
  return checkTypoSingle(first, knownCommands);
}

/**
 * Detect inputs shaped like a typed-but-unknown subcommand invocation:
 * exactly two short alphabetic tokens, first token NOT a known command and NOT
 * a near-typo of one. Returns the unknown first token (for error formatting)
 * or null if input doesn't match the shape.
 *
 * Catches cases the typo guard misses — e.g. `daemon start`, `webui open`,
 * `nuke session` — where the first word isn't close enough to a real command
 * for Levenshtein suggestions but is clearly a command attempt rather than a
 * natural-language prompt.
 *
 * Conservative on purpose:
 *   - Exactly 2 tokens (3+ tokens are usually prompts: "fix the login bug")
 *   - Both tokens pure alphabetic (a slash/period in token 2 → file path → prompt)
 *   - First token 4-14 chars (skip "go run", "h x"); second 2-14 chars
 *   - First not a known command and not a typo (those branches handled elsewhere)
 */
export function looksLikeUnknownCommand(input: string, knownCommands: readonly string[]): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length !== 2) return null;
  const [first, second] = tokens;
  if (first.length < 4 || first.length > 14) return null;
  if (second.length < 2 || second.length > 14) return null;
  if (!/^[a-z]+$/i.test(first)) return null;
  if (!/^[a-z]+$/i.test(second)) return null;
  const lower = first.toLowerCase();
  const knownLower = knownCommands.map((n) => n.toLowerCase());
  if (knownLower.includes(lower)) return null;
  if (checkTypoSingle(first, knownCommands)) return null;
  return first;
}
