export interface UserDetails {
  _id: string;
  name: string;
  email: string;
}

export interface GoogleUser {
  googleId: string;
  email: string;
  verified: boolean;
  name: string;
  avatar?: string;
  locale?: string;
}

export interface GoogleOAuthResponse {
  user: GoogleUser;
  tokens: {
    accessToken?: string;
    refreshToken?: string;
    expiryDate?: number | null;
    idToken?: string;
    scope?: string;
    tokenType?: string;
  };
}
