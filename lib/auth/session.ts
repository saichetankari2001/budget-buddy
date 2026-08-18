import { cookies } from 'next/headers';
import { verifyToken, TokenPayload } from './jwt';

export async function getCurrentUser(): Promise<TokenPayload | null> {
  const token = cookies().get('token')?.value;
  if (!token) {
    return null;
  }
  return verifyToken(token);
}
