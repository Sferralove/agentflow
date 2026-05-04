/**
 * Secret redaction utility — prevents API keys, tokens, and credentials
 * from being persisted to disk or broadcast to dashboard clients.
 */

const SECRET_PATTERNS = [
  // Bearer tokens / Authorization headers
  /(?:bearer|authorization)\s+[^\s"'`}\]]+/gi,
  // Common credential key patterns: key=value, key: value, key: "value"
  /(?:api[_-]?key|apikey|secret|token|password|auth|credential)s?\s*[:=]\s*['"`][^'"`]+['"`]/gi,
  // OpenAI-style keys: sk-...
  /sk-[^\s]{5,}/g,
  // Private key blocks (PEM)
  /-----BEGIN\s(?:RSA\s)?PRIVATE KEY-----[\s\S]*?-----END\s(?:RSA\s)?PRIVATE KEY-----/g,
  // AWS-style keys: AKIA...
  /AKIA[0-9A-Z]{16}/g,
  // Generic JWT tokens (base64url pattern)
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}/g,
  // Connection strings with passwords
  /(?:mongodb|postgres|mysql|redis):\/\/[^@\s]+@[^\s]+/gi,
];

/**
 * Redact known secret patterns from a string value.
 * Returns the original if nothing matched.
 */
export function redactString(value: string): string {
  let result = value;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '***REDACTED***');
  }
  return result;
}

/**
 * Deep-redact secrets from an arbitrary object.
 * Recursively walks the object and redacts string values.
 */
export function redactSecrets(obj: unknown, maxDepth = 5): unknown {
  if (maxDepth <= 0) return obj;

  if (typeof obj === 'string') {
    return redactString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSecrets(item, maxDepth - 1));
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = redactSecrets(value, maxDepth - 1);
    }
    return result;
  }

  return obj;
}
