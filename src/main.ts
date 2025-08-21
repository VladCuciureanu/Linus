import type { CliOptions, LateNightComment } from "./types.ts";
import { readGitLog } from "./git.ts";
import { getExtension } from "./diff.ts";
import { extractCommentsFromLines } from "./comments.ts";
import {
  filterByTime,
  filterByAuthor,
  filterComment,
} from "./filter.ts";
import { formatPretty, formatJson, formatStats } from "./format.ts";

const VERSION = "0.1.0";

const HELP = `
linus v${VERSION} — the 3am comment finder

Finds every code comment written between midnight and 4am
across your repo's history. They are always unhinged and
often prophetic.

USAGE:
  linus [OPTIONS] [path]

ARGUMENTS:
  [path]    Path to git repository (default: current directory)

OPTIONS:
  --after <HH:MM>        Start of time window (default: 00:00)
  --before <HH:MM>       End of time window (default: 04:00)
  --author <name>         Filter by author name/email (substring match)
  --since <date>          Only commits after this date
  --until <date>          Only commits before this date
  --path <glob>           Only files matching this glob
  --grep <pattern>        Filter comments by regex pattern
  --min-length <n>        Minimum comment length (default: 3)
  --max-commits <n>       Max number of commits to scan
  --all-branches          Scan all branches, not just current
  --json                  Output as newline-delimited JSON
  --stats                 Print summary statistics
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

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {
    repoPath: ".",
    after: { hour: 0, minute: 0 },
    before: { hour: 4, minute: 0 },
    minLength: 3,
    allBranches: false,
    json: false,
    stats: false,
    noColor: false,
    help: false,
    version: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case "-h":
      case "--help":
        opts.help = true;
        break;
      case "-V":
      case "--version":
        opts.version = true;
        break;
      case "--after":
        opts.after = parseHHMM(args[++i]);
        break;
      case "--before":
        opts.before = parseHHMM(args[++i]);
        break;
      case "--author":
        opts.author = args[++i];
        break;
      case "--since":
        opts.since = args[++i];
        break;
      case "--until":
        opts.until = args[++i];
        break;
      case "--path":
        opts.pathGlob = args[++i];
        break;
      case "--grep":
        opts.grep = new RegExp(args[++i]);
        break;
      case "--min-length":
        opts.minLength = parseInt(args[++i], 10);
        break;
      case "--max-commits":
        opts.maxCommits = parseInt(args[++i], 10);
        break;
      case "--all-branches":
        opts.allBranches = true;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--stats":
        opts.stats = true;
        break;
      case "--no-color":
        opts.noColor = true;
        break;
      default:
        if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          Deno.exit(1);
        }
        opts.repoPath = arg;
    }
    i++;
  }

  // Respect NO_COLOR env var
  if (Deno.env.get("NO_COLOR") !== undefined) {
    opts.noColor = true;
  }

  return opts;
}

async function run() {
  const opts = parseArgs(Deno.args);

  if (opts.help) {
    console.log(HELP);
    return;
  }

  if (opts.version) {
    console.log(`linus v${VERSION}`);
    return;
  }

  const useColor = !opts.noColor && Deno.stdout.isTerminal();
  const allComments: LateNightComment[] = [];

  try {
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
        const comments = extractCommentsFromLines(lines, filePath);
        for (const { lineNumber, comment } of comments) {
          const lnc: LateNightComment = {
            hash: commit.meta.hash,
            author: commit.meta.author,
            authorEmail: commit.meta.authorEmail,
            date: commit.meta.date,
            localHour: commit.meta.localHour,
            localMinute: commit.meta.localMinute,
            filePath,
            lineNumber,
            comment,
            language: getExtension(filePath),
          };

          if (!filterComment(lnc, opts)) continue;

          if (opts.stats) {
            allComments.push(lnc);
          } else if (opts.json) {
            console.log(formatJson(lnc));
          } else {
            console.log(formatPretty(lnc, useColor));
            console.log();
          }
        }
      }
    }

    if (opts.stats) {
      // In stats mode, also print individual comments if not --json
      if (!opts.json) {
        for (const cmt of allComments) {
          console.log(formatPretty(cmt, useColor));
          console.log();
        }
      }
      console.log(formatStats(allComments, useColor));
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error(`Error: ${err.message}`);
    } else {
      console.error(`Error: ${err}`);
    }
    Deno.exit(1);
  }
}

run();
