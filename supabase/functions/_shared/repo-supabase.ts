// Supabase implementation of AuthDeps and the repositories, over the SQL functions in
// supabase/migrations (service role). RPC results are validated before use.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { AuthDeps, DeviceKeyLookup } from './auth.ts';
import type {
  ConsentRepo,
  ConsumeInput,
  ConsumeResult,
  CreateDeviceKeyResult,
  DeviceKeyRepo,
  FinishInput,
  GrantConsentResult,
  ProfilePatch,
  ProfileRepo,
  ProfileState,
  QuotaSnapshot,
  RefundResult,
  ReplyEventResult,
  ReplyRepo,
  WithdrawConsentResult,
} from './repo.ts';
import { httpError } from './errors.ts';
import type { ProviderStatusStore } from './llm/health.ts';
import { PROVIDER_NAMES, type ProviderName } from './llm/provider.ts';
import { AI_POLICY } from './policy.ts';
import { REPLY_RATE_LIMIT } from './rate-limit.ts';
import {
  Lang,
  type LangHint,
  Plan,
  type Platform,
  type ReplyFeedbackType,
  type RequestSource,
} from './schemas.ts';

/** Error carrying only the Postgres/PostgREST code (never the message, which can echo values). */
export class DbError extends Error {
  constructor(
    readonly op: string,
    readonly code: string | null,
  ) {
    super(`Database call ${op} failed`);
    this.name = 'DbError';
  }
}

async function rpc<S extends z.ZodType>(
  db: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  schema: S,
): Promise<z.output<S>> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new DbError(fn, typeof error.code === 'string' ? error.code : null);
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new DbError(fn, 'unexpected_shape');
  return parsed.data;
}

const Timestamp = z.string().min(1);

const GrantRow = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    policy_version: z.string(),
    granted_at: Timestamp,
    ai_enabled: z.boolean(),
  }),
  z.object({ status: z.enum(['age_required', 'no_profile', 'unknown_policy_version']) }),
]);

const WithdrawRow = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    withdrawn_at: Timestamp,
    withdrawn: z.number().int(),
    revoked_device_keys: z.number().int(),
  }),
  z.object({ status: z.literal('no_profile') }),
]);

const ProfileRow = z.object({
  id: z.string(),
  ui_lang: Lang,
  age_confirmed_at: Timestamp.nullable(),
  timezone: z.string(),
  created_at: Timestamp,
  ai_enabled: z.boolean(),
});

const CreateKeyRow = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    key_id: z.string(),
    created_at: Timestamp,
    rotated: z.number().int(),
  }),
  z.object({ status: z.enum(['ai_off', 'age_required', 'no_profile']) }),
]);

const LookupRows = z.array(
  z.object({ key_id: z.string(), user_id: z.string(), revoked: z.boolean() }),
);

/** Postgres returns "2026-10-31T21:54:40.882348+00:00"; normalise to ISO 8601 with Z. */
function iso(ts: string): string {
  return new Date(ts).toISOString();
}

function toProfile(row: z.output<typeof ProfileRow>): ProfileState {
  return {
    id: row.id,
    uiLang: row.ui_lang,
    ageConfirmedAt: row.age_confirmed_at === null ? null : iso(row.age_confirmed_at),
    timezone: row.timezone,
    createdAt: iso(row.created_at),
    aiEnabled: row.ai_enabled,
  };
}

export function supabaseAuthDeps(db: SupabaseClient): AuthDeps {
  return {
    async verifyJwt(token) {
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user) return null;
      return { userId: data.user.id };
    },
    async lookupDeviceKey(keyHash): Promise<DeviceKeyLookup | null> {
      const rows = await rpc(db, 'lookup_device_key', { p_key_hash: keyHash }, LookupRows);
      const row = rows[0];
      return row ? { keyId: row.key_id, userId: row.user_id, revoked: row.revoked } : null;
    },
  };
}

export class SupabaseRepo implements ConsentRepo, ProfileRepo, DeviceKeyRepo {
  /** minPolicyVersion: passed to every SQL gate (ai_allowed); defaults to _shared/policy.ts. */
  constructor(
    private readonly db: SupabaseClient,
    private readonly minPolicyVersion: string = AI_POLICY.minimum,
  ) {}

  async grantAiConsent(userId: string, policyVersion: string): Promise<GrantConsentResult> {
    const row = await rpc(
      this.db,
      'grant_ai_consent',
      {
        p_user_id: userId,
        p_policy_version: policyVersion,
        p_min_policy_version: this.minPolicyVersion,
      },
      GrantRow,
    );
    if (row.status !== 'ok') return { status: row.status };
    return {
      status: 'ok',
      policyVersion: row.policy_version,
      grantedAt: iso(row.granted_at),
      aiEnabled: row.ai_enabled,
    };
  }

