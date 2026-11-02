// In-memory stand-in for the database, for handler tests. It mirrors the rules of the SQL
// functions (starter credits once, withdraw revokes keys, key creation gated on age + consent,
// rotation per platform); the SQL itself is tested with pgTAP in supabase/tests.
import type { AuthDeps, DeviceKeyLookup } from '../auth.ts';
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
} from '../repo.ts';
import { httpError } from '../errors.ts';
import { AI_POLICY } from '../policy.ts';
import { canonicalTimeZone } from '../timezone.ts';
import type { Plan, Platform, ReplyFeedbackType } from '../schemas.ts';

export interface StoredConsent {
  userId: string;
  policyVersion: string;
  grantedAt: string;
  withdrawnAt: string | null;
}
export interface StoredDeviceKey {
  id: string;
  userId: string;
  keyHash: string;
  platform: Platform;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
export interface StoredCredit {
  userId: string;
  delta: number;
  reason: 'starter' | 'referral' | 'refund' | 'admin' | 'spend';
  requestId?: string;
}
export interface StoredRequest {
  id: string;
  userId: string;
  input: ConsumeInput;
  createdAt: number;
  charge: 'starter' | 'daily' | 'bonus' | 'paid';
  chargeDate: string;
  refundedAt: string | null;
  status: 'started' | FinishInput['status'];
  finish: FinishInput | null;
}
export interface StoredEntitlement {
  userId: string;
  product: 'weekly' | 'annual' | 'lifetime' | 'lifetime_upgrade';
  active: boolean;
  expiresAt: string | null;
}

/** 'YYYY-MM-DD' of `at` in time zone `tz`. */
export function localDate(tz: string, at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** UTC instant of local midnight at the start of the day after `date` in `tz`. */
export function nextLocalMidnight(tz: string, date: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d + 1);
  // Offset of tz at that instant (local wall time − UTC), refined once around DST changes.
  const offsetAt = (t: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(new Date(t));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return (
      Date.UTC(
        get('year'),
        get('month') - 1,
        get('day'),
        get('hour'),
        get('minute'),
        get('second'),
      ) - t
    );
  };
  let guess = naive - offsetAt(naive);
  guess = naive - offsetAt(guess);
  return new Date(guess);
}

export class MemoryStore implements AuthDeps, ConsentRepo, ProfileRepo, DeviceKeyRepo, ReplyRepo {
  readonly profiles = new Map<string, Omit<ProfileState, 'aiEnabled'>>();
  readonly consents: StoredConsent[] = [];
  readonly deviceKeys: StoredDeviceKey[] = [];
  readonly credits: StoredCredit[] = [];
  /** access token → user ID */
  readonly sessions = new Map<string, string>();
  readonly requests = new Map<string, StoredRequest>();
  /** `${userId}|${localDate}` → used */
  readonly usage = new Map<string, number>();
  readonly entitlements: StoredEntitlement[] = [];
  readonly replyEvents: Array<{
    requestId: string;
    userId: string;
    cardIndex: number;
    type: ReplyFeedbackType;
  }> = [];
  freeLimit = 3;
  rateLimit = 20;

  constructor(
    private readonly now: () => Date = () => new Date(),
    /** Mirrors the SQL gate's p_min_policy_version. */
    public minPolicyVersion: string = AI_POLICY.minimum,
  ) {}

  private ts(): string {
    return this.now().toISOString();
  }

  /** Simulates anonymous sign-in: auth user + profile (trigger) + a session token. */
  addUser(userId: string = crypto.randomUUID()): { userId: string; token: string } {
    this.profiles.set(userId, {
      id: userId,
      uiLang: 'en',
      iAm: null,
      theyAre: null,
      ageConfirmedAt: null,
      timezone: 'UTC',
      createdAt: this.ts(),
    });
    const token = `token-${userId}`;
    this.sessions.set(token, userId);
    return { userId, token };
  }

