import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Server } from "node:http";

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

// In-memory replacements for Redis sessions and the Mongo user lookup.
const sessions = new Map<string, unknown>();
mock.module("../src/services/sessions", () => ({
  generateSessionToken: async (p: { refreshToken: string }) => {
    sessions.set(p.refreshToken, p);
    return p.refreshToken;
  },
  getSessionToken: async (t: string) => sessions.get(t) ?? null,
  deleteSessionToken: async (t: string) => (sessions.delete(t) ? 1 : 0),
}));
mock.module("../src/repositories/auth.repositories", () => ({
  AuthRepository: class {
    async findUserById(id: string) {
      return id === "u1" ? { id: "u1", email: "u1@example.test", name: "U1" } : null;
    }
  },
}));

const { default: express } = await import("express");
const { default: cookieParser } = await import("cookie-parser");
const { sessionRouter } = await import("../src/routes/session.routes");
const { errorMiddleware } = await import("../src/middleware/error.middleware");
const { issueAuthTokens } = await import("../src/utils/auth-tokens");
const { signToken } = await import("@repo/core/jwt");

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/sessions", sessionRouter);
  app.use(errorMiddleware);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => server.close());
beforeEach(() => sessions.clear());

const user = { userId: "u1", email: "u1@example.test", name: "U1" };
const post = (path: string, cookie?: string) =>
  fetch(`${base}${path}`, { method: "POST", headers: cookie ? { cookie } : {} });
const setCookies = (res: Response) => res.headers.getSetCookie();

describe("POST /sessions/refresh", () => {
  test("rotates the refresh session and sets both cookies", async () => {
    const { refreshToken } = await issueAuthTokens(user);
    const res = await post("/sessions/refresh", `refreshToken=${refreshToken}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(typeof body.data.accessToken).toBe("string");
    expect(sessions.has(refreshToken)).toBe(false); // old session revoked
    expect(sessions.size).toBe(1);
    const cookies = setCookies(res).join("\n");
    expect(cookies).toContain("accessToken=");
    expect(cookies).toContain("refreshToken=");
    expect(cookies).toContain("HttpOnly");
  });

  test("a revoked or reused refresh token is rejected", async () => {
    const { refreshToken } = await issueAuthTokens(user);
    expect((await post("/sessions/refresh", `refreshToken=${refreshToken}`)).status).toBe(200);
    expect((await post("/sessions/refresh", `refreshToken=${refreshToken}`)).status).toBe(401);
  });

  test("missing or forged tokens are rejected", async () => {
    expect((await post("/sessions/refresh")).status).toBe(401);
    const forged = signToken(user, "wrong-secret", "30d");
    expect((await post("/sessions/refresh", `refreshToken=${forged}`)).status).toBe(401);
  });
});

describe("POST /sessions/logout", () => {
  test("revokes the session and clears both cookies", async () => {
    const { refreshToken } = await issueAuthTokens(user);
    const res = await post("/sessions/logout", `refreshToken=${refreshToken}`);
    expect(res.status).toBe(200);
    expect(sessions.size).toBe(0);
    const cookies = setCookies(res);
    for (const name of ["accessToken", "refreshToken"]) {
      const c = cookies.find((x) => x.startsWith(`${name}=;`));
      expect(c).toBeDefined();
      expect(c).toContain("Expires=Thu, 01 Jan 1970");
      expect(c).toContain("HttpOnly");
    }
    // The revoked token can no longer refresh.
    expect((await post("/sessions/refresh", `refreshToken=${refreshToken}`)).status).toBe(401);
  });

  test("is idempotent without a session or with an invalid token", async () => {
    expect((await post("/sessions/logout")).status).toBe(200);
    expect((await post("/sessions/logout", "refreshToken=garbage")).status).toBe(200);
    const { refreshToken } = await issueAuthTokens(user);
    expect((await post("/sessions/logout", `refreshToken=${refreshToken}`)).status).toBe(200);
    expect((await post("/sessions/logout", `refreshToken=${refreshToken}`)).status).toBe(200);
  });

  test("does not touch other sessions of the same user", async () => {
    const a = await issueAuthTokens(user);
    const b = await issueAuthTokens(user);
    await post("/sessions/logout", `refreshToken=${a.refreshToken}`);
    expect(sessions.has(b.refreshToken)).toBe(true);
  });
});
