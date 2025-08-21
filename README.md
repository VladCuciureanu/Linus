# Linus

**The 3AM comment finder** — finds every code comment written between midnight and 4 AM across your repo's history. Collects them. They are always unhinged and often prophetic.

```
┌─────────────────────────────────────────────────────┐
│ 2:47 AM · 2023-11-14 · @rickson                    │
│ abc1234 · src/db/connection.ts                      │
├─────────────────────────────────────────────────────┤
│ "i think this works but i don't know why and at     │
│  this point i'm too afraid to find out"             │
└─────────────────────────────────────────────────────┘
```

## Install

**Requirements:** [Deno](https://deno.com/) and `git`.

### Run from source

```sh
deno run --allow-run=git --allow-read --allow-env src/main.ts [OPTIONS] [path]
```

### Compile to binary

```sh
deno task compile
./linus [OPTIONS] [path]
```

### Install globally

```sh
deno install --allow-run=git --allow-read --allow-env -n linus src/main.ts
```

## Usage

```sh
# Scan current repo for 3am comments
linus

# Scan a specific repo
linus /path/to/repo

# Output as JSON (great for piping)
linus --json

# Show stats (busiest hour, top night owl, etc.)
linus --stats

# Custom time window (e.g. 10pm–6am)
linus --after 22:00 --before 06:00

# Filter by author
linus --author "rickson"

# Search comments by pattern
linus --grep "why"

# Only TypeScript files
linus --path "*.ts"

# Limit scan depth
linus --max-commits 1000

# Scan all branches
linus --all-branches
```

## CLI Reference

```
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
```

## How it works

1. Runs `git log -p` to stream the full commit history with patches
2. Parses unified diffs to extract only **added lines** per commit
3. Detects code comments using language-aware heuristics (supports 30+ languages)
4. Filters by the **author's local time** — so "3 AM" means 3 AM wherever they were, not where you are
5. Presents the results in a pretty terminal format (or JSON for scripting)

## Supported languages

TypeScript, JavaScript, Python, Go, Rust, Ruby, C, C++, Java, Kotlin, Swift, Scala, Dart, Zig, Shell, Lua, SQL, Lisp/Clojure, LaTeX/Erlang, HTML/XML, CSS/SCSS, YAML, TOML, and more.

## Development

```sh
# Run tests
deno task test

# Type-check
deno task check

# Run in dev mode
deno task dev [OPTIONS] [path]
```
