import type { CommitDiff, CommitMeta } from "./types.ts";
import { parseDiff } from "./diff.ts";
import { parseAuthorDate } from "./filter.ts";

// Delimiter used to separate commit metadata fields in git log output.
const FIELD_SEP = "†";
// Delimiter used to mark the start of a new commit record.
const RECORD_SEP = "‡COMMIT‡";

const FORMAT = `${RECORD_SEP}%n%h${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%aI`;

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

  const cmd = new Deno.Command("git", {
    args,
    stdout: "piped",
    stderr: "piped",
  });

  const process = cmd.spawn();
  const reader = process.stdout.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let currentMeta: CommitMeta | null = null;
  let currentDiffLines: string[] = [];

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
      const { date, localHour, localMinute } = parseAuthorDate(dateIso);
      return { hash, author, authorEmail, dateIso, date, localHour, localMinute };
    } catch {
      return null;
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line === RECORD_SEP) {
          const commit = flushCommit();
          if (commit) yield commit;
          continue;
        }

        // Check if this is a metadata line (contains our field separator)
        if (line.includes(FIELD_SEP)) {
          const meta = parseMetaLine(line);
          if (meta) {
            currentMeta = meta;
            continue;
          }
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
    reader.releaseLock();
    // Consume stderr to avoid resource leaks
    const stderrText = await new Response(process.stderr).text();
    const status = await process.status;
    if (!status.success) {
      throw new Error(`git log failed: ${stderrText.trim()}`);
    }
  }
}
