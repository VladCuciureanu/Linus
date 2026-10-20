import { spawn } from "node:child_process";
import type { CommitDiff, CommitMeta } from "./types.ts";
import { parseDiff } from "./diff.ts";

// Delimiter used to separate commit metadata fields in git log output.
const FIELD_SEP = "†";
// Delimiter used to mark the start of a new commit record.
const RECORD_SEP = "‡COMMIT‡";

const FORMAT = `${RECORD_SEP}%n%h${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%aI`;

/** Parse an ISO 8601 date string with timezone offset and extract local hour/minute. */
export function parseAuthorDate(isoDate: string): {
  date: Date;
  localDate: string;
  localHour: number;
  localMinute: number;
} {
  // Format: 2023-11-14T02:47:13+05:30 or 2023-11-14T02:47:13-08:00
  // The time portion IS already in the author's local time.
  // We just need to extract hour:minute from the string directly.
  const match = isoDate.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) {
    throw new Error(`Cannot parse author date: ${isoDate}`);
  }
  return {
    date: new Date(isoDate),
    localDate: match[1],
    localHour: parseInt(match[2], 10),
    localMinute: parseInt(match[3], 10),
  };
}

export interface GitLogOptions {
  repoPath: string;
  allBranches?: boolean;
  maxCommits?: number;
  since?: string;
  until?: string;
}

/** Run git log and yield CommitDiff objects one at a time. */
export async function* readGitLog(
  opts: GitLogOptions,
): AsyncGenerator<CommitDiff> {
  const args = [
    "-C",
    opts.repoPath,
    "log",
    `--format=${FORMAT}`,
    "--diff-filter=AM",
    "-p",
    "--no-merges",
  ];

  if (opts.allBranches) args.push("--all");
  if (opts.maxCommits) args.push(`-n`, `${opts.maxCommits}`);
  if (opts.since) args.push(`--since=${opts.since}`);
  if (opts.until) args.push(`--until=${opts.until}`);

  const child = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stderrText = "";
  child.stderr.on("data", (chunk: string) => {
    stderrText += chunk;
  });
  const exitCode = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  // Mark as handled now; the rejection is surfaced when awaited below.
  exitCode.catch(() => {});

  let buffer = "";
  let currentMeta: CommitMeta | null = null;
  let currentDiffLines: string[] = [];
  let expectMeta = false;

  function flushCommit(): CommitDiff | null {
    if (!currentMeta) return null;
    const diffText = currentDiffLines.join("\n");
    const addedLines = parseDiff(diffText);
    const result: CommitDiff = { meta: currentMeta, addedLines };
    currentMeta = null;
    currentDiffLines = [];
    return result;
  }

  function parseMetaLine(line: string): CommitMeta | null {
    const parts = line.split(FIELD_SEP);
    if (parts.length < 4) return null;
    const [hash, author, authorEmail, dateIso] = parts;
    try {
      const { date, localDate, localHour, localMinute } = parseAuthorDate(dateIso);
      return { hash, author, authorEmail, date, localDate, localHour, localMinute };
    } catch {
      return null;
    }
  }

  try {
    for await (const chunk of child.stdout) {
      buffer += chunk as string;

      const lines = buffer.split("\n");
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line === RECORD_SEP) {
          const commit = flushCommit();
          if (commit) yield commit;
          expectMeta = true;
          continue;
        }

        // The metadata line is always the one right after the record
        // separator; diff content that happens to contain FIELD_SEP must not
        // be mistaken for it.
        if (expectMeta) {
          expectMeta = false;
          currentMeta = parseMetaLine(line);
          continue;
        }

        // Otherwise it's part of the diff
        if (currentMeta) {
          currentDiffLines.push(line);
        }
      }
    }

    // Process remaining buffer
    if (buffer.length > 0) {
      if (currentMeta) {
        currentDiffLines.push(buffer);
      }
    }

    // Flush the last commit
    const commit = flushCommit();
    if (commit) yield commit;
  } finally {
    const code = await exitCode;
    if (code !== 0) {
      throw new Error(`git log failed: ${stderrText.trim()}`);
    }
  }
}