  aiAllowed(userId: string): boolean {
    const profile = this.profiles.get(userId);
    if (!profile?.ageConfirmedAt) return false;
    const latest = this.consents.filter((c) => c.userId === userId).at(-1);
    return (
      latest !== undefined &&
      latest.withdrawnAt === null &&
      /^\d{4}-\d{2}-\d{2}$/.test(latest.policyVersion) &&
      latest.policyVersion >= this.minPolicyVersion
    );
  }

  // AuthDeps
  verifyJwt(token: string): Promise<{ userId: string } | null> {
    const userId = this.sessions.get(token);
    return Promise.resolve(userId ? { userId } : null);
  }

  lookupDeviceKey(keyHash: string): Promise<DeviceKeyLookup | null> {
    const key = this.deviceKeys.find((k) => k.keyHash === keyHash);
    if (!key) return Promise.resolve(null);
    if (!key.revokedAt) key.lastUsedAt = this.ts();
    return Promise.resolve({ keyId: key.id, userId: key.userId, revoked: key.revokedAt !== null });
  }

  // ConsentRepo
  grantAiConsent(userId: string, policyVersion: string): Promise<GrantConsentResult> {
    const profile = this.profiles.get(userId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(policyVersion) || policyVersion < this.minPolicyVersion) {
      return Promise.resolve({ status: 'unknown_policy_version' });
    }
    if (!profile) return Promise.resolve({ status: 'no_profile' });
    if (!profile.ageConfirmedAt) return Promise.resolve({ status: 'age_required' });
    let latest = this.consents.filter((c) => c.userId === userId).at(-1);
    if (!latest || latest.withdrawnAt !== null || latest.policyVersion !== policyVersion) {
      latest = { userId, policyVersion, grantedAt: this.ts(), withdrawnAt: null };
      this.consents.push(latest);
    }
    const hasStarter = this.credits.some((c) => c.userId === userId && c.reason === 'starter');
    if (!hasStarter) this.credits.push({ userId, delta: 10, reason: 'starter' });
    return Promise.resolve({
      status: 'ok',
      policyVersion: latest.policyVersion,
      grantedAt: latest.grantedAt,
      starterGranted: !hasStarter,
      aiEnabled: this.aiAllowed(userId),
    });
  }

  withdrawAiConsent(userId: string): Promise<WithdrawConsentResult> {
    if (!this.profiles.has(userId)) return Promise.resolve({ status: 'no_profile' });
    const at = this.ts();
    let withdrawn = 0;
    for (const c of this.consents) {
      if (c.userId === userId && c.withdrawnAt === null) {
        c.withdrawnAt = at;
        withdrawn++;
      }
    }
    let revoked = 0;
    for (const k of this.deviceKeys) {
      if (k.userId === userId && k.revokedAt === null) {
        k.revokedAt = at;
        revoked++;
      }
    }
    return Promise.resolve({
      status: 'ok',
      withdrawnAt: at,
      withdrawn,
      revokedDeviceKeys: revoked,
    });
  }

  // ProfileRepo
  getProfile(userId: string): Promise<ProfileState | null> {
    const p = this.profiles.get(userId);
    return Promise.resolve(p ? { ...p, aiEnabled: this.aiAllowed(userId) } : null);
  }

  patchProfile(userId: string, patch: ProfilePatch): Promise<ProfileState | null> {
    const p = this.profiles.get(userId);
    if (!p) return Promise.resolve(null);
    if (patch.ageConfirmed) p.ageConfirmedAt ??= this.ts();
    if (patch.uiLang) p.uiLang = patch.uiLang;
    if (patch.iAm) p.iAm = patch.iAm;
    if (patch.theyAre) p.theyAre = patch.theyAre;
    if (patch.timezone) {
      // Like the database: only canonical names are stored (the handler canonicalises first).
      if (patch.timezone !== 'UTC' && canonicalTimeZone(patch.timezone) !== patch.timezone) {
        throw httpError('bad_request', 'Invalid request (profile: value rejected).');
      }
      p.timezone = patch.timezone;
    }
    return this.getProfile(userId);
  }

