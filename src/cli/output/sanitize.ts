/** C0 controls (newlines included, since no data field is multi-line), DEL and C1. */
function isControl(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

/**
 * Characters that do not show but reorder or hide text: every code point
 * Unicode marks as default-ignorable (bidi marks, embeddings, overrides and
 * isolates, zero-width characters, tag characters, variation selectors, the
 * soft hyphen, the byte order mark), plus the line and paragraph separators,
 * which are not default-ignorable but break a line (F-45, F-73). Tag
 * characters can spell whole ASCII text that a terminal hides and a
 * language model still reads.
 */
const INVISIBLE = /^[\p{Default_Ignorable_Code_Point}\u{2028}\u{2029}]$/u;

function isInvisibleFormat(code: number): boolean {
  return INVISIBLE.test(String.fromCodePoint(code));
}

/**
 * Whether a code point must never reach a reader as itself. Every output
 * that shows untrusted text uses this one definition.
 */
export function isUnsafeCodePoint(code: number): boolean {
  return isControl(code) || isInvisibleFormat(code);
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
