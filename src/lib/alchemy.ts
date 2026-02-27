import { createHmac } from "crypto";

/**
 * Verify Alchemy webhook HMAC-SHA256 signature.
 * Returns true if the signature matches the expected HMAC of the raw body.
 */
export function verifyAlchemySignature(
  rawBody: string,
  signature: string
): boolean {
  const signingKey = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY;
  if (!signingKey) throw new Error("ALCHEMY_WEBHOOK_SIGNING_KEY not set");

  const hmac = createHmac("sha256", signingKey);
  hmac.update(rawBody);
  const expected = hmac.digest("hex");

  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}
