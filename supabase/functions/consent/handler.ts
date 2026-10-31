// POST /consent  {action: 'grant', policyVersion} | {action: 'withdraw'}   (Supabase JWT)
// Grant: only for a policy version listed in _shared/policy.ts and not below the minimum (else
// 400 unknown_policy_version); requires age confirmed; the first grant ever adds 10 starter
// replies (once, enforced in SQL). Withdraw: stops AI at once and revokes every device key.
import { authenticate, type AuthDeps } from '../_shared/auth.ts';
import { httpError, jsonResponse, methodNotAllowed } from '../_shared/errors.ts';
import { readJson } from '../_shared/http.ts';
import { logEvent } from '../_shared/log.ts';
import { AI_POLICY, type AiPolicy, isAcceptedPolicyVersion } from '../_shared/policy.ts';
import type { ConsentRepo } from '../_shared/repo.ts';
import {
  ConsentRequest,
  type ConsentGrantResponse,
  type ConsentWithdrawResponse,
} from '../_shared/schemas.ts';

export interface ConsentDeps {
  auth: AuthDeps;
  repo: ConsentRepo;
  /** Defaults to _shared/policy.ts; must match the repo's minimum. */
  policy?: AiPolicy;
}

export async function handleConsent(req: Request, deps: ConsentDeps): Promise<Response> {
  if (req.method !== 'POST') throw methodNotAllowed(['POST']);
  const { userId } = await authenticate(req, deps.auth, { allow: ['jwt'] });
  const body = await readJson(req, ConsentRequest);

  if (body.action === 'grant') {
    if (!isAcceptedPolicyVersion(body.policyVersion, deps.policy ?? AI_POLICY)) {
      throw httpError(
        'unknown_policy_version',
        'This consent text is out of date. Update the app.',
      );
    }
    const result = await deps.repo.grantAiConsent(userId, body.policyVersion);
    if (result.status === 'unknown_policy_version') {
      throw httpError(
        'unknown_policy_version',
        'This consent text is out of date. Update the app.',
      );
    }
    if (result.status === 'age_required') {
      throw httpError('age_required', 'Confirm you are 18 or over first.');
    }
    if (result.status !== 'ok') throw httpError('not_found', 'Profile not found.');
    logEvent('consent', 'granted', { starterGranted: result.starterGranted });
    const response: ConsentGrantResponse = {
      action: 'grant',
      aiEnabled: result.aiEnabled,
      policyVersion: result.policyVersion,
      grantedAt: result.grantedAt,
      starterCreditsGranted: result.starterGranted,
    };
    return jsonResponse(response);
  }

  const result = await deps.repo.withdrawAiConsent(userId);
  if (result.status !== 'ok') throw httpError('not_found', 'Profile not found.');
  logEvent('consent', 'withdrawn', { revokedDeviceKeys: result.revokedDeviceKeys });
  const response: ConsentWithdrawResponse = {
    action: 'withdraw',
    aiEnabled: false,
    withdrawnAt: result.withdrawnAt,
    revokedDeviceKeys: result.revokedDeviceKeys,
  };
  return jsonResponse(response);
}
