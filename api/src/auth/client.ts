import { createAuthClient } from "better-auth/client";
import { genericOAuthClient } from "better-auth/client/plugins";

/**
 * Better Auth client instance for use in route handlers.
 *
 * Provides session management and authentication APIs:
 * - authClient.signIn.oauth2({ providerId: "oidc" }) - Initiate OIDC sign-in
 * - authClient.signOut() - Terminate session
 *
 * The genericOAuthClient plugin enables OAuth2/OIDC sign-in flows.
 */
export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});
