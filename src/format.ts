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

function formatTime(hour: number, minute: number): string {
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h12}:${minute.toString().padStart(2, "0")} ${ampm}`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
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
export function formatPretty(
  comment: LateNightComment,
  useColor: boolean,
): string {
  const width = 55;
  const inner = width - 4; // padding inside box
  const time = formatTime(comment.localHour, comment.localMinute);
  const date = formatDate(comment.date);
  const header1 = `${time} · ${date} · @${comment.author}`;
  const header2 = `${comment.hash} · ${comment.filePath}`;
  const commentLines = wordWrap(comment.comment, inner);

  const top = `┌${"─".repeat(width - 2)}┐`;
  const mid = `├${"─".repeat(width - 2)}┤`;
  const bot = `└${"─".repeat(width - 2)}┘`;

  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - stripAnsi(s).length));
  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

  const h1 = c(BOLD + CYAN, time, useColor) + c(DIM, ` · ${date} · `, useColor) + c(YELLOW, `@${comment.author}`, useColor);
  const h2 = c(DIM, `${comment.hash} · ${comment.filePath}`, useColor);

  const lines = [top];
  lines.push(`│ ${pad(h1, inner + (h1.length - header1.length))} │`);
  lines.push(`│ ${pad(h2, inner + (h2.length - header2.length))} │`);
  lines.push(mid);
  for (const cl of commentLines) {
    const styled = c(WHITE + BOLD, `"${cl}"`, useColor);
    const raw = `"${cl}"`;
    lines.push(`│ ${pad(styled, inner + (styled.length - raw.length))} │`);
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
    localTime: formatTime(comment.localHour, comment.localMinute),
    filePath: comment.filePath,
    lineNumber: comment.lineNumber,
    comment: comment.comment,
    language: comment.language,
  });
}

/** Generate stats summary from a list of comments. */
export function formatStats(
  comments: LateNightComment[],
  useColor: boolean,
): string {
  if (comments.length === 0) {
    return "No late-night comments found.";
  }

  // Busiest hour
  const hourCounts = new Map<number, number>();
  const authorCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();

  for (const cmt of comments) {
    hourCounts.set(cmt.localHour, (hourCounts.get(cmt.localHour) ?? 0) + 1);
    authorCounts.set(cmt.author, (authorCounts.get(cmt.author) ?? 0) + 1);
    fileCounts.set(cmt.filePath, (fileCounts.get(cmt.filePath) ?? 0) + 1);
  }

  const busiestHour = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topAuthor = [...authorCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topFile = [...fileCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const lines = [
    c(BOLD + MAGENTA, "── Stats ──", useColor),
    `Total late-night comments: ${c(BOLD, String(comments.length), useColor)}`,
    `Busiest hour: ${c(BOLD, `${busiestHour[0]}:00`, useColor)} (${busiestHour[1]} comments)`,
    `Most prolific night owl: ${c(BOLD, topAuthor[0], useColor)} (${topAuthor[1]} comments)`,
    `Most commented file: ${c(BOLD, topFile[0], useColor)} (${topFile[1]} comments)`,
  ];

  // Hour histogram
  lines.push("");
  lines.push(c(DIM, "Hour distribution:", useColor));
  const maxCount = Math.max(...hourCounts.values());
  const barWidth = 30;
  for (let h = 0; h < 24; h++) {
    const count = hourCounts.get(h) ?? 0;
    if (count === 0) continue;
    const bar = "█".repeat(Math.max(1, Math.round((count / maxCount) * barWidth)));
    lines.push(`  ${String(h).padStart(2)}:00 ${c(CYAN, bar, useColor)} ${count}`);
  }

  return lines.join("\n");
}
