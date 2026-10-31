// POST /consent  {action: 'grant', policyVersion} | {action: 'withdraw'}   (Supabase JWT)
// Grant: requires age confirmed; the first grant ever adds 10 starter replies (once, enforced in
// SQL). Withdraw: stops AI at once and revokes every device key of the user.
import { authenticate, type AuthDeps } from '../_shared/auth.ts';
import { httpError, jsonResponse, methodNotAllowed } from '../_shared/errors.ts';
import { readJson } from '../_shared/http.ts';
import { logEvent } from '../_shared/log.ts';
import type { ConsentRepo } from '../_shared/repo.ts';
import {
  ConsentRequest,
  type ConsentGrantResponse,
  type ConsentWithdrawResponse,
} from '../_shared/schemas.ts';

export interface ConsentDeps {
  auth: AuthDeps;
  repo: ConsentRepo;
}

export async function handleConsent(req: Request, deps: ConsentDeps): Promise<Response> {
  if (req.method !== 'POST') throw methodNotAllowed(['POST']);
  const { userId } = await authenticate(req, deps.auth, { allow: ['jwt'] });
  const body = await readJson(req, ConsentRequest);

  if (body.action === 'grant') {
    const result = await deps.repo.grantAiConsent(userId, body.policyVersion);
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
