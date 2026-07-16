import { google } from "googleapis";
import { ENV } from "../config/env";
import { GithubEmail, GoogleOAuthResponse, oAuthUser } from "../types/auth";
import { connectToredis, RedisString } from "@repo/redis";

const SCOPES = ["openid", "email", "profile"];

export class googleOauthService {
  private readonly oauth2Client: InstanceType<typeof google.auth.OAuth2>;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      ENV.GOOGLE_CLIENT_ID,
      ENV.GOOGLE_CLIENT_SECRET,
      ENV.GOOGLE_REDIRECT_URI,
    );
  }

  generateGoogleAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: SCOPES,
    });
  }

  async googleCallback(code: string): Promise<GoogleOAuthResponse> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new Error("Google did not return an access token.");
      }

      if (!tokens.refresh_token) {
        throw new Error("Google did not return a refresh token.");
      }

      this.oauth2Client.setCredentials(tokens);

      const profile = await this.getGoogleProfile();

      return {
        user: profile,
        tokens: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiryDate: tokens.expiry_date,
          idToken: tokens.id_token ?? undefined,
          scope: tokens.scope ?? undefined,
          tokenType: tokens.token_type ?? undefined,
        },
      };
    } catch (error) {
      throw new Error("Failed to authenticate with Google.", {
        cause: error,
      });
    }
  }

  private async getGoogleProfile(): Promise<oAuthUser> {
    const oauth2 = google.oauth2({
      version: "v2",
      auth: this.oauth2Client,
    });

    const { data } = await oauth2.userinfo.get();

    if (!data.id) {
      throw new Error("Google did not return the user id.");
    }

    if (!data.email) {
      throw new Error("Google did not return the user email.");
    }

    return {
      id: data.id,
      email: data.email,
      verified: data.verified_email ?? false,
      name: data.name ?? "",
      avatar: data.picture ?? undefined,
      locale: data.locale ?? undefined,
    };
  }
}
interface GithubAuthResponse {
  url: string;
  state: string;
}

interface GithubTokenResponse {
  access_token?: string;
  token_type: string;
  scope: string;
}

export class GithubOauthService {
  async generateGithubAuthUrl(): Promise<GithubAuthResponse> {
    try {
      const state = crypto.randomUUID();
      const params = new URLSearchParams({
        client_id: ENV.GITHUB_CLIENT_ID!,
        redirect_uri: ENV.GITHUB_REDIRECT_URI!,
        scope: "read:user user:email",
        state,
      });
      const redis = await connectToredis();
      const redisString = new RedisString(redis);
      await redisString.set(`oauth:github:${state}`, state, { EX: 300 });
      return {
        url: `https://github.com/login/oauth/authorize?${params.toString()}`,
        state,
      };
    } catch (error) {
      console.error("Failed to generate GitHub OAuth URL:", error);
      throw new Error("Unable to generate GitHub authorization URL.");
    }
  }

  async githubCallback(code: string, state: string): Promise<oAuthUser> {
    try {
      const redis = await connectToredis();
      const redisString = new RedisString(redis);

      const storedState = await redisString.get(`oauth:github:${state}`);

      if (!storedState) {
        throw new Error("Invalid or expired OAuth state.");
      }

      await redisString.delete(`oauth:github:${state}`);

      const params = new URLSearchParams({
        client_id: ENV.GITHUB_CLIENT_ID!,
        client_secret: ENV.GITHUB_CLIENT_SECRET!,
        code,
      });

      const response = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        },
      );

      if (!response.ok) {
        throw new Error(`GitHub returned ${response.status}`);
      }

      const data = (await response.json()) as GithubTokenResponse;

      if (!data.access_token) {
        throw new Error("GitHub did not return an access token.");
      }

      return await this.getGithubProfile(data.access_token);
    } catch (error) {
      console.error("GitHub OAuth callback failed:", error);
      throw new Error("GitHub authentication failed.");
    }
  }
  private async getGithubProfile(token: string): Promise<oAuthUser> {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    const [userResponse, emailResponse] = await Promise.all([
      fetch("https://api.github.com/user", {
        method: "GET",
        headers,
      }),
      fetch("https://api.github.com/user/emails", {
        method: "GET",
        headers,
      }),
    ]);

    if (!userResponse.ok) {
      throw new Error(`Failed to fetch GitHub user: ${userResponse.status}`);
    }

    if (!emailResponse.ok) {
      throw new Error(`Failed to fetch GitHub emails: ${emailResponse.status}`);
    }

    const user = (await userResponse.json()) as oAuthUser;
    const emails = (await emailResponse.json()) as GithubEmail[];

    const primaryEmail = emails.find((email) => email.primary);

    if (!primaryEmail) {
      throw new Error("No primary email found for GitHub account.");
    }

    return {
      id: String(user.id),
      email: primaryEmail.email,
      name: user.name,
      verified: primaryEmail.verified,
      avatar: user.avatar,
      locale: undefined,
    };
  }
}
