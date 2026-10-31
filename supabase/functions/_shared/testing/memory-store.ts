// In-memory stand-in for the database, for handler tests. It mirrors the rules of the SQL
// functions (starter credits once, withdraw revokes keys, key creation gated on age + consent,
// rotation per platform); the SQL itself is tested with pgTAP in supabase/tests.
import type { AuthDeps, DeviceKeyLookup } from '../auth.ts';
import type {
  ConsentRepo,
  CreateDeviceKeyResult,
  DeviceKeyRepo,
  GrantConsentResult,
  ProfilePatch,
  ProfileRepo,
  ProfileState,
  WithdrawConsentResult,
} from '../repo.ts';
import type { Platform } from '../schemas.ts';

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
  reason: 'starter' | 'referral' | 'refund' | 'admin';
}

export class MemoryStore implements AuthDeps, ConsentRepo, ProfileRepo, DeviceKeyRepo {
  readonly profiles = new Map<string, Omit<ProfileState, 'aiEnabled'>>();
  readonly consents: StoredConsent[] = [];
  readonly deviceKeys: StoredDeviceKey[] = [];
  readonly credits: StoredCredit[] = [];
  /** access token → user ID */
  readonly sessions = new Map<string, string>();

  constructor(private readonly now: () => Date = () => new Date()) {}

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
    return latest !== undefined && latest.withdrawnAt === null;
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
      aiEnabled: true,
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
    if (patch.timezone) p.timezone = patch.timezone;
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
}
