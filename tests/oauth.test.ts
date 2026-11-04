import { expect, test } from 'vitest';
import { randomBytes, createHash } from 'node:crypto';
import { createDatabase } from '@/lib/db';
import { createAuth } from '@/lib/auth/server';
import { resolveIdentity } from '@/lib/auth/identity';
import { serve } from './helpers/http-server';

test('performs an OAuth 2.1 PKCE grant and verifies a resource-bound agent access token', async () => {
  const db = await createDatabase({ dataDir: 'memory://' });
  let auth: ReturnType<typeof createAuth>;
  const http = await serve(request => auth.handler(request));
  try {
    const baseURL = http.baseURL;
    const setupKey = randomBytes(32).toString('hex');
    const password = randomBytes(24).toString('base64url');
    auth = createAuth(db, { baseURL, setupKey, ownerEmail: 'oauth@mefagram.local', secret: randomBytes(40).toString('hex') });
    const owner = await auth.api.signUpEmail({ body: { email: 'oauth@mefagram.local', password, name: 'OAuth Owner' }, headers: new Headers({ 'x-mefagram-setup-key': setupKey }) });
    const signedIn = await fetch(`${baseURL}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: baseURL }, body: JSON.stringify({ email: 'oauth@mefagram.local', password }) });
    const cookie = signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const callback = 'https://agent.example/callback';
    const registered = await fetch(`${baseURL}/api/auth/oauth2/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Mefagram OAuth test', redirect_uris: [callback], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope: 'diagrams:read diagrams:write offline_access' }) });
    expect(registered.status, await registered.clone().text()).toBe(201);
    const client = await registered.json();
    const verifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({ client_id: client.client_id, redirect_uri: callback, response_type: 'code', scope: 'diagrams:read diagrams:write offline_access', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: 'state-owned-by-client', resource: `${baseURL}/api/mcp` });
    const authorized = await fetch(`${baseURL}/api/auth/oauth2/authorize?${query}`, { headers: { cookie, accept: 'application/json' }, redirect: 'manual' });
    expect(authorized.status, await authorized.clone().text()).toBe(200);
    const consentURL = new URL((await authorized.json()).url, baseURL);
    expect(consentURL.pathname).toBe('/consent');
    const consent = await fetch(`${baseURL}/api/auth/oauth2/consent`, { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: baseURL }, body: JSON.stringify({ accept: true, oauth_query: consentURL.search.slice(1) }) });
    expect(consent.status, await consent.clone().text()).toBe(200);
    const result = await consent.json();
    const redirect = new URL(result.url);
    expect(redirect.searchParams.get('state')).toBe('state-owned-by-client');
    const exchanged = await fetch(`${baseURL}/api/auth/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: client.client_id, code: redirect.searchParams.get('code')!, redirect_uri: callback, code_verifier: verifier, resource: `${baseURL}/api/mcp` }) });
    expect(exchanged.status, await exchanged.clone().text()).toBe(200);
    const tokens = await exchanged.json();
    expect(tokens.refresh_token).toBeTruthy();
    const request = new Request(`${baseURL}/api/mcp`, { method: 'POST', headers: { authorization: `Bearer ${tokens.access_token}` } });
    const identity = await resolveIdentity(request, auth, db, 'diagrams:write', baseURL, false);
    expect(identity.userId).toBe(owner.user.id);
    const tampered = new Request(`${baseURL}/api/mcp`, { headers: { authorization: `Bearer ${tokens.access_token.slice(0, -12)}invalidtoken` } });
    await expect(resolveIdentity(tampered, auth, db, 'diagrams:read', baseURL, false)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  } finally { await http.close(); await db.close(); }
});
