import { oauthProvider } from '@better-auth/oauth-provider';
import { jwt } from 'better-auth/plugins';

export const diagramScopes = ['diagrams:read', 'diagrams:write'] as const;
export function authPlugins(baseURL: string) {
  return [jwt({ jwt: { issuer: `${baseURL}/api/auth` } }), oauthProvider({
    loginPage: '/sign-in', consentPage: '/consent',
    scopes: ['openid', 'profile', 'email', 'offline_access', ...diagramScopes],
    grantTypes: ['authorization_code', 'refresh_token'],
    accessTokenExpiresIn: 300,
    refreshTokenExpiresIn: 60 * 60 * 24 * 7,
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    clientRegistrationRequirePKCE: true,
    resources: [`${baseURL}/api/mcp`],
    clientRegistrationDefaultResources: [`${baseURL}/api/mcp`],
  })];
}

