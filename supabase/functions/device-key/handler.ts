// POST /device-key {platform}         → 201 {keyId, key, platform, createdAt}   (Supabase JWT)
// DELETE /device-key {scope:'key', keyId} | {scope:'all'} → {revoked}
// Creating needs age confirmed + active AI consent. The key is returned once; only its SHA-256
// hex is stored. A new key revokes the user's earlier key on the same platform.
import { authenticate, type AuthDeps } from '../_shared/auth.ts';
import { generateDeviceKey, hashDeviceKey } from '../_shared/device-key.ts';
import { httpError, jsonResponse, methodNotAllowed } from '../_shared/errors.ts';
import { readJson } from '../_shared/http.ts';
import { logEvent } from '../_shared/log.ts';
import type { DeviceKeyRepo } from '../_shared/repo.ts';
import {
  DeviceKeyCreateRequest,
  type DeviceKeyCreateResponse,
  DeviceKeyRevokeRequest,
  type DeviceKeyRevokeResponse,
} from '../_shared/schemas.ts';

export interface DeviceKeyDeps {
  auth: AuthDeps;
  repo: DeviceKeyRepo;
  generateKey?: () => string;
}

export async function handleDeviceKey(req: Request, deps: DeviceKeyDeps): Promise<Response> {
  if (req.method !== 'POST' && req.method !== 'DELETE') throw methodNotAllowed(['POST', 'DELETE']);
  const { userId } = await authenticate(req, deps.auth, { allow: ['jwt'] });

  if (req.method === 'DELETE') {
    const body = await readJson(req, DeviceKeyRevokeRequest);
    const revoked = await deps.repo.revokeDeviceKeys(
      userId,
      body.scope === 'key' ? body.keyId : null,
    );
    logEvent('device-key', 'revoked', { scope: body.scope, revoked });
    const response: DeviceKeyRevokeResponse = { revoked };
    return jsonResponse(response);
  }

  const { platform } = await readJson(req, DeviceKeyCreateRequest);
  const key = (deps.generateKey ?? generateDeviceKey)();
  const result = await deps.repo.createDeviceKey(userId, await hashDeviceKey(key), platform);
  switch (result.status) {
    case 'age_required':
      throw httpError('age_required', 'Confirm you are 18 or over first.');
    case 'ai_off':
      throw httpError('ai_off', 'Allow AI replies first.');
    case 'no_profile':
      throw httpError('not_found', 'Profile not found.');
    case 'ok': {
      logEvent('device-key', 'created', { platform, rotated: result.rotated });
      const response: DeviceKeyCreateResponse = {
        keyId: result.keyId,
        key,
        platform,
        createdAt: result.createdAt,
      };
      return jsonResponse(response, 201);
    }
  }
}
