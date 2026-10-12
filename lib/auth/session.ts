import { cookies } from 'next/headers';
import { verifyToken, TokenPayload } from './jwt';

export async function getCurrentUser(request?: Request): Promise<TokenPayload | null> {
  const cookieToken = cookies().get('token')?.value;
  if (cookieToken) {
    return verifyToken(cookieToken);
  }

  const authHeader = request?.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const headerToken = authHeader.slice('Bearer '.length);
  return verifyToken(headerToken);
}
