// API contract for the Replywise Edge Functions (CLAUDE.md "Code style").
//
// Shared by Deno (Edge Functions) and the React Native app (`@shared/schemas`), so this file is
// plain TypeScript: no Deno globals, no imports except `zod` (v4), only erasable syntax (Node runs
// it directly for scripts/export-reply-api.ts). Swift and Kotlin mirror these shapes; their
// contract tests read docs/reply-api.json, generated from this file.
import { z } from 'zod';

// ---------------------------------------------------------------------------------------------
// Shared vocabularies (codes, never user-facing text; labels come from locales/)

export const LANGS = ['en', 'de', 'fr', 'es', 'it'] as const;
export const Lang = z.enum(LANGS);
export type Lang = z.infer<typeof Lang>;

/** Language hint / detected language. `other` = not one of the five; reply in the keyboard language. */
export const LangHint = z.enum([...LANGS, 'other']);
export type LangHint = z.infer<typeof LangHint>;

/** Settings "I am" / "They are": woman, man, rather not say. */
export const Gender = z.enum(['woman', 'man', 'unspecified']);
export type Gender = z.infer<typeof Gender>;

export const Relationship = z.enum(['match', 'partner', 'friend', 'family', 'colleague']);
export type Relationship = z.infer<typeof Relationship>;

export const Tone = z.enum([
  'warm',
  'funny',
  'flirty',
  'confident',
  'calm',
  'apologise',
  'sayNoKindly',
  'professional',
]);
export type Tone = z.infer<typeof Tone>;

/** Flirt level. No explicit level exists (spec §3.2, §9). */
export const FlirtLevel = z.enum(['off', 'light', 'playful']);
export type FlirtLevel = z.infer<typeof FlirtLevel>;

export const Formality = z.enum(['casual', 'formal']);
export type Formality = z.infer<typeof Formality>;

/** Closeness 1–5: Just met · Getting to know · Friendly · Close · Very close. */
export const Closeness = z.number().int().min(1).max(5);
export type Closeness = z.infer<typeof Closeness>;

export const ReplyKind = z.enum(['reply', 'polish']);
export type ReplyKind = z.infer<typeof ReplyKind>;

export const RequestSource = z.enum(['keyboard', 'app']);
export type RequestSource = z.infer<typeof RequestSource>;

export const Platform = z.enum(['ios', 'android']);
export type Platform = z.infer<typeof Platform>;

/** Plan as seen by clients; lifetime_upgrade counts as lifetime. */
export const Plan = z.enum(['free', 'weekly', 'annual', 'lifetime']);
export type Plan = z.infer<typeof Plan>;

/**
 * Policy version as sent by the client: the consent text it showed. Shape only here; the server
 * accepts only versions listed in _shared/policy.ts (else 400 unknown_policy_version).
 */
export const PolicyVersion = z.string().regex(/^[A-Za-z0-9._-]{1,32}$/);

/** IANA time zone name, shape only. The server also checks it against the tz database. */
export const TimeZoneName = z
  .string()
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/);

/** Device key: 32 random bytes, base64url without padding (43 chars). Sent as `Authorization: Device <key>`. */
export const DeviceKey = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const IsoDateTime = z.iso.datetime({ offset: true });

// ---------------------------------------------------------------------------------------------
// Errors: every non-2xx response body is {error, message}

