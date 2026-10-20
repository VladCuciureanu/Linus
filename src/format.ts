import type { LateNightComment } from "./types.ts";

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const WHITE = "\x1b[37m";

function c(code: string, text: string, color: boolean): string {
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

function wordWrap(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > width) {
    let breakAt = remaining.lastIndexOf(" ", width);
    if (breakAt <= 0) breakAt = width;
    lines.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining) lines.push(remaining);
  return lines;
}

/** Pretty-print a single comment as a box card. */
export function formatPretty(comment: LateNightComment, useColor: boolean): string {
  const width = 55;
  const inner = width - 4; // padding inside box
  const time = formatTime(comment.localHour, comment.localMinute);
  const date = comment.localDate;
  // Leave room for the quotes added around each line.
  const commentLines = wordWrap(comment.comment, inner - 2);

  const top = `┌${"─".repeat(width - 2)}┐`;
  const mid = `├${"─".repeat(width - 2)}┤`;
  const bot = `└${"─".repeat(width - 2)}┘`;

  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - stripAnsi(s).length));
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matches ANSI escape sequences
  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

  const h1 =
    c(BOLD + CYAN, time, useColor) +
    c(DIM, ` · ${date} · `, useColor) +
    c(YELLOW, `@${comment.author}`, useColor);
  const h2 = c(DIM, `${comment.hash} · ${comment.filePath}`, useColor);

  const lines = [top];
  lines.push(`│ ${pad(h1, inner)} │`);
  lines.push(`│ ${pad(h2, inner)} │`);
  lines.push(mid);
  for (const cl of commentLines) {
    const styled = c(WHITE + BOLD, `"${cl}"`, useColor);
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
    language: comment.language,
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
    c(BOLD + MAGENTA, "── Stats ──", useColor),
    `Total late-night comments: ${c(BOLD, String(stats.total), useColor)}`,
    `Busiest hour: ${c(BOLD, `${busiestHour.hour}:00`, useColor)} (${busiestHour.count} comments)`,
    `Most prolific night owl: ${c(BOLD, topAuthor.name, useColor)} (${topAuthor.count} comments)`,
    `Most commented file: ${c(BOLD, topFile.path, useColor)} (${topFile.count} comments)`,
  ];

  // Hour histogram
  lines.push("");
  lines.push(c(DIM, "Hour distribution:", useColor));
  const maxCount = Math.max(...stats.hourDistribution.map((h) => h.count));
  const barWidth = 30;
  for (const { hour, count } of stats.hourDistribution) {
    const bar = "█".repeat(Math.max(1, Math.round((count / maxCount) * barWidth)));
    lines.push(`  ${String(hour).padStart(2)}:00 ${c(CYAN, bar, useColor)} ${count}`);
  }

  return lines.join("\n");
}