  async withdrawAiConsent(userId: string): Promise<WithdrawConsentResult> {
    const row = await rpc(this.db, 'withdraw_ai_consent', { p_user_id: userId }, WithdrawRow);
    if (row.status !== 'ok') return { status: row.status };
    return {
      status: 'ok',
      withdrawnAt: iso(row.withdrawn_at),
      withdrawn: row.withdrawn,
      revokedDeviceKeys: row.revoked_device_keys,
    };
  }

  async getProfile(userId: string): Promise<ProfileState | null> {
    const row = await rpc(
      this.db,
      'profile_state',
      { p_user_id: userId, p_min_policy_version: this.minPolicyVersion },
      ProfileRow.nullable(),
    );
    return row ? toProfile(row) : null;
  }

  async patchProfile(userId: string, patch: ProfilePatch): Promise<ProfileState | null> {
    const row = await rpc(
      this.db,
      'patch_profile',
      {
        p_user_id: userId,
        p_min_policy_version: this.minPolicyVersion,
        p_age_confirmed: patch.ageConfirmed ?? null,
        p_ui_lang: patch.uiLang ?? null,
        p_timezone: patch.timezone ?? null,
      },
      ProfileRow.nullable(),
    ).catch((err: unknown) => {
      // check_violation: the database refused a value (e.g. a time zone it doesn't know).
      if (err instanceof DbError && err.code === '23514') {
        throw httpError('bad_request', 'Invalid request (profile: value rejected).');
      }
      throw err;
    });
    return row ? toProfile(row) : null;
  }

  async createDeviceKey(
    userId: string,
    keyHash: string,
    platform: Platform,
  ): Promise<CreateDeviceKeyResult> {
    const row = await rpc(
      this.db,
      'create_device_key',
      {
        p_user_id: userId,
        p_key_hash: keyHash,
        p_platform: platform,
        p_min_policy_version: this.minPolicyVersion,
      },
      CreateKeyRow,
    );
    if (row.status !== 'ok') return { status: row.status };
    return {
      status: 'ok',
      keyId: row.key_id,
      createdAt: iso(row.created_at),
      rotated: row.rotated,
    };
  }

  async revokeDeviceKeys(userId: string, keyId: string | null): Promise<number> {
    return await rpc(
      this.db,
      'revoke_device_keys',
      { p_user_id: userId, p_key_id: keyId },
      z.number().int(),
    );
  }
}

// ---------------------------------------------------------------------------------------------
// reply, quota, provider status (Prompt 3)

const QuotaFields = {
  plan: Plan,
  left_today: z.number().int().nullable(),
  fair_use_left: z.number().int().nullable(),
  reset_at: Timestamp,
};

const ConsumeRow = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), request_id: z.string(), ...QuotaFields }),
  z.object({ status: z.enum(['ai_off', 'no_profile']) }),
  z.object({ status: z.literal('rate'), retry_after: z.number().int() }),
  z.object({ status: z.enum(['quota_empty', 'fair_use']), ...QuotaFields }),
]);

const QuotaRow = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), ...QuotaFields }),
  z.object({ status: z.literal('no_profile') }),
]);

const RefundRow = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), quota: z.object(QuotaFields).loose().nullable() }).loose(),
  z.object({ status: z.enum(['already_refunded', 'not_charged', 'not_found']) }).loose(),
]);

function toQuota(row: {
  plan: Plan;
  left_today: number | null;
  fair_use_left: number | null;
  reset_at: string;
}): QuotaSnapshot {
  return {
    plan: row.plan,
    leftToday: row.left_today === null ? null : Math.max(0, row.left_today),
    fairUseLeft: row.fair_use_left === null ? null : Math.max(0, row.fair_use_left),
    resetAt: iso(row.reset_at),
  };
}

export class SupabaseReplyRepo implements ReplyRepo {
  constructor(
    private readonly db: SupabaseClient,
    private readonly minPolicyVersion: string = AI_POLICY.minimum,
    private readonly rateLimit: number = REPLY_RATE_LIMIT,
  ) {}

  async checkAiAllowed(userId: string): Promise<boolean> {
    return await rpc(
      this.db,
      'ai_allowed',
      { p_user_id: userId, p_min_policy_version: this.minPolicyVersion },
      z.boolean(),
    );
  }

