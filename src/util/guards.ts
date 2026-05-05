/**
 * Runtime type guards for tool hook inputs/outputs.
 */

export interface ToolInput {
  tool: string;
  args?: Record<string, unknown>;
}

export function isToolInput(x: unknown): x is ToolInput {
  if (typeof x !== 'object' || x === null) return false;
  const obj = x as Record<string, unknown>;
  if (typeof obj.tool !== 'string') return false;
  if (obj.args !== undefined && (typeof obj.args !== 'object' || obj.args === null)) return false;
  return true;
}

export interface ToolOutput {
  result?: string;
  error?: string;
}

export function isToolOutput(x: unknown): x is ToolOutput {
  if (typeof x !== 'object' || x === null) return false;
  return true;
}

/** Safely extract a string value from unknown, returning default if not a string */
export function asString(val: unknown, defaultVal: string): string {
  return typeof val === 'string' ? val : defaultVal;
}

/** Safely extract an optional string value from unknown */
export function asOptionalString(val: unknown): string | undefined {
  return typeof val === 'string' ? val : undefined;
}
