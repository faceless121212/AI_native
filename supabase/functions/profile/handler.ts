// GET /profile, PATCH /profile {ageConfirmed?: true, uiLang?, timezone?}
// (Supabase JWT). age_confirmed_at is set by the server clock, once. The time zone is stored
// under its canonical IANA name ('europe/berlin' → 'Europe/Berlin').
import { authenticate, type AuthDeps } from '../_shared/auth.ts';
import { httpError, jsonResponse, methodNotAllowed } from '../_shared/errors.ts';
import { readJson } from '../_shared/http.ts';
import type { ProfileRepo, ProfileState } from '../_shared/repo.ts';
import { ProfilePatchRequest, type ProfileResponse } from '../_shared/schemas.ts';
import { canonicalTimeZone } from '../_shared/timezone.ts';

export interface ProfileDeps {
  auth: AuthDeps;
  repo: ProfileRepo;
}

function toResponse(p: ProfileState): ProfileResponse {
  return {
    id: p.id,
    uiLang: p.uiLang,
    ageConfirmedAt: p.ageConfirmedAt,
    timezone: p.timezone,
    aiEnabled: p.aiEnabled,
    createdAt: p.createdAt,
  };
}

export async function handleProfile(req: Request, deps: ProfileDeps): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'PATCH') throw methodNotAllowed(['GET', 'PATCH']);
  const { userId } = await authenticate(req, deps.auth, { allow: ['jwt'] });

  if (req.method === 'GET') {
    const profile = await deps.repo.getProfile(userId);
    if (!profile) throw httpError('not_found', 'Profile not found.');
    return jsonResponse(toResponse(profile));
  }

  const patch = await readJson(req, ProfilePatchRequest);
  let timezone: string | undefined;
  if (patch.timezone !== undefined) {
    const canonical = canonicalTimeZone(patch.timezone);
    if (!canonical)
      throw httpError('bad_request', 'Invalid request (timezone: unknown time zone).');
    timezone = canonical;
  }
  const profile = await deps.repo.patchProfile(userId, { ...patch, timezone });
  if (!profile) throw httpError('not_found', 'Profile not found.');
  return jsonResponse(toResponse(profile));
}