  async stillAllowed(userId: string, deviceKeyId: string | null): Promise<boolean> {
    return await rpc(
      this.db,
      'reply_still_allowed',
      {
        p_user_id: userId,
        p_min_policy_version: this.minPolicyVersion,
        p_device_key_id: deviceKeyId,
      },
      z.boolean(),
    );
  }

  async consumeReply(userId: string, input: ConsumeInput): Promise<ConsumeResult> {
    const row = await rpc(
      this.db,
      'consume_reply',
      {
        p_user_id: userId,
        p_local_date: null,
        p_min_policy_version: this.minPolicyVersion,
        p_kind: input.kind,
        p_source: input.source,
        p_tone: input.tone,
        p_relationship: input.relationship,
        p_closeness: input.closeness,
        p_formality: input.formality,
        p_flirt: input.flirt,
        p_safety_flags: input.safetyFlags,
        p_rate_limit: this.rateLimit,
      },
      ConsumeRow,
    );
    switch (row.status) {
      case 'ok':
        return { status: 'ok', requestId: row.request_id, quota: toQuota(row) };
      case 'rate':
        return { status: 'rate', retryAfter: row.retry_after };
      case 'quota_empty':
      case 'fair_use':
        return { status: row.status, quota: toQuota(row) };
      default:
        return { status: row.status };
    }
  }

  async refundReply(requestId: string): Promise<RefundResult> {
    const row = await rpc(this.db, 'refund_reply', { p_request_id: requestId }, RefundRow);
    if (row.status === 'ok') return { status: 'ok', quota: row.quota ? toQuota(row.quota) : null };
    return { status: row.status };
  }

  async finishRequest(requestId: string, input: FinishInput): Promise<void> {
    // 'crisis' is not a StoredSafetyFlag, so it can't reach this row (open privacy decision).
    const { error } = await this.db
      .from('ai_requests')
      .update({
        status: input.status,
        lang: input.lang,
        provider: input.provider,
        model: input.model,
        prompt_version: input.promptVersion,
        tokens_in: input.tokensIn,
        tokens_out: input.tokensOut,
        cost_micro_eur: input.costMicroEur,
        ms_first: input.msFirst,
        ms_total: input.msTotal,
        safety_flags: input.safetyFlags,
        cards: input.cards,
        delivered_cards: input.deliveredCards,
        ...(input.clearChips ? { relationship: null, tone: null, flirt: null } : {}),
      })
      .eq('id', requestId);
    if (error)
      throw new DbError('finish_ai_request', typeof error.code === 'string' ? error.code : null);
  }

  async recordReplyEvent(
    userId: string,
    requestId: string,
    cardIndex: number,
    type: ReplyFeedbackType,
  ): Promise<ReplyEventResult> {
    return await rpc(
      this.db,
      'record_reply_event',
      { p_user_id: userId, p_request_id: requestId, p_card_index: cardIndex, p_type: type },
      z.enum(['ok', 'duplicate', 'not_found']),
    );
  }

  async recordCrisis(lang: LangHint, source: RequestSource): Promise<void> {
    const { error } = await this.db.rpc('increment_crisis_daily', {
      p_lang: lang,
      p_source: source,
    });
    if (error) {
      throw new DbError(
        'increment_crisis_daily',
        typeof error.code === 'string' ? error.code : null,
      );
    }
  }

  async quotaState(userId: string): Promise<QuotaSnapshot | null> {
    const row = await rpc(this.db, 'quota_state', { p_user_id: userId }, QuotaRow);
    return row.status === 'ok' ? toQuota(row) : null;
  }
}

const StatusRows = z.array(
  z.object({ provider: z.enum(PROVIDER_NAMES), down_until: Timestamp.nullable() }),
);

export class SupabaseProviderStatusStore implements ProviderStatusStore {
  constructor(private readonly db: SupabaseClient) {}

  async readStatus(): Promise<Map<ProviderName, Date | null>> {
    const { data, error } = await this.db.from('provider_status').select('provider, down_until');
    if (error)
      throw new DbError('read_provider_status', typeof error.code === 'string' ? error.code : null);
    const rows = StatusRows.safeParse(data);
    if (!rows.success) throw new DbError('read_provider_status', 'unexpected_shape');
    return new Map(
      rows.data.map((r) => [r.provider, r.down_until === null ? null : new Date(r.down_until)]),
    );
  }

  async recordFailure(name: ProviderName): Promise<Date | null> {
    const until = await rpc(
      this.db,
      'record_provider_failure',
      { p_provider: name },
      Timestamp.nullable(),
    );
    return until === null ? null : new Date(until);
  }
}