export const ErrorCode = z.enum([
  'bad_request', // 400
  'unknown_policy_version', // 400: consent for a policy version the server doesn't accept
  'unauthorized', // 401: missing, invalid or revoked credentials
  'quota_empty', // 402: free replies used up
  'ai_off', // 403: no active AI consent (or age not confirmed, for reply)
  'age_required', // 403: age 18+ not confirmed yet
  'not_found', // 404
  'method_not_allowed', // 405
  'payload_too_large', // 413
  'unsupported_media_type', // 415
  'rate', // 429: 20 requests per minute
  'fair_use', // 429: paid daily cap reached
  'internal', // 500
  'provider_down', // 503: every AI provider failing
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** `message` is a short English developer message; clients show localized copy by `error`. */
export const ErrorResponse = z.object({ error: ErrorCode, message: z.string() });
export type ErrorResponse = z.infer<typeof ErrorResponse>;

// All client request objects are strict: unknown keys are rejected (400), the same policy
// everywhere. Clients must not send fields the server doesn't know yet.

// ---------------------------------------------------------------------------------------------
// consent: POST (Supabase JWT)

export const ConsentGrantRequest = z.strictObject({
  action: z.literal('grant'),
  policyVersion: PolicyVersion,
});
export type ConsentGrantRequest = z.infer<typeof ConsentGrantRequest>;
export const ConsentWithdrawRequest = z.strictObject({ action: z.literal('withdraw') });
export type ConsentWithdrawRequest = z.infer<typeof ConsentWithdrawRequest>;
export const ConsentRequest = z.discriminatedUnion('action', [
  ConsentGrantRequest,
  ConsentWithdrawRequest,
]);
export type ConsentRequest = z.infer<typeof ConsentRequest>;

export const ConsentGrantResponse = z.object({
  action: z.literal('grant'),
  aiEnabled: z.boolean(),
  policyVersion: PolicyVersion,
  grantedAt: IsoDateTime,
  /** True only on the call that added the 10 starter replies (first grant ever). */
  starterCreditsGranted: z.boolean(),
});
export type ConsentGrantResponse = z.infer<typeof ConsentGrantResponse>;
export const ConsentWithdrawResponse = z.object({
  action: z.literal('withdraw'),
  aiEnabled: z.literal(false),
  withdrawnAt: IsoDateTime,
  /** Device keys revoked by this withdrawal; the app must also clear its stored key. */
  revokedDeviceKeys: z.number().int().min(0),
});
export type ConsentWithdrawResponse = z.infer<typeof ConsentWithdrawResponse>;
export const ConsentResponse = z.discriminatedUnion('action', [
  ConsentGrantResponse,
  ConsentWithdrawResponse,
]);
export type ConsentResponse = z.infer<typeof ConsentResponse>;

// ---------------------------------------------------------------------------------------------
// profile: GET, PATCH (Supabase JWT)

/** At least one field. Age: the client only says "confirmed"; the server records the time. */
export const ProfilePatchRequest = z
  .strictObject({
    ageConfirmed: z.literal(true).optional(),
    uiLang: Lang.optional(),
    iAm: Gender.optional(),
    theyAre: Gender.optional(),
    timezone: TimeZoneName.optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'At least one field is required.',
  });
export type ProfilePatchRequest = z.infer<typeof ProfilePatchRequest>;

export const ProfileResponse = z.object({
  id: z.uuid(),
  uiLang: Lang,
  iAm: Gender.nullable(),
  theyAre: Gender.nullable(),
  ageConfirmedAt: IsoDateTime.nullable(),
  timezone: z.string(),
  /** Age confirmed and the latest AI consent not withdrawn (mirror into v1.aiEnabled). */
  aiEnabled: z.boolean(),
  createdAt: IsoDateTime,
});
export type ProfileResponse = z.infer<typeof ProfileResponse>;

// ---------------------------------------------------------------------------------------------
// device-key: POST create, DELETE revoke (Supabase JWT)

export const DeviceKeyCreateRequest = z.strictObject({ platform: Platform });
export type DeviceKeyCreateRequest = z.infer<typeof DeviceKeyCreateRequest>;

/** The key is returned once and never again; only its SHA-256 is stored. */
export const DeviceKeyCreateResponse = z.object({
  keyId: z.uuid(),
  key: DeviceKey,
  platform: Platform,
  createdAt: IsoDateTime,
});
export type DeviceKeyCreateResponse = z.infer<typeof DeviceKeyCreateResponse>;

export const DeviceKeyRevokeRequest = z.discriminatedUnion('scope', [
  z.strictObject({ scope: z.literal('key'), keyId: z.uuid() }),
  z.strictObject({ scope: z.literal('all') }),
]);
export type DeviceKeyRevokeRequest = z.infer<typeof DeviceKeyRevokeRequest>;

export const DeviceKeyRevokeResponse = z.object({ revoked: z.number().int().min(0) });
export type DeviceKeyRevokeResponse = z.infer<typeof DeviceKeyRevokeResponse>;

// ---------------------------------------------------------------------------------------------
// reply: POST, SSE response (Supabase JWT or device key). Implemented in Prompt 3.

/** Max input length in Unicode code points (spec §3.3: 1,000 characters; clients cut the rest). */
export const REPLY_TEXT_MAX_CHARS = 1000;

export const ReplyRequest = z.strictObject({
  kind: ReplyKind,
  /** The copied message (reply) or the draft before the cursor (polish). Never logged or stored. */
  text: z
    .string()
    .min(1)
    .max(REPLY_TEXT_MAX_CHARS * 2) // UTF-16 upper bound; the code-point limit is checked below
    .refine((text) => text.trim().length > 0, { message: 'Text is empty.' })
    .refine((text) => Array.from(text).length <= REPLY_TEXT_MAX_CHARS, {
      message: `Text is longer than ${REPLY_TEXT_MAX_CHARS} characters.`,
    })
    .describe(
      'At most REPLY_TEXT_MAX_CHARS Unicode code points (maxLength is the UTF-16 bound). Not only whitespace.',
    ),
  langHint: LangHint,
  relationship: Relationship,
  closeness: Closeness,
  tone: Tone,
  flirt: FlirtLevel,
  formality: Formality,
  iAm: Gender,
  theyAre: Gender,
  uiLang: Lang,
  source: RequestSource,
  clientRequestId: z.uuid(),
});
export type ReplyRequest = z.infer<typeof ReplyRequest>;

/** POST reply/event: feedback on a card. */
export const ReplyFeedbackType = z.enum(['inserted', 'up', 'down']);
export type ReplyFeedbackType = z.infer<typeof ReplyFeedbackType>;
export const ReplyFeedbackRequest = z.strictObject({
  requestId: z.uuid(),
  cardIndex: z.number().int().min(0).max(2),
  type: ReplyFeedbackType,
});
export type ReplyFeedbackRequest = z.infer<typeof ReplyFeedbackRequest>;

/** Max length of one card (architecture §7 step 10). */
export const CARD_TEXT_MAX_CHARS = 300;

/** SSE `card`: one suggestion, sent as soon as its line is complete. Reply: index 0–2; Polish: 0 = light edit, 1 = rewrite. */
export const CardEvent = z.object({
  index: z.number().int().min(0).max(2),
  variant: z.enum(['reply', 'light', 'rewrite']),
  text: z
    .string()
    .min(1)
    .max(CARD_TEXT_MAX_CHARS * 2)
    .describe(
      'Server post-check keeps cards to CARD_TEXT_MAX_CHARS code points; label it "AI suggestion".',
    ),
});
export type CardEvent = z.infer<typeof CardEvent>;

/** SSE `meta`: from the model's META line. crisis → show the crisis card above the cards. */
export const MetaEvent = z.object({
  requestId: z.uuid(),
  lang: LangHint,
  crisis: z.boolean(),
  refused: z.boolean(),
});
export type MetaEvent = z.infer<typeof MetaEvent>;

/** SSE `quota` and the `quota` function's response; mirrored into v1.quota. null = unlimited / not applicable. */
export const QuotaEvent = z.object({
  plan: Plan,
  leftToday: z.number().int().min(0).nullable(),
  resetAt: IsoDateTime,
  fairUseLeft: z.number().int().min(0).nullable(),
});
export type QuotaEvent = z.infer<typeof QuotaEvent>;
export const QuotaResponse = QuotaEvent;
export type QuotaResponse = QuotaEvent;

/** SSE `done`: the stream is complete. */
export const DoneEvent = z.object({
  requestId: z.uuid(),
  cards: z.number().int().min(0).max(3),
});
export type DoneEvent = z.infer<typeof DoneEvent>;

/** SSE `error`: the stream failed; same codes as HTTP errors. */
export const ErrorEvent = z.object({ error: ErrorCode, message: z.string() });
export type ErrorEvent = z.infer<typeof ErrorEvent>;

export const SSE_EVENT_NAMES = ['card', 'meta', 'quota', 'done', 'error'] as const;
export type SseEventName = (typeof SSE_EVENT_NAMES)[number];

/** Payload schema per SSE event name (`event: <name>` / `data: <json>`). */
export const SseEventPayloads = {
  card: CardEvent,
  meta: MetaEvent,
  quota: QuotaEvent,
  done: DoneEvent,
  error: ErrorEvent,
} as const;
