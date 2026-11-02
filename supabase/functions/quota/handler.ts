// GET /quota → QuotaResponse {plan, leftToday, resetAt, fairUseLeft}   Supabase JWT or device key
// The app mirrors it into v1.quota; the keyboard also gets a `quota` event with every reply.
import { authenticate, type AuthDeps } from '../_shared/auth.ts';
import { httpError, jsonResponse, methodNotAllowed } from '../_shared/errors.ts';
import type { ReplyRepo } from '../_shared/repo.ts';
import type { QuotaResponse } from '../_shared/schemas.ts';

export interface QuotaDeps {
  auth: AuthDeps;
  repo: Pick<ReplyRepo, 'quotaState'>;
}

export async function handleQuota(req: Request, deps: QuotaDeps): Promise<Response> {
  if (req.method !== 'GET') throw methodNotAllowed(['GET']);
  const { userId } = await authenticate(req, deps.auth, { allow: ['jwt', 'device'] });
  const quota = await deps.repo.quotaState(userId);
  if (!quota) throw httpError('not_found', 'Profile not found.');
  const response: QuotaResponse = {
    plan: quota.plan,
    leftToday: quota.leftToday,
    resetAt: quota.resetAt,
    fairUseLeft: quota.fairUseLeft,
  };
  return jsonResponse(response);
}
