// Data access used by the handlers, as interfaces so handlers can be tested with an in-memory
// fake (testing/memory-store.ts). The Supabase implementation is repo-supabase.ts; the SQL
// functions it calls hold the real rules (supabase/migrations, tested with pgTAP).
import type { Gender, Lang, Platform } from './schemas.ts';

export type GrantConsentResult =
  | {
      status: 'ok';
      policyVersion: string;
      grantedAt: string;
      starterGranted: boolean;
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
  iAm: Gender | null;
  theyAre: Gender | null;
  ageConfirmedAt: string | null;
  timezone: string;
  createdAt: string;
  aiEnabled: boolean;
}

export interface ProfilePatch {
  ageConfirmed?: true;
  uiLang?: Lang;
  iAm?: Gender;
  theyAre?: Gender;
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
