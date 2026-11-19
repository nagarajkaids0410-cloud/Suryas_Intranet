import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'smib_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;

export type SessionIdentity = {
  userId: string;
  username: string;
  role: string;
  sessionVersion: number;
  expiresAt: number;
};

function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

export function createSessionToken(user: Pick<SessionIdentity, 'userId' | 'username' | 'role' | 'sessionVersion'>): string {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('SESSION_SECRET must be configured with at least 32 characters.');
  }

  const payload: SessionIdentity = {
    ...user,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): SessionIdentity | null {
  const secret = getSessionSecret();
  if (!secret) return null;

  const [encodedPayload, encodedSignature, extra] = token.split('.');
  if (!encodedPayload || !encodedSignature || extra !== undefined) return null;

  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest();
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(encodedSignature, 'base64url');
  } catch {
    return null;
  }
  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return null;
  }

  try {
    const identity = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as SessionIdentity;
    if (
      !identity.userId ||
      !identity.username ||
      !identity.role ||
      !Number.isInteger(identity.sessionVersion) ||
      !Number.isFinite(identity.expiresAt) ||
      identity.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return identity;
  } catch {
    return null;
  }
}

export function getSessionIdentity(request: { headers: { get(name: string): string | null } }): SessionIdentity | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!cookie) return null;

  return verifySessionToken(cookie.slice(SESSION_COOKIE_NAME.length + 1));
}

export function setSessionCookie(response: Response, token: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`
  );
}

export function clearSessionCookie(response: Response): void {
  response.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}