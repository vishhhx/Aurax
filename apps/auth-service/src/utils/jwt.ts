import jwt from "jsonwebtoken";
import { UserPayload } from "../types/jwt";

export const signToken = (
  payload: UserPayload,
  secret: string,
  expiresIn: jwt.SignOptions["expiresIn"],
): string => {
  return jwt.sign(payload, secret, { expiresIn });
};

export const verifyToken = (token: string, secret: string): UserPayload => {
  try {
    const decoded = jwt.verify(token, secret);

    if (typeof decoded === "string") {
      throw new Error("Invalid token payload.");
    }

    return {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Token has expired.");
    }

    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid token.");
    }

    throw new Error("Token verification failed.");
  }
};
