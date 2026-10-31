// Supabase implementation of AuthDeps and the repositories, over the SQL functions in
// supabase/migrations (service role). RPC results are validated before use.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { AuthDeps, DeviceKeyLookup } from './auth.ts';
import type {
  ConsentRepo,
  CreateDeviceKeyResult,
  DeviceKeyRepo,
  GrantConsentResult,
  ProfilePatch,
  ProfileRepo,
  ProfileState,
  WithdrawConsentResult,
} from './repo.ts';
import { httpError } from './errors.ts';
import { AI_POLICY } from './policy.ts';
import { Gender, Lang, type Platform } from './schemas.ts';

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
    starter_granted: z.boolean(),
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
  i_am: Gender.nullable(),
  they_are: Gender.nullable(),
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
    iAm: row.i_am,
    theyAre: row.they_are,
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
      starterGranted: row.starter_granted,
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
        p_i_am: patch.iAm ?? null,
        p_they_are: patch.theyAre ?? null,
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
