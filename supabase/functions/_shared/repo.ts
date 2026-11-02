// Data access used by the handlers, as interfaces so handlers can be tested with an in-memory
// fake (testing/memory-store.ts). The Supabase implementation is repo-supabase.ts; the SQL
// functions it calls hold the real rules (supabase/migrations, tested with pgTAP).
import type { ProviderName } from './llm/provider.ts';
import type {
  FlirtLevel,
  Formality,
  Lang,
  LangHint,
  Plan,
  Platform,
  Relationship,
  ReplyFeedbackType,
  ReplyKind,
  RequestSource,
  Tone,
} from './schemas.ts';

export type GrantConsentResult =
  | {
      status: 'ok';
      policyVersion: string;
      grantedAt: string;
      aiEnabled: boolean;
    }
  | { status: 'age_required' | 'no_profile' | 'unknown_policy_version' };

export type WithdrawConsentResult =
  | { status: 'ok'; withdrawnAt: string; withdrawn: number; revokedDeviceKeys: number }
  | { status: 'no_profile' };

export interface ConsentRepo {
  grantAiConsent(userId: string, policyVersion: string): Promise<GrantConsentResult>;
  withdrawAiConsent(userId: string): Promise<WithdrawConsentResult>;
}

export interface ProfileState {
  id: string;
  uiLang: Lang;
  ageConfirmedAt: string | null;
  timezone: string;
  createdAt: string;
  aiEnabled: boolean;
}

export interface ProfilePatch {
  ageConfirmed?: true;
  uiLang?: Lang;
  timezone?: string;
}

export interface ProfileRepo {
  /** Rejects values the database refuses (e.g. an unknown time zone) with HttpError bad_request. */
  getProfile(userId: string): Promise<ProfileState | null>;
  patchProfile(userId: string, patch: ProfilePatch): Promise<ProfileState | null>;
}

export type CreateDeviceKeyResult =
  | { status: 'ok'; keyId: string; createdAt: string; rotated: number }
  | { status: 'ai_off' | 'age_required' | 'no_profile' };

export interface DeviceKeyRepo {
  createDeviceKey(
    userId: string,
    keyHash: string,
    platform: Platform,
  ): Promise<CreateDeviceKeyResult>;
  /** keyId null = all of the user's keys. Only ever touches the user's own keys. */
  revokeDeviceKeys(userId: string, keyId: string | null): Promise<number>;
}

// ---------------------------------------------------------------------------------------------
// reply, quota (Prompt 3)

/** Safety flags that may be stored per request. 'crisis' is deliberately not storable: whether a
 * per-user crisis signal may be kept at all is an open privacy decision (docs/processors.md). */
export type StoredSafetyFlag = 'refused' | 'redacted' | 'card_dropped' | 'flirt_forced_off';

export type RequestStatus = 'ok' | 'partial' | 'refused' | 'error' | 'cancelled';

export interface QuotaSnapshot {
  plan: Plan;
  leftToday: number | null;
  fairUseLeft: number | null;
  resetAt: string;
}

export interface ConsumeInput {
  kind: ReplyKind;
  source: RequestSource;
  tone: Tone;
  relationship: Relationship;
  closeness: number;
  formality: Formality;
  flirt: FlirtLevel;
  safetyFlags: StoredSafetyFlag[];
}

export type ConsumeResult =
  | { status: 'ok'; requestId: string; quota: QuotaSnapshot }
  | { status: 'ai_off' | 'no_profile' }
  | { status: 'rate'; retryAfter: number }
  | { status: 'quota_empty' | 'fair_use'; quota: QuotaSnapshot };

export type RefundResult =
  | { status: 'ok'; quota: QuotaSnapshot | null }
  | { status: 'already_refunded' | 'not_charged' | 'not_found' };

export interface FinishInput {
  status: RequestStatus;
  lang: LangHint | null;
  provider: ProviderName | null;
  model: string | null;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
  costMicroEur: number;
  msFirst: number | null;
  msTotal: number;
  safetyFlags: StoredSafetyFlag[];
  /** Number of cards sent to the client. */
  cards: number;
  /** Indexes of the cards sent (feedback is accepted only for these). */
  deliveredCards: number[];
}

export type ReplyEventResult = 'ok' | 'duplicate' | 'not_found';

export interface ReplyRepo {
  /** Age confirmed and an active AI consent at the minimum policy version. */
  checkAiAllowed(userId: string): Promise<boolean>;
  /**
   * Mid-request re-check (before a retry or a fallback): AI still allowed and, for keyboard
   * requests, the device key still live.
   */
  stillAllowed(userId: string, deviceKeyId: string | null): Promise<boolean>;
  /** Atomic gate + rate + quota charge; creates the ai_requests row on 'ok'. */
  consumeReply(userId: string, input: ConsumeInput): Promise<ConsumeResult>;
  refundReply(requestId: string): Promise<RefundResult>;
  /** Final metadata for the request row. Never text. */
  finishRequest(requestId: string, input: FinishInput): Promise<void>;
  recordReplyEvent(
    userId: string,
    requestId: string,
    cardIndex: number,
    type: ReplyFeedbackType,
  ): Promise<ReplyEventResult>;
  quotaState(userId: string): Promise<QuotaSnapshot | null>;
  /**
   * +1 on the anonymous crisis_daily count (UTC day, language, source). Deliberately takes no
   * user or request ID: nothing per user is stored about crisis.
   */
  recordCrisis(lang: LangHint, source: RequestSource): Promise<void>;
}
