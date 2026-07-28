import { Request } from "express";
import jwt from "jsonwebtoken";
export interface UserPayload {
  userId: string;
  name: string;
  email: string;
}

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
      userId: decoded.userId,
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

export const extractSocketToken = (socket: any): string | null => {
  const authToken = socket.handshake?.auth?.token;
  if (typeof authToken === "string" && authToken.trim().length > 0) {
    return authToken.startsWith("Bearer ")
      ? authToken.slice(7).trim()
      : authToken.trim();
  }

  const headerToken = socket.handshake?.headers?.authorization;
  if (typeof headerToken === "string" && headerToken.startsWith("Bearer ")) {
    return headerToken.slice(7).trim();
  }

  return null;
};

export const extractBearerToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    return token;
  }
  return null;
};
