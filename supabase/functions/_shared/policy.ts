// AI-sharing consent policy versions: the single source of truth for which consent texts the
// server accepts (CLAUDE.md rule 6). Plain TS with no imports so the app can import it too
// (`@shared/policy`) to know which version its consent screen shows.
//
// Versions are dates (YYYY-MM-DD). To publish a new consent text: add its version to
// AI_POLICY_VERSIONS and set CURRENT. Raise MIN only when earlier consents must no longer count:
// every user whose latest consent is older then has AI off (app, keyboard, reply) until they
// consent again.

export const AI_POLICY_VERSIONS = ['2026-11-01'] as const;
export type AiPolicyVersion = (typeof AI_POLICY_VERSIONS)[number];

export const CURRENT_AI_POLICY_VERSION: AiPolicyVersion = '2026-11-01';
export const MIN_AI_POLICY_VERSION: AiPolicyVersion = '2026-11-01';

export interface AiPolicy {
  /** Versions the server knows. */
  accepted: readonly string[];
  /** The version new consent screens show. */
  current: string;
  /** Oldest version that still enables AI; passed to every SQL gate. */
  minimum: string;
}

export const AI_POLICY: AiPolicy = {
  accepted: AI_POLICY_VERSIONS,
  current: CURRENT_AI_POLICY_VERSION,
  minimum: MIN_AI_POLICY_VERSION,
};

const VERSION = /^\d{4}-\d{2}-\d{2}$/;

/** A grant is accepted only for a known version that is not below the minimum. */
export function isAcceptedPolicyVersion(version: string, policy: AiPolicy = AI_POLICY): boolean {
  return VERSION.test(version) && policy.accepted.includes(version) && version >= policy.minimum;
}