  // DeviceKeyRepo
  createDeviceKey(
    userId: string,
    keyHash: string,
    platform: Platform,
  ): Promise<CreateDeviceKeyResult> {
    const profile = this.profiles.get(userId);
    if (!profile) return Promise.resolve({ status: 'no_profile' });
    if (!profile.ageConfirmedAt) return Promise.resolve({ status: 'age_required' });
    if (!this.aiAllowed(userId)) return Promise.resolve({ status: 'ai_off' });
    if (!/^[0-9a-f]{64}$/.test(keyHash)) throw new Error('key_hash check violation');
    if (this.deviceKeys.some((k) => k.keyHash === keyHash))
      throw new Error('key_hash unique violation');
    const at = this.ts();
    let rotated = 0;
    for (const k of this.deviceKeys) {
      if (k.userId === userId && k.platform === platform && k.revokedAt === null) {
        k.revokedAt = at;
        rotated++;
      }
    }
    const key: StoredDeviceKey = {
      id: crypto.randomUUID(),
      userId,
      keyHash,
      platform,
      createdAt: at,
      lastUsedAt: null,
      revokedAt: null,
    };
    this.deviceKeys.push(key);
    return Promise.resolve({ status: 'ok', keyId: key.id, createdAt: at, rotated });
  }

  revokeDeviceKeys(userId: string, keyId: string | null): Promise<number> {
    const at = this.ts();
    let revoked = 0;
    for (const k of this.deviceKeys) {
      if (k.userId === userId && k.revokedAt === null && (keyId === null || k.id === keyId)) {
        k.revokedAt = at;
        revoked++;
      }
    }
    return Promise.resolve(revoked);
  }

  // ReplyRepo (mirrors consume_reply / refund_reply / quota_state / record_reply_event)
  private planOf(userId: string): { plan: Plan; cap: number | null } {
    const now = this.now().getTime();
    const active = this.entitlements.filter(
      (e) =>
        e.userId === userId && e.active && (e.expiresAt === null || Date.parse(e.expiresAt) > now),
    );
    if (active.length === 0) return { plan: 'free', cap: null };
    const lifetime = active.some(
      (e) => e.product === 'lifetime' || e.product === 'lifetime_upgrade',
    );
    const plan: Plan = lifetime
      ? 'lifetime'
      : active.some((e) => e.product === 'annual')
        ? 'annual'
        : 'weekly';
    const cap = Math.max(
      ...active.map((e) =>
        e.product === 'lifetime' || e.product === 'lifetime_upgrade' ? 100 : 300,
      ),
    );
    return { plan, cap };
  }

  private creditsOf(userId: string): { starter: number; bonus: number } {
    const rows = this.credits.filter((c) => c.userId === userId);
    const total = rows.reduce((a, c) => a + c.delta, 0);
    const starter = rows.filter((c) => c.reason === 'starter').reduce((a, c) => a + c.delta, 0);
    const spent = -rows
      .filter((c) => (c.reason === 'spend' || c.reason === 'refund') && c.requestId !== undefined)
      .reduce((a, c) => a + c.delta, 0);
    const starterLeft = Math.max(0, Math.min(total, starter - spent));
    return { starter: starterLeft, bonus: Math.max(0, total - starterLeft) };
  }

  private snapshot(userId: string, date: string, tz: string): QuotaSnapshot {
    const { plan, cap } = this.planOf(userId);
    const used = this.usage.get(`${userId}|${date}`) ?? 0;
    const { starter, bonus } = this.creditsOf(userId);
    return {
      plan,
      leftToday: plan === 'free' ? starter + Math.max(0, this.freeLimit - used) + bonus : null,
      fairUseLeft: plan === 'free' ? null : Math.max(0, (cap ?? 0) - used),
      resetAt: nextLocalMidnight(tz, date).toISOString(),
    };
  }

  checkAiAllowed(userId: string): Promise<boolean> {
    return Promise.resolve(this.aiAllowed(userId));
  }

