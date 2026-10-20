import type { CliOptions, CommitMeta, LateNightComment } from "./types.ts";

/** Check if a given hour:minute falls within the time window [after, before). */
export function isInTimeWindow(
  hour: number,
  minute: number,
  after: { hour: number; minute: number },
  before: { hour: number; minute: number },
): boolean {
  const t = hour * 60 + minute;
  const a = after.hour * 60 + after.minute;
  const b = before.hour * 60 + before.minute;

  if (a <= b) {
    // Normal window, e.g. 00:00–04:00
    return t >= a && t < b;
  } else {
    // Wrapping window, e.g. 22:00–06:00
    return t >= a || t < b;
  }
}

/** Check if a commit passes the author filter. */
export function filterByAuthor(meta: CommitMeta, author?: string): boolean {
  if (!author) return true;
  const lower = author.toLowerCase();
  return (
    meta.author.toLowerCase().includes(lower) || meta.authorEmail.toLowerCase().includes(lower)
  );
}

/**
 * Compile a path glob to an anchored RegExp. `*` matches any run of
 * characters except `/`, `?` matches one character except `/`, and a `**`
 * segment matches zero or more whole directories (or everything below, at the
 * end). `{a,b}` matches either alternative and may nest; a `{` without a
 * matching `}` or a top-level comma is literal. `\` escapes the next
 * character. Everything else, including `[` and leading dots, is literal.
 * Matching is case-sensitive and `/` is the only separator, the same as Git
 * paths on every platform.
 */
export function globToRegExp(glob: string): RegExp {
  return new RegExp(`^${compileGlob(glob, true, true)}$`, "s");
}

/**
 * Compile a glob fragment to RegExp source. `startsSegment`/`endsSegment` say
 * whether the fragment begins/ends at a segment boundary in the full glob, so
 * `**` inside a brace alternative is recognised as a whole segment.
 */
function compileGlob(glob: string, startsSegment: boolean, endsSegment: boolean): string {
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === "\\") {
      re += escapeRegExp(glob[i + 1] ?? "\\");
      i += 2;
    } else if (ch === "{") {
      const alternatives = splitBraces(glob, i);
      if (!alternatives) {
        re += "{";
        i++;
        continue;
      }
      const end = alternatives.end;
      const starts = i === 0 ? startsSegment : glob[i - 1] === "/";
      const ends = end + 1 === glob.length ? endsSegment : glob[end + 1] === "/";
      re += `(?:${alternatives.parts.map((part) => compileGlob(part, starts, ends)).join("|")})`;
      i = end + 1;
    } else if (ch === "*") {
      let j = i;
      while (glob[j] === "*") j++;
      const wholeSegment =
        j - i >= 2 &&
        (i === 0 ? startsSegment : glob[i - 1] === "/") &&
        (j === glob.length ? endsSegment : glob[j] === "/");
      if (!wholeSegment) {
        re += "[^/]*";
      } else if (j === glob.length) {
        re += ".*";
      } else {
        re += "(?:[^/]*/)*";
        j++; // the "/" after "**" is part of the directory run
      }
      i = j;
    } else if (ch === "?") {
      re += "[^/]";
      i++;
    } else {
      re += escapeRegExp(ch);
      i++;
    }
  }
  return re;
}

/**
 * Split the brace group opening at `glob[open]` into its top-level
 * alternatives. Returns null when the `{` has no matching `}` or the group has
 * no top-level comma, in which case the `{` is literal.
 */
function splitBraces(glob: string, open: number): { parts: string[]; end: number } | null {
  const parts: string[] = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open + 1; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "\\") {
      i++;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      if (depth > 0) {
        depth--;
      } else {
        parts.push(glob.slice(start, i));
        return parts.length > 1 ? { parts, end: i } : null;
      }
    } else if (ch === "," && depth === 0) {
      parts.push(glob.slice(start, i));
      start = i + 1;
    }
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let cachedGlob: string | undefined;
let cachedRegExp: RegExp | undefined;

/**
 * Check if a repo-relative file path matches a glob (see `globToRegExp`).
 * Node's `path.matchesGlob` is not used because on Windows it matches
 * case-insensitively and treats `\` as a separator even via `path.posix`.
 */
export function filterByPath(filePath: string, pathGlob?: string): boolean {
  if (!pathGlob) return true;
  if (pathGlob !== cachedGlob || !cachedRegExp) {
    cachedGlob = pathGlob;
    cachedRegExp = globToRegExp(pathGlob);
  }
  return cachedRegExp.test(filePath);
}

/** Apply all comment-level filters. */
export function filterComment(
  comment: LateNightComment,
  opts: Pick<CliOptions, "pathGlob" | "grep" | "minLength">,
): boolean {
  return (
    filterByPath(comment.filePath, opts.pathGlob) &&
    (!opts.grep || opts.grep.test(comment.comment)) &&
    comment.comment.length >= opts.minLength
  );
}
