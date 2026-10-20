# Linus

The 3 AM comment finder: walks a repository's history and collects every code comment added late at night (between midnight and 4 AM by default), in the author's local time. They are always unhinged and often prophetic.

```
┌─────────────────────────────────────────────────────┐
│ 2:47 AM · 2023-11-14 · @rickson                     │
│ abc1234 · src/db/connection.ts                      │
├─────────────────────────────────────────────────────┤
│ "this works and i am too afraid to ask why"         │
└─────────────────────────────────────────────────────┘
```

## Requirements

Node.js 26 or newer, and `git` on `PATH`.

## Install

```sh
npm install        # also builds dist/ via the prepare script
npm install -g .   # or: npm link
```

Or run from source without installing: `node src/main.ts [options] [path]`.

## Usage

```
linus [options] [path]
```

`path` is the repository to scan (default: current directory). Merge commits are skipped; only lines added in each commit are inspected.

| Option | Description |
| --- | --- |
| `--after <HH:MM>` | Start of the time window, inclusive (default `00:00`) |
| `--before <HH:MM>` | End of the time window, exclusive (default `04:00`). A window may wrap midnight, e.g. `--after 22:00 --before 06:00` |
| `--author <text>` | Case-insensitive substring match on author name or email |
| `--since <date>`, `--until <date>` | Passed to `git log` as-is |
| `--path <glob>` | Match the file path against a glob; `*` matches any characters, including `/` |
| `--grep <regex>` | Keep only comments matching a JavaScript regular expression |
| `--min-length <n>` | Minimum comment length in characters (default `3`) |
| `--max-commits <n>` | Scan at most `n` commits |
| `--all-branches` | Scan all refs, not just the current branch |
| `--json` | One JSON object per comment, newline-delimited |
| `--stats` | Print a summary after the comments; with `--json`, print only the summary as one JSON object |
| `--no-color` | Disable colour. Colour is also off when stdout is not a TTY or `NO_COLOR` is set to a non-empty value |
| `-h`, `--help` | Show help |
| `-V`, `--version` | Show version |

```sh
linus ~/src/legacy-billing --grep "why|sorry" --path "*.ts"
linus --author rickson --stats
linus --json | jq -r .comment   # requires jq
```

JSON fields: `hash`, `author`, `authorEmail`, `date` (ISO 8601, UTC), `localTime` (author-local 24-hour `HH:MM`, e.g. `02:47`), `filePath`, `lineNumber`, `comment`, `extension` (lowercased file extension without the dot, e.g. `ts`; empty if the file has none).

Invalid arguments and `git` failures print to stderr and exit with status 1.

Comments are detected heuristically per file type: C-family and JS/TS, Rust, Python, Ruby, shell and config files (YAML, TOML, INI, Dockerfile, Makefile), HTML/XML/Markdown, CSS and preprocessors, Lua, SQL, Lisp dialects, and LaTeX/Erlang. Lint directives, type-checker pragmas and generated-file banners are ignored.

## Development

```sh
npm test               # node --test (tests live in test/*.test.ts)
npm run check          # biome check, typecheck and tests
npm run format         # biome check --write
npm run lint           # biome lint
npm run typecheck      # tsc
npm run build          # tsc -> dist/
npm run dev -- [options] [path]   # node --watch src/main.ts
npm start -- [options] [path]
```