  consumeReply(userId: string, input: ConsumeInput): Promise<ConsumeResult> {
    const profile = this.profiles.get(userId);
    if (!profile) return Promise.resolve({ status: 'no_profile' });
    if (!this.aiAllowed(userId)) return Promise.resolve({ status: 'ai_off' });
    const now = this.now();
    const recent = [...this.requests.values()].filter(
      (r) => r.userId === userId && r.createdAt > now.getTime() - 60_000,
    );
    if (recent.length >= this.rateLimit) {
      const oldest = Math.min(...recent.map((r) => r.createdAt));
      return Promise.resolve({
        status: 'rate',
        retryAfter: Math.max(1, Math.ceil((oldest + 60_000 - now.getTime()) / 1000)),
      });
    }
    const date = localDate(profile.timezone, now);
    const key = `${userId}|${date}`;
    const used = this.usage.get(key) ?? 0;
    const { plan, cap } = this.planOf(userId);
    let charge: StoredRequest['charge'];
    if (plan !== 'free') {
      if (used >= (cap ?? 0)) {
        return Promise.resolve({
          status: 'fair_use',
          quota: this.snapshot(userId, date, profile.timezone),
        });
      }
      charge = 'paid';
    } else {
      const { starter, bonus } = this.creditsOf(userId);
      if (starter > 0) charge = 'starter';
      else if (used < this.freeLimit) charge = 'daily';
      else if (bonus > 0) charge = 'bonus';
      else
        return Promise.resolve({
          status: 'quota_empty',
          quota: this.snapshot(userId, date, profile.timezone),
        });
    }
    const id = crypto.randomUUID();
    this.requests.set(id, {
      id,
      userId,
      input: structuredClone(input),
      createdAt: now.getTime(),
      charge,
      chargeDate: date,
      refundedAt: null,
      status: 'started',
      finish: null,
    });
    if (charge === 'daily' || charge === 'paid') this.usage.set(key, used + 1);
    else this.credits.push({ userId, delta: -1, reason: 'spend', requestId: id });
    return Promise.resolve({
      status: 'ok',
      requestId: id,
      quota: this.snapshot(userId, date, profile.timezone),
    });
  }

  refundReply(requestId: string): Promise<RefundResult> {
    const req = this.requests.get(requestId);
    if (!req) return Promise.resolve({ status: 'not_found' });
    if (req.refundedAt) return Promise.resolve({ status: 'already_refunded' });
    if (req.charge === 'daily' || req.charge === 'paid') {
      const key = `${req.userId}|${req.chargeDate}`;
      this.usage.set(key, Math.max(0, (this.usage.get(key) ?? 0) - 1));
    } else {
      this.credits.push({ userId: req.userId, delta: 1, reason: 'refund', requestId });
    }
    req.refundedAt = this.ts();
    const profile = this.profiles.get(req.userId);
    const quota = profile
      ? this.snapshot(req.userId, localDate(profile.timezone, this.now()), profile.timezone)
      : null;
    return Promise.resolve({ status: 'ok', quota });
  }

  finishRequest(requestId: string, input: FinishInput): Promise<void> {
    const req = this.requests.get(requestId);
    if (!req) return Promise.reject(new Error('no such request'));
    if ((input.safetyFlags as string[]).includes('crisis')) {
      return Promise.reject(new Error('crisis must not be stored'));
    }
    req.status = input.status;
    req.finish = structuredClone(input);
    return Promise.resolve();
  }

  recordReplyEvent(
    userId: string,
    requestId: string,
    cardIndex: number,
    type: ReplyFeedbackType,
  ): Promise<ReplyEventResult> {
    const req = this.requests.get(requestId);
    if (
      !req ||
      req.userId !== userId ||
      (req.status !== 'ok' && req.status !== 'partial') ||
      cardIndex >= (req.finish?.cards ?? 0)
    ) {
      return Promise.resolve('not_found');
    }
    if (
      this.replyEvents.some(
        (e) => e.requestId === requestId && e.cardIndex === cardIndex && e.type === type,
      )
    ) {
      return Promise.resolve('duplicate');
    }
    this.replyEvents.push({ requestId, userId, cardIndex, type });
    return Promise.resolve('ok');
  }

  quotaState(userId: string): Promise<QuotaSnapshot | null> {
    const profile = this.profiles.get(userId);
    if (!profile) return Promise.resolve(null);
    return Promise.resolve(
      this.snapshot(userId, localDate(profile.timezone, this.now()), profile.timezone),
    );
  }
}
