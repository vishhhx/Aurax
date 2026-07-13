import { AuthRepository } from "../repositories/auth.repositories";
import { google } from "googleapis";
import { ENV } from "../config/env";

import logger from "../config/logger";
const oauth2Client = new google.auth.OAuth2(
  ENV.GOOGLE_CLIENT_ID,
  ENV.GOOGLE_CLIENT_SECRET,
  ENV.GOOGLE_REDIRECT_URI,
);

const scopes = ["https://developers.google.com/+/api/latest/people"];

export class OauthServices {
  private authRepository: AuthRepository;
  constructor() {
    this.authRepository = new AuthRepository();
  }

  initGoogleAuth() {
    try {
      return oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: scopes,
      });
    } catch (error: unknown) {
      throw new Error("error while initing google Oauth", {
        cause: "googleOauth2",
      });
    }
  }
}
