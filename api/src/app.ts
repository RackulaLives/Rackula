import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import layouts from "./routes/layouts";
import assets from "./routes/assets";
import {
  createSignedAuthSessionToken,
  createAuthSessionCookieHeader,
  createAuthGateMiddleware,
  createCsrfProtectionMiddleware,
  createExpiredAuthSessionCookieHeader,
  createRefreshedAuthSessionCookieHeader,
  createWriteAuthMiddleware,
  invalidateAuthSession,
  resolveAuthenticatedSessionClaims,
  resolveApiSecurityConfig,
  verifySignedAuthSessionToken,
  type AuthSessionClaims,
  type EnvMap,
} from "./security";
import { createAuthHandler } from "./middleware/auth";
import { createAuth } from "./auth/config";
import { createRequireAdminMiddleware } from "./authorization";
import { configureAuthLogHashKey, safeLogAuthEvent } from "./auth-logger";
import {
  bootstrapLocalCredentials,
  createLoginRateLimiter,
  MAX_PASSWORD_LENGTH,
  verifyCredentials,
} from "./local-auth";

const DEFAULT_MAX_ASSET_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_MAX_LAYOUT_SIZE = 1 * 1024 * 1024; // 1MB
const OIDC_PROVIDER_ID = "oidc";
const HEALTH_RESPONSE = {
  ok: true,
  status: "ok",
  service: "rackula-persistence-api",
  version: 1,
} as const;

type AppEnv = {
  Variables: {
    authSubject: string;
    authClaims: AuthSessionClaims | undefined;
  };
};

type BetterAuthSessionLike = {
  session: {
    id?: string;
    createdAt?: Date | string | number;
    expiresAt?: Date | string | number;
  };
  user: {
    id?: string | null;
    email?: string | null;
  };
};

type BetterAuthSessionApiResult = {
  headers?: Headers;
  response?: BetterAuthSessionLike | null;
};

function normalizeNextPath(next: string | undefined): string {
  if (!next) {
    return "/";
  }

  const trimmed = next.trim();
  if (!trimmed.startsWith("/")) {
    return "/";
  }

  if (trimmed.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return "/";
  }

  return trimmed;
}

function readSetCookieHeaders(headers: Headers | undefined): string[] {
  if (!headers) {
    return [];
  }

  const withGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof withGetSetCookie.getSetCookie === "function") {
    return withGetSetCookie.getSetCookie();
  }

  const rawSetCookie = headers.get("set-cookie");
  return rawSetCookie ? [rawSetCookie] : [];
}

function appendSetCookieHeaders(
  c: Context,
  headers: Headers | undefined,
): void {
  for (const setCookieHeader of readSetCookieHeaders(headers)) {
    c.header("Set-Cookie", setCookieHeader, { append: true });
  }
}

function toEpochSeconds(
  value: Date | string | number | undefined,
): number | null {
  if (value instanceof Date) {
    const epochSeconds = Math.floor(value.getTime() / 1000);
    return Number.isFinite(epochSeconds) ? epochSeconds : null;
  }

  if (typeof value === "string") {
    const epochSeconds = Math.floor(new Date(value).getTime() / 1000);
    return Number.isFinite(epochSeconds) ? epochSeconds : null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    // Handle millisecond timestamps (common for JS Date.getTime()) as well as second timestamps.
    const seconds = value > 1e11 ? Math.floor(value / 1000) : Math.floor(value);
    return Number.isFinite(seconds) ? seconds : null;
  }

  return null;
}

