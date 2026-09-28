/** C0 controls (newlines included, since no data field is multi-line), DEL and C1. */
function isControl(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

/**
 * Unicode format characters that reorder or hide text without being
 * controls: bidi marks, embeddings, overrides and isolates, zero-width
 * characters, line and paragraph separators, and the byte order mark (F-45).
 */
function isInvisibleFormat(code: number): boolean {
  return (
    code === 0x061c ||
    code === 0x180e ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x2028 && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x2064) ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0xfeff
  );
}

/**
 * Makes untrusted text safe for a terminal. Names, specs, tags, repository
 * fields and messages come from files and network responses: an escape
 * sequence in them could hide or rewrite lines, change the window title or
 * write to the clipboard, and a bidi override could make a line read
 * differently from what it says. Control characters are shown as `\xNN`,
 * and format characters as `\u{NNNN}`.
 */
export function sanitize(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (isControl(code)) out += `\\x${code.toString(16).padStart(2, "0")}`;
    else if (isInvisibleFormat(code)) out += `\\u{${code.toString(16).padStart(4, "0")}}`;
    else out += char;
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
