// Model request settings: the one place prompt-engineer tunes generation (model IDs come from
// secrets, not from here). Changing anything here is a prompt change: run evals.
//
// Claude (direct API and Bedrock), Claude Haiku 5.5:
//  - no temperature / top_p / top_k (the API returns 400 for them on this model);
//  - no assistant prefill (400);
//  - thinking is adaptive by default with effort "medium"; for short, low-latency replies we send
//    effort "low" and thinking disabled (allowed on Haiku 5.5 at effort high or below).
//  Bedrock: same Messages API body; verify on staging that the EU inference profile accepts
//  output_config and thinking (they can't be run from this environment).

export interface ClaudeSettings {
  effort: 'low' | 'medium' | 'high';
  thinking: 'disabled';
}

export const CLAUDE_SETTINGS: ClaudeSettings = {
  effort: 'low',
  thinking: 'disabled',
};

export interface MistralSettings {
  temperature: number;
  topP: number;
}

export const MISTRAL_SETTINGS: MistralSettings = {
  temperature: 0.7,
  topP: 1,
};

/**
 * Output token budget per request kind. Reply: META + 3 cards ≤ 300 chars each. Polish: META +
 * 2 versions of a draft of up to 1,000 chars (German/French run ~3.5 chars per token, so two full
 * versions need ~600 tokens): 900 so a long draft's rewrite is not cut off (Prompt 4).
 */
export const MAX_OUTPUT_TOKENS = { reply: 600, polish: 900 } as const;

/** Default model when ANTHROPIC_MODEL is not set. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-5-5';

/** HTTP timeout for one provider call (the first-token timeout in the pipeline is much shorter). */
export const PROVIDER_REQUEST_TIMEOUT_MS = 20_000;
