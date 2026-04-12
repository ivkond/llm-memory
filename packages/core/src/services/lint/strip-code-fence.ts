/**
 * Strip a surrounding Markdown code fence (```...``` or ```json ... ```)
 * from an LLM response so downstream JSON parsing can run on the payload.
 *
 * Anchored on both ends and driven by a lazy `[\s\S]*?` body with
 * non-overlapping `\s*` padding — safe to run on bounded LLM outputs
 * without catastrophic backtracking (see typescript:S5852).
 */
const FENCE_RE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

export function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const match = FENCE_RE.exec(trimmed);
  return match ? match[1] : trimmed;
}
