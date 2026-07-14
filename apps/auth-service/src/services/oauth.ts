import { google } from "googleapis";
import { ENV } from "../config/env";
import { GoogleOAuthResponse, GoogleUser } from "../types/auth";

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

  private async getGoogleProfile(): Promise<GoogleUser> {
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
      googleId: data.id,
      email: data.email,
      verified: data.verified_email ?? false,
      name: data.name ?? "",
      avatar: data.picture ?? undefined,
      locale: data.locale ?? undefined,
    };
  }
}



export class githubOauthService{
  
}