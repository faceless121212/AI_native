// Server analytics events (spec §12), typed so only listed events with code-valued properties can
// be sent: no personal data, no text. safety_flag is anonymous only (no user ID). Sending to PostHog EU arrives with Prompt 13 (and its
// privacy review); until then the default sink drops events.
//
// Deliberately absent: a `crisis` safety_flag event. Whether a crisis signal may be recorded per
// user at all is an open privacy decision (docs/processors.md, open questions).
import type {
  Closeness,
  Formality,
  Lang,
  LangHint,
  Plan,
  Relationship,
  ReplyFeedbackType,
  ReplyKind,
  RequestSource,
  Tone,
} from './schemas.ts';
import type { ProviderName } from './llm/provider.ts';

/** Events keyed by the anonymous user ID (spec §12). */
export type UserEvent =
  | {
      name: 'reply_requested';
      props: {
        kind: ReplyKind;
        lang: LangHint | Lang;
        tone: Tone;
        relationship: Relationship;
        closeness: Closeness;
        formality: Formality;
        source: RequestSource;
      };
    }
  | { name: 'reply_shown'; props: { latency_ms: number; provider: ProviderName } }
  | { name: 'reply_inserted'; props: { card_index: number } }
  | { name: 'reply_feedback'; props: { rating: Exclude<ReplyFeedbackType, 'inserted'> } }
  | { name: 'quota_hit'; props: { plan: Plan } }
  | { name: 'provider_fallback'; props: { from: ProviderName; to: ProviderName | null } };

/**
 * Events sent WITHOUT any user or device identifier (anonymous aggregate counts). safety_flag is
 * only allowed here (privacy review): a per-user refusal or redaction record isn't needed.
 */
export type AnonymousEvent = {
  name: 'safety_flag';
  props: { type: 'refused' | 'redacted' | 'card_dropped' | 'flirt_forced_off' };
};

export interface Analytics {
  track(userId: string, event: UserEvent): void;
  /** No distinct ID is attached, so these can't be linked to a user. */
  trackAnonymous(event: AnonymousEvent): void;
}

export const noAnalytics: Analytics = { track: () => {}, trackAnonymous: () => {} };

/** Test sink. */
export class MemoryAnalytics implements Analytics {
  readonly events: Array<{ userId: string } & UserEvent> = [];
  readonly anonymous: AnonymousEvent[] = [];
  track(userId: string, event: UserEvent): void {
    this.events.push({ userId, ...event });
  }
  trackAnonymous(event: AnonymousEvent): void {
    this.anonymous.push(event);
  }
}
