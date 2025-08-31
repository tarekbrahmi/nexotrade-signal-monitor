import jwt from "jsonwebtoken";
import { logger } from "../services/logger";

const JWT_SECRET = process.env.JWT_SECRET || "any";

export interface JWTPayload {
  userId: string;
  username: string;
  iat?: number;
  exp?: number;
}

export function signJWT(payload: Omit<JWTPayload, "iat" | "exp">): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    logger.error("JWT verification failed:", error);
    return null;
  }
}
