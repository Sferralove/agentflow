/**
 * Runtime type guards for OpenCode hook inputs.
 * Replaces bare `as` casts with validated narrowing.
 */

export interface SessionCreatedInput {
  session?: { id?: string; title?: string };
}

export function isSessionCreatedInput(x: unknown): x is SessionCreatedInput {
  if (typeof x !== 'object' || x === null) return false;
  const obj = x as Record<string, unknown>;
  if (obj.session !== undefined) {
    if (typeof obj.session !== 'object' || obj.session === null) return false;
  }
  return true;
}

export interface SessionErrorInput {
  error?: { message?: string };
}

export function isSessionErrorInput(x: unknown): x is SessionErrorInput {
  if (typeof x !== 'object' || x === null) return false;
  return true;
}

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

export interface MessageInput {
  message?: {
    id: string;
    role: string;
    content?: string;
  };
}

export function isMessageInput(x: unknown): x is MessageInput {
  if (typeof x !== 'object' || x === null) return false;
  const obj = x as Record<string, unknown>;
  if (obj.message !== undefined) {
    if (typeof obj.message !== 'object' || obj.message === null) return false;
    const msg = obj.message as Record<string, unknown>;
    if (msg.id !== undefined && typeof msg.id !== 'string') return false;
    if (msg.role !== undefined && typeof msg.role !== 'string') return false;
    if (msg.content !== undefined && typeof msg.content !== 'string') return false;
  }
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