function mapFallbackSessionClaims(
  session: BetterAuthSessionLike,
  authSessionConfig: {
    authSessionGeneration: number;
    authSessionIdleTimeoutSeconds: number;
  },
): AuthSessionClaims | null {
  const sessionId = session.session.id?.trim();
  if (!sessionId) {
    return null;
  }

  const issuedAt = toEpochSeconds(session.session.createdAt);
  const expiresAt = toEpochSeconds(session.session.expiresAt);
  if (!issuedAt || !expiresAt || expiresAt <= issuedAt) {
    return null;
  }

  // Use persisted creation metadata as fallback idle-timeout source of truth.
  // Do not derive idle expiry from request-time "now", which permits silent extension.
  const idleExpiresAt = Math.min(
    expiresAt,
    issuedAt + authSessionConfig.authSessionIdleTimeoutSeconds,
  );
  if (idleExpiresAt <= issuedAt) {
    return null;
  }

  const fallbackSubject =
    session.user.email?.trim() || session.user.id?.trim() || "oidc-user";
  if (fallbackSubject === "oidc-user") {
    console.warn(
      "auth: OIDC session missing user identity (email and id), using generic subject",
    );
  }
  // MVP: all authenticated users get admin role. Role-based access control
  // (viewer, editor) will be added when RACKULA_OIDC_ROLE_CLAIM is implemented.
  return {
    sub: fallbackSubject,
    sid: sessionId,
    iat: issuedAt,
    exp: expiresAt,
    idleExp: idleExpiresAt,
    generation: authSessionConfig.authSessionGeneration,
    role: "admin",
  };
}

function validateFallbackSessionClaims(
  claims: AuthSessionClaims,
  authSessionConfig: {
    authSessionSecret?: string;
    authSessionGeneration: number;
    authSessionMaxAgeSeconds: number;
    authSessionIdleTimeoutSeconds: number;
  },
): AuthSessionClaims | null {
  if (!authSessionConfig.authSessionSecret) {
    return null;
  }

  try {
    const token = createSignedAuthSessionToken(
      claims,
      authSessionConfig.authSessionSecret,
      {
        sessionGeneration: authSessionConfig.authSessionGeneration,
        sessionMaxAgeSeconds: authSessionConfig.authSessionMaxAgeSeconds,
        sessionIdleTimeoutSeconds:
          authSessionConfig.authSessionIdleTimeoutSeconds,
      },
    );

    return verifySignedAuthSessionToken(
      token,
      authSessionConfig.authSessionSecret,
      {
        expectedGeneration: authSessionConfig.authSessionGeneration,
        maxSessionMaxAgeSeconds: authSessionConfig.authSessionMaxAgeSeconds,
      },
    );
  } catch {
    return null;
  }
}

/**
 * Create and configure the Hono application with all middleware and routes.
 *
 * Bootstraps auth credentials (when AUTH_MODE=local), configures CORS, CSRF,
 * auth gate, rate limiting, and mounts layout/asset routes.
 *
 * @param env - Environment variable map (defaults to `process.env`).
 * @returns Fully configured Hono application instance.
 * @throws If required environment variables are missing or invalid during bootstrap.
 */
