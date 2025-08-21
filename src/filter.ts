import type { CliOptions, CommitMeta, LateNightComment } from "./types.ts";

/** Parse an ISO 8601 date string with timezone offset and extract local hour/minute. */
export function parseAuthorDate(isoDate: string): {
  date: Date;
  localHour: number;
  localMinute: number;
} {
  // Format: 2023-11-14T02:47:13+05:30 or 2023-11-14T02:47:13-08:00
  // The time portion IS already in the author's local time.
  // We just need to extract hour:minute from the string directly.
  const timeMatch = isoDate.match(/T(\d{2}):(\d{2})/);
  if (!timeMatch) {
    throw new Error(`Cannot parse author date: ${isoDate}`);
  }
  return {
    date: new Date(isoDate),
    localHour: parseInt(timeMatch[1], 10),
    localMinute: parseInt(timeMatch[2], 10),
  };
}

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

/** Check if a commit's time falls in the configured window. */
export function filterByTime(
  meta: CommitMeta,
  opts: Pick<CliOptions, "after" | "before">,
): boolean {
  return isInTimeWindow(meta.localHour, meta.localMinute, opts.after, opts.before);
}

/** Check if a commit passes the author filter. */
export function filterByAuthor(
  meta: CommitMeta,
  author?: string,
): boolean {
  if (!author) return true;
  const lower = author.toLowerCase();
  return (
    meta.author.toLowerCase().includes(lower) ||
    meta.authorEmail.toLowerCase().includes(lower)
  );
}

/** Check if a file path matches a glob pattern (simple substring/wildcard match). */
export function filterByPath(filePath: string, pathGlob?: string): boolean {
  if (!pathGlob) return true;
  // Simple glob: support * as wildcard
  const regex = new RegExp(
    "^" + pathGlob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
  );
  return regex.test(filePath);
}

/** Check if a comment matches the grep pattern. */
export function filterByGrep(comment: string, grep?: RegExp): boolean {
  if (!grep) return true;
  return grep.test(comment);
}

/** Check if a comment meets the minimum length requirement. */
export function filterByLength(comment: string, minLength: number): boolean {
  return comment.length >= minLength;
}

/** Apply all comment-level filters. */
export function filterComment(
  comment: LateNightComment,
  opts: Pick<CliOptions, "pathGlob" | "grep" | "minLength">,
): boolean {
  return (
    filterByPath(comment.filePath, opts.pathGlob) &&
    filterByGrep(comment.comment, opts.grep) &&
    filterByLength(comment.comment, opts.minLength)
  );
}
