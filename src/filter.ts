import { Minimatch, type MinimatchOptions } from "minimatch";
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
 * minimatch options that make `--path` behave the same on every OS: Git paths
 * always use `/`, so matching is case-sensitive, `/` is the only separator and
 * `\` escapes the next character, as on Linux. Wildcards also match dot-files,
 * and a leading `!` or `#` is literal rather than negation or a comment.
 */
const GLOB_OPTIONS = {
  dot: true,
  nocase: false,
  platform: "linux",
  windowsPathsNoEscape: false,
  nonegate: true,
  nocomment: true,
} as const satisfies MinimatchOptions;

let cachedGlob: string | undefined;
let cachedMatcher: Minimatch | undefined;

/**
 * Check if a repo-relative file path matches a glob: `*` and `?` stay within
 * one directory, `**` spans directories, and `{a,b}` and `[ab]` work as in
 * minimatch (see `GLOB_OPTIONS`).
 */
export function filterByPath(filePath: string, pathGlob?: string): boolean {
  if (!pathGlob) return true;
  if (pathGlob !== cachedGlob || !cachedMatcher) {
    cachedGlob = pathGlob;
    cachedMatcher = new Minimatch(pathGlob, GLOB_OPTIONS);
  }
  return cachedMatcher.match(filePath);
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
