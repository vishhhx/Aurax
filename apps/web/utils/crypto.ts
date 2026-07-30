//-
import crypto from "crypto"
import { ENV } from "../config/env"

const DEFAULT_SECRET = "aurax-secret-key-change-in-production"

function getSecretKey(secret?: string): Buffer {
  const keySource = secret || DEFAULT_SECRET
  return crypto.createHash("sha256").update(keySource).digest()
}

export function encryptPayload(
  data: Record<string, any>,
  secret?: string
): string {
  const key = getSecretKey(secret)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)

  let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex")
  encrypted += cipher.final("hex")

  const authTag = cipher.getAuthTag().toString("hex")
  const combined = `${iv.toString("hex")}:${authTag}:${encrypted}`

  return Buffer.from(combined, "utf8").toString("base64url")
}

export function decryptPayload<T = Record<string, any>>(
  encryptedData: string,
  secret?: string
): T {
  const key = getSecretKey(secret)
  const combined = Buffer.from(encryptedData, "base64url").toString("utf8")
  const [ivHex, authTagHex, encryptedText] = combined.split(":")

  if (!ivHex || !authTagHex || !encryptedText) {
    throw new Error("Invalid encrypted payload format")
  }

  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encryptedText, "hex", "utf8")
  decrypted += decipher.final("utf8")

  return JSON.parse(decrypted) as T
}
