import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Server } from "node:http";

process.env.FRONTEND_URL = "http://frontend.test";
process.env.GOOGLE_CLIENT_ID = "test-client";
process.env.GOOGLE_REDIRECT_URI = "http://localhost:5000/api/v1/auth/oauth2/google/callback";
process.env.GITHUB_CLIENT_ID = "test-gh-client";

// In-memory Redis: OAuth state keys only.
const store = new Map<string, string>();
mock.module("@repo/redis", () => ({
  RedisString: class {
    async set(key: string, value: string) {
      store.set(key, String(value));
      return "OK";
    }
    async get(key: string) {
      return store.get(key) ?? null;
    }
    async delete(key: string) {
      return store.delete(key) ? 1 : 0;
    }
  },
}));

const { default: express } = await import("express");
const { default: cookieParser } = await import("cookie-parser");
const { oAuth2Router } = await import("../src/routes/oauth.routes");

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(cookieParser());
  app.use("/oauth2", oAuth2Router);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => server.close());
beforeEach(() => store.clear());

const FAILED = "http://frontend.test/login?error=auth_failed";

async function init(provider: "google" | "github") {
  const res = await fetch(`${base}/oauth2/${provider}`);
  const body = (await res.json()) as { success: boolean; data: string };
  const state = new URL(body.data).searchParams.get("state");
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("oauthState="));
  return { res, body, state, cookie };
}

describe("OAuth init", () => {
  for (const [provider, host] of [
    ["google", "https://accounts.google.com/"],
    ["github", "https://github.com/login/oauth/authorize"],
  ] as const) {
    test(`${provider}: 200 with URL, state bound to an HttpOnly cookie and Redis`, async () => {
      const { res, body, state, cookie } = await init(provider);
      expect(res.status).toBe(200); // a 301 could be cached and replay a stale state
      expect(body.data).toStartWith(host);
      expect(state).toBeTruthy();
      expect(cookie).toContain(`oauthState=${state}`);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(store.has(`oauth:${provider}:${state}`)).toBe(true);
    });
  }
});

describe("OAuth callback", () => {
  const callback = (provider: string, query: string, cookie?: string) =>
    fetch(`${base}/oauth2/${provider}/callback?${query}`, { redirect: "manual", headers: cookie ? { cookie } : {} });

  test("any failure redirects to the login page without session cookies", async () => {
    for (const [provider, query] of [
      ["google", ""],
      ["github", "code=x"],
    ]) {
      const res = await callback(provider!, query!);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(FAILED);
      expect(res.headers.getSetCookie().some((c) => /^(accessToken|refreshToken)=[^;]/.test(c))).toBe(false);
    }
  });

  test("a callback from another browser (state without matching cookie) is rejected and leaves the state", async () => {
    const { state } = await init("github");
    const res = await callback("github", `code=x&state=${state}`); // no cookie
    expect(res.headers.get("location")).toBe(FAILED);
    expect(store.has(`oauth:github:${state}`)).toBe(true);

    const other = await callback("github", `code=x&state=${state}`, "oauthState=someone-else");
    expect(other.headers.get("location")).toBe(FAILED);
  });

  test("a matching state is consumed exactly once and the cookie is cleared", async () => {
    const { state } = await init("google");
    const res = await callback("google", `code=bad&state=${state}`, `oauthState=${state}`);
    // State accepted (then the fake code fails at Google) → key consumed, cookie cleared
    expect(store.has(`oauth:google:${state}`)).toBe(false);
    expect(res.headers.get("location")).toBe(FAILED);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("oauthState=;"))).toBe(true);
  });
});
