#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { extractCommentsFromLines } from "./comments.ts";
import { getExtension } from "./diff.ts";
import { filterByAuthor, filterByTime, filterComment } from "./filter.ts";
import { formatJson, formatPretty, formatStats, formatStatsJson } from "./format.ts";
import { readGitLog } from "./git.ts";
import type { CliOptions, LateNightComment } from "./types.ts";

// package.json sits one level above both src/ and dist/.
const { version: VERSION } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const HELP = `
linus v${VERSION} — the 3am comment finder

Finds every code comment written late at night (between
midnight and 4am by default; see --after and --before)
across your repo's history. They are always unhinged and
often prophetic.

USAGE:
  linus [OPTIONS] [path]

ARGUMENTS:
  [path]    Path to git repository (default: current directory)

OPTIONS:
  --after <HH:MM>         Start of time window (default: 00:00)
  --before <HH:MM>        End of time window (default: 04:00)
  --author <name>         Filter by author name/email (substring match)
  --since <date>          Only commits after this date
  --until <date>          Only commits before this date
  --path <glob>           Only files matching this glob
  --grep <pattern>        Filter comments by regex pattern
  --min-length <n>        Minimum comment length (default: 3)
  --max-commits <n>       Max number of commits to scan
  --all-branches          Scan all branches, not just current
  --json                  Output as newline-delimited JSON
  --stats                 Print summary statistics (a JSON object with --json)
  --no-color              Disable colored output
  -h, --help              Show help
  -V, --version           Show version
`.trim();

function parseHHMM(s: string): { hour: number; minute: number } {
  const match = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`Invalid time format: "${s}" (expected HH:MM)`);
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time: "${s}"`);
  }
  return { hour, minute };
}

const OPTIONS = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "V" },
  after: { type: "string" },
  before: { type: "string" },
  author: { type: "string" },
  since: { type: "string" },
  until: { type: "string" },
  path: { type: "string" },
  grep: { type: "string" },
  "min-length": { type: "string" },
  "max-commits": { type: "string" },
  "all-branches": { type: "boolean" },
  json: { type: "boolean" },
  stats: { type: "boolean" },
  "no-color": { type: "boolean" },
} as const;

function parseInteger(name: string, value: string, min: number): number {
  if (!/^\d+$/.test(value) || Number(value) < min) {
    throw new Error(`Invalid value for --${name}: "${value}" (expected an integer >= ${min})`);
  }
  return Number(value);
}

function parseRegExp(pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch (err) {
    throw new Error(`Invalid --grep pattern: ${(err as Error).message}`);
  }
}

function parseCliArgs(args: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args,
    options: OPTIONS,
    allowPositionals: true,
    strict: true,
  });

  if (positionals.length > 1) {
    throw new Error(
      `Unexpected argument: "${positionals[1]}" (only one repository path is accepted)`,
    );
  }

  const minLength = values["min-length"];
  const maxCommits = values["max-commits"];

  return {
    repoPath: positionals[0] ?? ".",
    after: values.after !== undefined ? parseHHMM(values.after) : { hour: 0, minute: 0 },
    before: values.before !== undefined ? parseHHMM(values.before) : { hour: 4, minute: 0 },
    author: values.author,
    since: values.since,
    until: values.until,
    pathGlob: values.path,
    grep: values.grep !== undefined ? parseRegExp(values.grep) : undefined,
    minLength: minLength !== undefined ? parseInteger("min-length", minLength, 0) : 3,
    maxCommits: maxCommits !== undefined ? parseInteger("max-commits", maxCommits, 1) : undefined,
    allBranches: values["all-branches"] ?? false,
    json: values.json ?? false,
    stats: values.stats ?? false,
    // Respect NO_COLOR env var
    noColor: (values["no-color"] ?? false) || process.env.NO_COLOR !== undefined,
    help: values.help ?? false,
    version: values.version ?? false,
  };
}

/** Read the git history and yield every late-night comment passing the filters. */
async function* collectComments(opts: CliOptions): AsyncGenerator<LateNightComment> {
  for await (const commit of readGitLog({
    repoPath: opts.repoPath,
    allBranches: opts.allBranches,
    maxCommits: opts.maxCommits,
    since: opts.since,
    until: opts.until,
  })) {
    // Time filter at commit level
    if (!filterByTime(commit.meta, opts)) continue;
    if (!filterByAuthor(commit.meta, opts.author)) continue;

    // Group added lines by file
    const byFile = new Map<string, { lineNumber: number; content: string }[]>();
    for (const line of commit.addedLines) {
      const arr = byFile.get(line.filePath) ?? [];
      arr.push({ lineNumber: line.lineNumber, content: line.content });
      byFile.set(line.filePath, arr);
    }

    // Extract comments from each file
    for (const [filePath, lines] of byFile) {
      for (const { lineNumber, comment } of extractCommentsFromLines(lines, filePath)) {
        const lnc: LateNightComment = {
          hash: commit.meta.hash,
          author: commit.meta.author,
          authorEmail: commit.meta.authorEmail,
          date: commit.meta.date,
          localDate: commit.meta.localDate,
          localHour: commit.meta.localHour,
          localMinute: commit.meta.localMinute,
          filePath,
          lineNumber,
          comment,
          extension: getExtension(filePath),
        };
        if (filterComment(lnc, opts)) yield lnc;
      }
    }
  }
}

async function run() {
  let opts: CliOptions;
  try {
    opts = parseCliArgs(process.argv.slice(2));
  } catch (err: unknown) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    console.error("Run 'linus --help' for usage.");
    process.exitCode = 1;
    return;
  }

  if (opts.help) {
    console.log(HELP);
    return;
  }

  if (opts.version) {
    console.log(`linus v${VERSION}`);
    return;
  }

  const useColor = !opts.noColor && process.stdout.isTTY === true;
  const printComment = (cmt: LateNightComment) => {
    if (opts.json) {
      console.log(formatJson(cmt));
    } else {
      console.log(formatPretty(cmt, useColor));
      console.log();
    }
  };

  try {
    if (opts.stats) {
      const allComments: LateNightComment[] = [];
      for await (const cmt of collectComments(opts)) {
        allComments.push(cmt);
        // In stats mode, individual comments are only shown in pretty output
        if (!opts.json) printComment(cmt);
      }
      console.log(opts.json ? formatStatsJson(allComments) : formatStats(allComments, useColor));
    } else {
      for await (const cmt of collectComments(opts)) printComment(cmt);
    }
  } catch (err: unknown) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

run();