export async function createApp(
  env: EnvMap = process.env,
): Promise<Hono<AppEnv>> {
  const app = new Hono<AppEnv>();
  const securityConfig = resolveApiSecurityConfig(env);
  configureAuthLogHashKey(securityConfig.authLogHashKey);

  // Bootstrap local credentials when auth mode is local
  if (securityConfig.authMode === "local") {
    const localCreds = await bootstrapLocalCredentials(env);
    securityConfig.localCredentials = localCreds;
    // Scrub plaintext password from environment after hashing
    delete env.RACKULA_LOCAL_PASSWORD;
    if (
      securityConfig.isProduction &&
      !securityConfig.authSessionCookieSecure
    ) {
      console.warn(
        "⚠ Local auth mode in production without Secure cookies. Set RACKULA_AUTH_SESSION_COOKIE_SECURE=true.",
      );
    }
  }

  if (securityConfig.isProduction && securityConfig.allowInsecureCors) {
    console.warn(
      "⚠ Running with wildcard CORS in production because ALLOW_INSECURE_CORS=true.",
    );
  }

  if (securityConfig.isProduction && !securityConfig.writeAuthToken) {
    console.warn(
      "⚠ Write-route auth token is not configured. Set RACKULA_API_WRITE_TOKEN to protect PUT/DELETE routes.",
    );
  }

  if (securityConfig.authEnabled) {
    console.warn(
      `🔒 Authentication gate enabled (mode=${securityConfig.authMode}). Anonymous access is blocked by default.`,
    );
  }

  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: securityConfig.corsOrigin,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );

  // Better Auth instance — created with validated session secret
  const auth = securityConfig.authSessionSecret
    ? createAuth(securityConfig.authSessionSecret, env)
    : undefined;
  const authApi = (auth?.api ?? {}) as Record<string, unknown>;

  const authSessionConfig = {
    authEnabled: securityConfig.authEnabled,
    authSessionSecret: securityConfig.authSessionSecret,
    authSessionCookieName: securityConfig.authSessionCookieName,
    authSessionCookieSecure: securityConfig.authSessionCookieSecure,
    authSessionCookieSameSite: securityConfig.authSessionCookieSameSite,
    authSessionIdleTimeoutSeconds: securityConfig.authSessionIdleTimeoutSeconds,
    authSessionGeneration: securityConfig.authSessionGeneration,
    authSessionMaxAgeSeconds: securityConfig.authSessionMaxAgeSeconds,
  };

  const resolveFallbackClaims = async (
    requestHeaders: Headers,
  ): Promise<AuthSessionClaims | null> => {
    const getSession = authApi.getSession as
      | ((options: {
          headers: Headers;
          returnHeaders: boolean;
        }) => Promise<BetterAuthSessionApiResult>)
      | undefined;

    if (typeof getSession !== "function") {
      return null;
    }

    try {
      const fallbackSessionResult = await getSession({
        headers: requestHeaders,
        returnHeaders: true,
      });

      const mappedFallbackClaims = fallbackSessionResult.response
        ? mapFallbackSessionClaims(
            fallbackSessionResult.response,
            authSessionConfig,
          )
        : null;
      return mappedFallbackClaims
        ? validateFallbackSessionClaims(mappedFallbackClaims, authSessionConfig)
        : null;
    } catch (error) {
      console.debug("auth: fallback session check failed", error);
      return null;
    }
  };

  if (securityConfig.authEnabled) {
    app.use(
      "*",
      createAuthGateMiddleware(
        {
          ...authSessionConfig,
          authLoginPath: securityConfig.authLoginPath,
        },
        (request) => resolveFallbackClaims(request.headers),
      ),
    );
  }

  app.use(
    "*",
    createCsrfProtectionMiddleware({
      authEnabled: securityConfig.authEnabled,
      csrfProtectionEnabled: securityConfig.csrfProtectionEnabled,
      csrfTrustedOrigins: securityConfig.csrfTrustedOrigins,
      authSessionCookieName: securityConfig.authSessionCookieName,
    }),
  );

  if (securityConfig.authEnabled) {
    const authPlugins = Array.isArray(auth?.options?.plugins)
      ? auth.options.plugins
      : [];
    const oidcApiAvailable =
      Boolean(auth) &&
      securityConfig.authMode === "oidc" &&
      authPlugins.length > 0 &&
      typeof authApi.signInWithOAuth2 === "function" &&
      typeof authApi.oAuth2Callback === "function";

    const authUnavailableRouteHandler = (c: Context<AppEnv>) =>
      c.json(
        {
          error: "Auth provider not configured",
          message:
            "Authentication is enabled, but login/callback handlers are not available.",
        },
        501,
      );

    const isLocalAuth = securityConfig.authMode === "local";

    const authLoginRouteHandler = async (c: Context<AppEnv>) => {
      if (isLocalAuth) {
        // For local auth, the GET /auth/login serves the static login page via nginx.
        // If the API receives a GET request directly, return a fallback message.
        return c.json(
          {
            error: "Login page not available",
            message:
              "Navigate to /auth/login in your browser to access the login page.",
          },
          501,
        );
      }

      if (!oidcApiAvailable) {
        return authUnavailableRouteHandler(c);
      }

      try {
        const signInWithOAuth2 = authApi.signInWithOAuth2 as (options: {
          headers: Headers;
          body: {
            providerId: string;
            callbackURL: string;
          };
          returnHeaders: boolean;
        }) => Promise<{ headers?: Headers; response?: { url?: string } }>;

        const signInResult = await signInWithOAuth2({
          headers: c.req.raw.headers,
          body: {
            providerId: OIDC_PROVIDER_ID,
            callbackURL: normalizeNextPath(c.req.query("next")),
          },
          returnHeaders: true,
        });

        appendSetCookieHeaders(c, signInResult.headers);

        const redirectUrl = signInResult.response?.url;
        if (!redirectUrl) {
          throw new Error("OIDC provider did not return an authorization URL.");
        }

        return c.redirect(redirectUrl, 302);
      } catch (error) {
        console.error("OIDC login initiation failed:", error);
        return c.json(
          {
            error: "Authentication failed",
            message: "Unable to initiate OIDC login.",
          },
          502,
        );
      }
    };

    const authCallbackRouteHandler = async (c: Context<AppEnv>) => {
      if (isLocalAuth) {
        return c.json({ error: "Not found" }, 404);
      }

      if (!oidcApiAvailable) {
        return authUnavailableRouteHandler(c);
      }

      const callbackUrl = new URL(c.req.url);
      callbackUrl.pathname = "/api/auth/oauth2/callback/oidc";
      const proxyRequest = new Request(callbackUrl.toString(), {
        method: c.req.raw.method,
        headers: c.req.raw.headers,
      });
      return auth!.handler(proxyRequest);
    };

    const authCheckRouteHandler = async (c: Context<AppEnv>) => {
      const signedClaims = resolveAuthenticatedSessionClaims(
        c.req.raw,
        authSessionConfig,
      );

      if (signedClaims) {
        c.set("authSubject", signedClaims.sub);
        c.set("authClaims", signedClaims);

        const refreshedCookie = createRefreshedAuthSessionCookieHeader(
          signedClaims,
          authSessionConfig,
        );
        if (refreshedCookie) {
          c.header("Set-Cookie", refreshedCookie, { append: true });
        }

        return c.body(null, 204);
      }

      const fallbackClaims = await resolveFallbackClaims(c.req.raw.headers);
      if (fallbackClaims) {
        c.set("authSubject", fallbackClaims.sub);
        c.set("authClaims", fallbackClaims);
        return c.body(null, 204);
      }

      safeLogAuthEvent("auth.session.invalid", c.req.raw, {
        reason: "missing or invalid session cookie",
      });
      return c.json(
        {
          error: "Unauthorized",
          message: "Authentication required.",
        },
        401,
      );
    };

    const authLogoutRouteHandler = async (c: Context<AppEnv>) => {
      const signedClaims = resolveAuthenticatedSessionClaims(
        c.req.raw,
        authSessionConfig,
      );
      let logoutSubject: string | undefined = signedClaims?.sub;

      if (signedClaims) {
        c.set("authSubject", signedClaims.sub);
        c.set("authClaims", signedClaims);
        invalidateAuthSession(signedClaims.sid, signedClaims.exp);
      }

      const fallbackClaims = await resolveFallbackClaims(c.req.raw.headers);
      if (fallbackClaims) {
        invalidateAuthSession(fallbackClaims.sid, fallbackClaims.exp);
        if (!logoutSubject) {
          logoutSubject = fallbackClaims.sub;
        }
      }

      const signOut = authApi.signOut as
        | ((options: {
            headers: Headers;
            returnHeaders: boolean;
          }) => Promise<{ headers?: Headers }>)
        | undefined;
      if (typeof signOut === "function") {
        try {
          const signOutResult = await signOut({
            headers: c.req.raw.headers,
            returnHeaders: true,
          });
          appendSetCookieHeaders(c, signOutResult.headers);
        } catch (error) {
          console.debug("auth: provider sign-out failed", error);
        }
      }

      if (logoutSubject) {
        safeLogAuthEvent("auth.logout", c.req.raw, { subject: logoutSubject });
      }

      c.header(
        "Set-Cookie",
        createExpiredAuthSessionCookieHeader(authSessionConfig),
        { append: true },
      );
      return c.body(null, 204);
    };

    app.get("/auth/login", authLoginRouteHandler);
    app.get("/auth/callback", authCallbackRouteHandler);
    app.get("/auth/check", authCheckRouteHandler);
    app.post("/auth/logout", authLogoutRouteHandler);

    app.get("/api/auth/login", authLoginRouteHandler);
    app.get("/api/auth/callback", authCallbackRouteHandler);
    app.get("/api/auth/check", authCheckRouteHandler);
    app.post("/api/auth/logout", authLogoutRouteHandler);

    // Local auth: POST /auth/login for username/password authentication
    if (
      isLocalAuth &&
      securityConfig.localCredentials &&
      securityConfig.authSessionSecret
    ) {
      const rateLimiter = createLoginRateLimiter();
      const localCredentials = securityConfig.localCredentials;
      const sessionSecret = securityConfig.authSessionSecret;
      const LOGIN_BODY_MAX_SIZE = 8 * 1024; // 8KB

      const localLoginBodyLimit = bodyLimit({
        maxSize: LOGIN_BODY_MAX_SIZE,
        onError: (c) => c.json({ error: "Request body too large" }, 413),
      });

      const localLoginHandler = async (c: Context<AppEnv>) => {
        const contentType = c.req.header("content-type")?.toLowerCase();
        if (!contentType || !contentType.includes("application/json")) {
          return c.json(
            {
              error: "Bad Request",
              message: "Content-Type must be application/json.",
            },
            400,
          );
        }

        let body: unknown;
        try {
          body = await c.req.json();
        } catch {
          return c.json(
            { error: "Bad Request", message: "Invalid JSON body." },
            400,
          );
        }

        if (!body || typeof body !== "object") {
          return c.json(
            {
              error: "Bad Request",
              message: "Request body must be a JSON object.",
            },
            400,
          );
        }

        const { username: rawUsername, password } = body as Record<
          string,
          unknown
        >;
        if (
          typeof rawUsername !== "string" ||
          !rawUsername.trim() ||
          typeof password !== "string" ||
          !password
        ) {
          return c.json(
            {
              error: "Bad Request",
              message: "Username and password are required.",
            },
            400,
          );
        }

        const username = rawUsername.trim();
        if (username.length > 255 || password.length > MAX_PASSWORD_LENGTH) {
          return c.json(
            { error: "Bad Request", message: "Invalid credential length." },
            400,
          );
        }

        // Prefer X-Real-IP (set by nginx to $remote_addr, not client-spoofable).
        // Fall back to the LAST X-Forwarded-For entry (closest proxy, harder to spoof).
        const realIp = c.req.header("x-real-ip")?.trim();
        const forwardedFor = c.req.header("x-forwarded-for");
        const lastProxy = forwardedFor?.split(",").pop()?.trim();
        const ip = (realIp || lastProxy || "unknown").slice(0, 64);
        const rateCheck = rateLimiter.check(ip);
        if (!rateCheck.allowed) {
          const retryAfterSeconds = Math.ceil(
            (rateCheck.retryAfterMs ?? 0) / 1000,
          );
          c.header("Retry-After", String(retryAfterSeconds));
          safeLogAuthEvent("auth.login.failure", c.req.raw, {
            reason: "rate limited",
          });
          return c.json(
            {
              error: "Too Many Requests",
              message: "Too many login attempts. Try again later.",
            },
            429,
          );
        }

        // Record a tentative failure BEFORE the async verification to prevent
        // concurrent requests from bypassing the rate limit window.
        rateLimiter.recordFailure(ip);

        const valid = await verifyCredentials(
          username,
          password,
          localCredentials,
        );
        if (!valid) {
          // Failure already recorded above
          safeLogAuthEvent("auth.login.failure", c.req.raw, {
            reason: "invalid credentials",
          });
          return c.json(
            { error: "Unauthorized", message: "Invalid username or password." },
            401,
          );
        }

        // Success — clear the pre-recorded failure
        rateLimiter.recordSuccess(ip);

        const token = createSignedAuthSessionToken(
          { sub: username, role: "admin" },
          sessionSecret,
          {
            sessionMaxAgeSeconds: securityConfig.authSessionMaxAgeSeconds,
            sessionIdleTimeoutSeconds:
              securityConfig.authSessionIdleTimeoutSeconds,
            sessionGeneration: securityConfig.authSessionGeneration,
          },
        );

        // Compute expiration for cookie header
        const nowSeconds = Math.floor(Date.now() / 1000);
        const expiresAtSeconds =
          nowSeconds + securityConfig.authSessionMaxAgeSeconds;

        c.header(
          "Set-Cookie",
          createAuthSessionCookieHeader(
            token,
            expiresAtSeconds,
            securityConfig,
          ),
          { append: true },
        );

        safeLogAuthEvent("auth.login.success", c.req.raw, {
          subject: username,
        });

        return c.json({ ok: true });
      };

      app.post("/auth/login", localLoginBodyLimit, localLoginHandler);
      app.post("/api/auth/login", localLoginBodyLimit, localLoginHandler);
    }
  }

  // Better Auth routes handle auth endpoints for API consumers.
  if (auth) {
    const authHandler = createAuthHandler(auth);
    app.on(["POST", "GET"], "/api/auth/*", authHandler);
  }

  // Hono's "/path/*" pattern matches both "/path" and "/path/...".
  // Keep write-auth and body-limit middleware on matching wildcard path sets:
  // "/layouts/*", "/api/layouts/*", "/assets/*", "/api/assets/*".
  const writeAuth = createWriteAuthMiddleware(securityConfig.writeAuthToken);
  app.use("/layouts/*", writeAuth);
  app.use("/assets/*", writeAuth);
  app.use("/api/layouts/*", writeAuth);
  app.use("/api/assets/*", writeAuth);

  // Admin authorization for write operations when auth is enabled.
  // Runs after auth gate (which sets authClaims) and write-token auth.
  if (securityConfig.authEnabled) {
    const requireAdmin = createRequireAdminMiddleware();
    app.use("/layouts/*", requireAdmin);
    app.use("/assets/*", requireAdmin);
    app.use("/api/layouts/*", requireAdmin);
    app.use("/api/assets/*", requireAdmin);
  }

  // Health check
  app.get("/health", (c) => c.json(HEALTH_RESPONSE));
  app.get("/api/health", (c) => c.json(HEALTH_RESPONSE));

  // Apply body size limit to asset uploads (5MB default, configurable via env)
  const parsedMaxAssetSize = Number.parseInt(env.MAX_ASSET_SIZE ?? "", 10);
  const maxAssetSize =
    Number.isFinite(parsedMaxAssetSize) && parsedMaxAssetSize > 0
      ? parsedMaxAssetSize
      : DEFAULT_MAX_ASSET_SIZE;

  const assetBodyLimit = bodyLimit({
    maxSize: maxAssetSize,
    onError: (c) => c.json({ error: "File too large" }, 413),
  });

  app.use("/assets/*", assetBodyLimit);
  app.use("/api/assets/*", assetBodyLimit);

  // Body size limits for layout data (YAML)
  const layoutBodyLimit = bodyLimit({
    maxSize: DEFAULT_MAX_LAYOUT_SIZE,
    onError: (c) => c.json({ error: "Layout data too large" }, 413),
  });

  app.use("/layouts/*", layoutBodyLimit);
  app.use("/api/layouts/*", layoutBodyLimit);

  // Mount routes at root paths (nginx strips /api prefix when proxying)
  app.route("/layouts", layouts);
  app.route("/assets", assets);

  // Compatibility aliases for direct API access (without nginx proxy)
  app.route("/api/layouts", layouts);
  app.route("/api/assets", assets);

  // 404 handler
  app.notFound((c) => c.json({ error: "Not found" }, 404));

  // Error handler
  app.onError((err, c) => {
    console.error("Unhandled error:", err);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}
