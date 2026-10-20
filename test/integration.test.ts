import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAIN = join(import.meta.dirname, "..", "src", "main.ts");

async function git(dir: string, args: string[], env?: Record<string, string>) {
  try {
    await execFileAsync("git", ["-C", dir, ...args], {
      env: { ...process.env, ...env },
    });
  } catch {
    throw new Error(`git ${args.join(" ")} failed`);
  }
}

async function runLinus(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [MAIN, ...args], {
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: unknown };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      code: typeof e.code === "number" ? e.code : 1,
    };
  }
}

async function createTestRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "linus-integ-"));

  await git(dir, ["init"]);
  await git(dir, ["config", "user.name", "Sleepy Dev"]);
  await git(dir, ["config", "user.email", "sleepy@dev.io"]);

  // Commit 1: 2:30 AM — should be found
  await writeFile(join(dir, "app.ts"), "// the void stares back\nconst x = 1;\n");
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-m", "commit1"], {
    GIT_AUTHOR_DATE: "2023-06-01T02:30:00+00:00",
    GIT_COMMITTER_DATE: "2023-06-01T02:30:00+00:00",
  });

  // Commit 2: 14:00 — should NOT be found
  await writeFile(
    join(dir, "app.ts"),
    "// the void stares back\nconst x = 1;\n// normal comment\nconst y = 2;\n",
  );
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-m", "commit2"], {
    GIT_AUTHOR_DATE: "2023-06-02T14:00:00+00:00",
    GIT_COMMITTER_DATE: "2023-06-02T14:00:00+00:00",
  });

  // Commit 3: 3:15 AM — should be found
  await writeFile(join(dir, "util.py"), "# sleep is for the weak\ndef run(): pass\n");
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-m", "commit3"], {
    GIT_AUTHOR_DATE: "2023-06-03T03:15:00-05:00",
    GIT_COMMITTER_DATE: "2023-06-03T03:15:00-05:00",
  });

  // Commit 4: 1:00 AM, different author — should be found
  await git(dir, ["config", "user.name", "Night Owl"]);
  await git(dir, ["config", "user.email", "owl@night.com"]);
  await writeFile(join(dir, "debug.js"), '// why does this even work\nconsole.log("?");\n');
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-m", "commit4"], {
    GIT_AUTHOR_DATE: "2023-06-04T01:00:00+00:00",
    GIT_COMMITTER_DATE: "2023-06-04T01:00:00+00:00",
  });

  return dir;
}

let dir: string;

before(async () => {
  dir = await createTestRepo();
});

after(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

test("integration - finds late-night comments", async () => {
  const { stdout, code } = await runLinus(["--json", dir]);
  assert.deepEqual(code, 0);
  const lines = stdout.trim().split("\n").filter(Boolean);
  assert.deepEqual(lines.length, 3);
  const comments = lines.map((l) => JSON.parse(l));

  // Newest first
  assert.ok(comments.some((c: Record<string, unknown>) => c.comment === "why does this even work"));
  assert.ok(comments.some((c: Record<string, unknown>) => c.comment === "sleep is for the weak"));
  assert.ok(comments.some((c: Record<string, unknown>) => c.comment === "the void stares back"));

  // "normal comment" from the 14:00 commit should NOT appear
  assert.ok(!comments.some((c: Record<string, unknown>) => c.comment === "normal comment"));
});

test("integration - --author filter", async () => {
  const { stdout, code } = await runLinus(["--json", "--author", "Night Owl", dir]);
  assert.deepEqual(code, 0);
  const lines = stdout.trim().split("\n").filter(Boolean);
  assert.deepEqual(lines.length, 1);
  const c = JSON.parse(lines[0]);
  assert.deepEqual(c.author, "Night Owl");
});

test("integration - --grep filter", async () => {
  const { stdout, code } = await runLinus(["--json", "--grep", "void", dir]);
  assert.deepEqual(code, 0);
  const lines = stdout.trim().split("\n").filter(Boolean);
  assert.deepEqual(lines.length, 1);
  assert.ok(JSON.parse(lines[0]).comment.includes("void"));
});

test("integration - --path filter", async () => {
  const { stdout, code } = await runLinus(["--json", "--path", "*.py", dir]);
  assert.deepEqual(code, 0);
  const lines = stdout.trim().split("\n").filter(Boolean);
  assert.deepEqual(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]).filePath, "util.py");
});

test("integration - --stats flag", async () => {
  const { stdout, code } = await runLinus(["--stats", dir]);
  assert.deepEqual(code, 0);
  assert.ok(stdout.includes("Total late-night comments: 3"));
  assert.ok(stdout.includes("Stats"));
});

test("integration - --help", async () => {
  const { stdout, code } = await runLinus(["--help"]);
  assert.deepEqual(code, 0);
  assert.ok(stdout.includes("linus v0.1.0"));
  assert.ok(stdout.includes("USAGE:"));
});

test("integration - --version", async () => {
  const { stdout, code } = await runLinus(["--version"]);
  assert.deepEqual(code, 0);
  assert.ok(stdout.trim().startsWith("linus v"));
});

test("integration - --version reads the version from package.json", async () => {
  const root = await mkdtemp(join(tmpdir(), "linus-version-"));
  try {
    await cp(join(import.meta.dirname, "..", "src"), join(root, "src"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "9.8.7" }));
    const { stdout } = await execFileAsync(process.execPath, [
      join(root, "src", "main.ts"),
      "--version",
    ]);
    assert.equal(stdout.trim(), "linus v9.8.7");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const [label, args, expected] of [
  ["missing option value", ["--author"], /--author/],
  ["invalid --grep regex", ["--grep", "("], /Invalid --grep pattern/],
  ["non-numeric --min-length", ["--min-length", "abc"], /Invalid value for --min-length: "abc"/],
  ["non-numeric --max-commits", ["--max-commits", "1x"], /Invalid value for --max-commits: "1x"/],
  ["zero --max-commits", ["--max-commits", "0"], /Invalid value for --max-commits: "0"/],
  ["invalid --after", ["--after", "25:00"], /Invalid time/],
  ["unknown option", ["--frobnicate"], /--frobnicate/],
  ["extra positional", [".", "other"], /Unexpected argument: "other"/],
] as const) {
  test(`integration - ${label} exits 1 with a clean error`, async () => {
    const { stdout, stderr, code } = await runLinus([...args]);
    assert.deepEqual(code, 1);
    assert.deepEqual(stdout, "");
    assert.match(stderr, /^Error: /);
    assert.match(stderr, expected);
    assert.doesNotMatch(stderr, /\n\s+at /, "no stack trace expected");
  });
}

test("integration - --min-length accepts a valid number", async () => {
  const { stdout, code } = await runLinus(["--json", "--min-length", "22", dir]);
  assert.deepEqual(code, 0);
  const lines = stdout.trim().split("\n").filter(Boolean);
  assert.deepEqual(
    lines.map((l) => JSON.parse(l).comment),
    ["why does this even work"],
  );
});

test("integration - --stats --json emits a JSON stats object", async () => {
  const { stdout, code } = await runLinus(["--stats", "--json", dir]);
  assert.deepEqual(code, 0);
  const lines = stdout.trim().split("\n").filter(Boolean);
  assert.deepEqual(lines.length, 1);
  const stats = JSON.parse(lines[0]);
  assert.deepEqual(stats.total, 3);
  assert.deepEqual(stats.topAuthor, { name: "Sleepy Dev", count: 2 });
  assert.deepEqual(stats.hourDistribution, [
    { hour: 1, count: 1 },
    { hour: 2, count: 1 },
    { hour: 3, count: 1 },
  ]);
});
