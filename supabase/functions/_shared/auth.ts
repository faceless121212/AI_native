// Authentication for Edge Functions: `Authorization: Bearer <Supabase JWT>` (app) or
// `Authorization: Device <key>` (keyboards, `reply` only). Device keys are looked up by SHA-256
// hash; unknown or revoked keys fail. Never log the header.
import { httpError } from './errors.ts';
import { hashDeviceKey, isDeviceKeyFormat } from './device-key.ts';

export type AuthMethod = 'jwt' | 'device';

export interface AuthContext {
  userId: string;
  method: AuthMethod;
  /** Set when method is 'device'. */
  deviceKeyId: string | null;
}

export interface DeviceKeyLookup {
  keyId: string;
  userId: string;
  revoked: boolean;
}

export interface AuthDeps {
  /** Verifies a Supabase access token and returns its user, or null if invalid or expired. */
  verifyJwt(token: string): Promise<{ userId: string } | null>;
  /** Finds a device key by hash (and records last_used_at for a live key). */
  lookupDeviceKey(keyHash: string): Promise<DeviceKeyLookup | null>;
}

export type ParsedAuthorization =
  { scheme: 'bearer'; token: string } | { scheme: 'device'; key: string };

export function parseAuthorization(header: string | null): ParsedAuthorization | null {
  if (!header) return null;
  const match = /^(\S+) +(\S+)$/.exec(header.trim());
  if (!match) return null;
  const [, scheme, credential] = match;
  if (!scheme || !credential) return null;
  switch (scheme.toLowerCase()) {
    case 'bearer':
      return { scheme: 'bearer', token: credential };
    case 'device':
      return { scheme: 'device', key: credential };
    default:
      return null;
  }
}

export async function authenticate(
  req: Request,
  deps: AuthDeps,
  options: { allow: readonly AuthMethod[] },
): Promise<AuthContext> {
  const parsed = parseAuthorization(req.headers.get('authorization'));
  if (!parsed) throw httpError('unauthorized', 'Missing or malformed Authorization header.');

  if (parsed.scheme === 'bearer') {
    if (!options.allow.includes('jwt')) {
      throw httpError('unauthorized', 'This endpoint needs a device key.');
    }
    const user = await deps.verifyJwt(parsed.token);
    if (!user) throw httpError('unauthorized', 'Session is invalid or expired.');
    return { userId: user.userId, method: 'jwt', deviceKeyId: null };
  }

  if (!options.allow.includes('device')) {
    throw httpError('unauthorized', 'This endpoint needs a signed-in session.');
  }
  if (!isDeviceKeyFormat(parsed.key)) throw httpError('unauthorized', 'Device key is invalid.');
  const found = await deps.lookupDeviceKey(await hashDeviceKey(parsed.key));
  if (!found) throw httpError('unauthorized', 'Device key is invalid.');
  if (found.revoked) throw httpError('unauthorized', 'Device key was revoked.');
  return { userId: found.userId, method: 'device', deviceKeyId: found.keyId };
}
