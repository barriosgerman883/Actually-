/** C0 controls (newlines included, since no data field is multi-line), DEL and C1. */
function isControl(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

/**
 * Makes untrusted text safe for a terminal. Names, specs, tags, repository
 * fields and messages come from files and network responses: an escape
 * sequence in them could hide or rewrite lines, change the window title or
 * write to the clipboard. Control characters are shown as `\xNN`.
 */
export function sanitize(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    out += isControl(code) ? `\\x${code.toString(16).padStart(2, "0")}` : char;
  }
  return out;
}

/** Copy of a value with every string sanitized. */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === "string") return sanitize(value) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => sanitizeDeep(v)) as T;
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) out[key] = sanitizeDeep(v);
    return out as T;
  }
  return value;
}
