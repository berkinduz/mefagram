export interface AuthConfig { baseURL: string; secret: string; setupKey: string; ownerEmail: string }

export function authConfig(): AuthConfig {
  const baseURL = (process.env.BETTER_AUTH_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
  const secret = process.env.BETTER_AUTH_SECRET ?? '';
  const setupKey = process.env.MEFAGRAM_SETUP_KEY ?? '';
  const ownerEmail = process.env.MEFAGRAM_OWNER_EMAIL ?? '';
  if (secret.length < 32 || setupKey.length < 32 || !ownerEmail) throw new Error('Mefagram is not configured. Run npm run setup before starting the application.');
  const url = new URL(baseURL);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('A hosted Mefagram URL must use HTTPS.');
  return { baseURL, secret, setupKey, ownerEmail: ownerEmail.toLowerCase() };
}
