import stringWidth from "string-width";
import stripAnsi from "strip-ansi";
import type { LateNightComment } from "./types.ts";

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const WHITE = "\x1b[37m";

/** Wrap `text` in an ANSI style `code` when colour is enabled. */
function paint(code: string, text: string, color: boolean): string {
  return color ? `${code}${text}${RESET}` : text;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatTime(hour: number, minute: number): string {
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h12}:${pad2(minute)} ${ampm}`;
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), (s) => s.segment);
}

/**
 * Make repo-supplied text safe to draw in the card: strip ANSI escape
 * sequences, turn tabs into spaces and drop any other control characters,
 * so data can neither break the box nor send codes to the terminal.
 */
function sanitize(text: string): string {
  return (
    stripAnsi(text)
      .replace(/\t/g, "    ")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: removes control characters
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
  );
}

/** Wrap `text` into lines of at most `width` terminal columns. */
function wordWrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let remaining = graphemes(text);
  while (stringWidth(remaining.join("")) > width) {
    // Longest prefix (in whole graphemes) that fits in `width` columns.
    let fit = 0;
    let used = 0;
    while (fit < remaining.length) {
      const w = stringWidth(remaining[fit]);
      if (used + w > width) break;
      used += w;
      fit++;
    }
    fit = Math.max(1, fit);
    // Prefer breaking at the last space inside the fitting prefix.
    let breakAt = remaining.lastIndexOf(" ", fit);
    if (breakAt <= 0) breakAt = fit;
    lines.push(remaining.slice(0, breakAt).join(""));
    remaining = remaining.slice(breakAt);
    while (remaining[0] === " ") remaining.shift();
  }
  if (remaining.length > 0 || lines.length === 0) lines.push(remaining.join(""));
  return lines;
}

/** Cut `text` to at most `max` terminal columns, ending in "…" when shortened. */
function truncate(text: string, max: number): string {
  if (stringWidth(text) <= max) return text;
  let out = "";
  let used = 0;
  for (const g of graphemes(text)) {
    const w = stringWidth(g);
    if (used + w > max - 1) break;
    out += g;
    used += w;
  }
  return `${out}…`;
}

/** Pad `s` with spaces to `w` terminal columns (ANSI styling is not counted). */
function pad(s: string, w: number): string {
  return s + " ".repeat(Math.max(0, w - stringWidth(s)));
}

/** Pretty-print a single comment as a box card. */
export function formatPretty(comment: LateNightComment, useColor: boolean): string {
  const width = 55;
  const inner = width - 4; // padding inside box
  const time = formatTime(comment.localHour, comment.localMinute);
  const date = comment.localDate;
  // Leave room for the quotes added around each line.
  const commentLines = wordWrap(sanitize(comment.comment), inner - 2);

  const top = `┌${"─".repeat(width - 2)}┐`;
  const mid = `├${"─".repeat(width - 2)}┤`;
  const bot = `└${"─".repeat(width - 2)}┘`;

  // Header fields are cut with an ellipsis so each line fits inside the box.
  const h1Prefix = `${time} · ${date} · @`;
  const author = truncate(sanitize(comment.author), inner - stringWidth(h1Prefix));
  const h1 =
    paint(BOLD + CYAN, time, useColor) +
    paint(DIM, ` · ${date} · `, useColor) +
    paint(YELLOW, `@${author}`, useColor);
  const h2 = paint(
    DIM,
    truncate(sanitize(`${comment.hash} · ${comment.filePath}`), inner),
    useColor,
  );

  const lines = [top];
  lines.push(`│ ${pad(h1, inner)} │`);
  lines.push(`│ ${pad(h2, inner)} │`);
  lines.push(mid);
  for (const cl of commentLines) {
    const styled = paint(WHITE + BOLD, `"${cl}"`, useColor);
    lines.push(`│ ${pad(styled, inner)} │`);
  }
  lines.push(bot);

  return lines.join("\n");
}

/** Format a comment as a JSON line. */
export function formatJson(comment: LateNightComment): string {
  return JSON.stringify({
    hash: comment.hash,
    author: comment.author,
    authorEmail: comment.authorEmail,
    date: comment.date.toISOString(),
    localTime: `${pad2(comment.localHour)}:${pad2(comment.localMinute)}`,
    filePath: comment.filePath,
    lineNumber: comment.lineNumber,
    comment: comment.comment,
    extension: comment.extension,
  });
}

/** Summary statistics over a list of comments. */
export interface Stats {
  total: number;
  busiestHour: { hour: number; count: number } | null;
  topAuthor: { name: string; count: number } | null;
  topFile: { path: string; count: number } | null;
  /** Non-empty hours only, in ascending hour order. */
  hourDistribution: { hour: number; count: number }[];
}

function top<K>(counts: Map<K, number>): [K, number] | undefined {
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
}

/** Compute summary statistics from a list of comments. */
export function computeStats(comments: LateNightComment[]): Stats {
  const hourCounts = new Map<number, number>();
  const authorCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();

  for (const cmt of comments) {
    hourCounts.set(cmt.localHour, (hourCounts.get(cmt.localHour) ?? 0) + 1);
    authorCounts.set(cmt.author, (authorCounts.get(cmt.author) ?? 0) + 1);
    fileCounts.set(cmt.filePath, (fileCounts.get(cmt.filePath) ?? 0) + 1);
  }

  const busiestHour = top(hourCounts);
  const topAuthor = top(authorCounts);
  const topFile = top(fileCounts);

  return {
    total: comments.length,
    busiestHour: busiestHour ? { hour: busiestHour[0], count: busiestHour[1] } : null,
    topAuthor: topAuthor ? { name: topAuthor[0], count: topAuthor[1] } : null,
    topFile: topFile ? { path: topFile[0], count: topFile[1] } : null,
    hourDistribution: [...hourCounts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hour, count]) => ({ hour, count })),
  };
}

/** Format summary statistics as a single JSON object. */
export function formatStatsJson(comments: LateNightComment[]): string {
  return JSON.stringify(computeStats(comments));
}

/** Generate stats summary from a list of comments. */
export function formatStats(comments: LateNightComment[], useColor: boolean): string {
  const stats = computeStats(comments);
  const { busiestHour, topAuthor, topFile } = stats;
  if (!busiestHour || !topAuthor || !topFile) {
    return "No late-night comments found.";
  }

  const lines = [
    paint(BOLD + MAGENTA, "── Stats ──", useColor),
    `Total late-night comments: ${paint(BOLD, String(stats.total), useColor)}`,
    `Busiest hour: ${paint(BOLD, `${busiestHour.hour}:00`, useColor)} (${busiestHour.count} comments)`,
    `Most prolific night owl: ${paint(BOLD, sanitize(topAuthor.name), useColor)} (${topAuthor.count} comments)`,
    `Most commented file: ${paint(BOLD, sanitize(topFile.path), useColor)} (${topFile.count} comments)`,
  ];

  // Hour histogram
  lines.push("");
  lines.push(paint(DIM, "Hour distribution:", useColor));
  const maxCount = Math.max(...stats.hourDistribution.map((h) => h.count));
  const barWidth = 30;
  for (const { hour, count } of stats.hourDistribution) {
    const bar = "█".repeat(Math.max(1, Math.round((count / maxCount) * barWidth)));
    lines.push(`  ${String(hour).padStart(2)}:00 ${paint(CYAN, bar, useColor)} ${count}`);
  }

  return lines.join("\n");
}
