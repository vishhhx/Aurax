export interface UserDetails {
  _id: string;
  name: string;
  email: string;
}

export interface oAuthUser {
  id: string;
  email: string;
  verified: boolean;
  name: string;
  avatar?: string;
  locale?: string;
}

export interface GoogleOAuthResponse {
  user: oAuthUser;
  tokens: {
    accessToken?: string;
    refreshToken?: string;
    expiryDate?: number | null;
    idToken?: string;
    scope?: string;
    tokenType?: string;
  };
}

export type Provider = "local" | "google" | "github";

export interface AuthPayload {
  name: string;
  email: string;
  provider: Provider;
  password?: string;
}

export interface GithubAuthResponse {
  url: string;
  state: string;
}

export interface GithubTokenResponse {
  access_token?: string;
  token_type: string;
  scope: string;
}

export interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}
