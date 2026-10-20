import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";
import { parseAuthorDate, readGitLog } from "../src/git.ts";

const execFileAsync = promisify(execFile);

async function createTempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "linus-test-"));

  const run = async (args: string[], env?: Record<string, string>) => {
    try {
      await execFileAsync("git", ["-C", dir, ...args], {
        env: { ...process.env, ...env },
      });
    } catch {
      throw new Error(`git ${args.join(" ")} failed`);
    }
  };

  await run(["init"]);
  await run(["config", "user.name", "Test User"]);
  await run(["config", "user.email", "test@example.com"]);

  // Commit 1: 2 AM (in the window)
  const file1 = join(dir, "code.ts");
  await writeFile(file1, "// i am become code\nconst x = 1;\n");
  await run(["add", "."]);
  await run(["commit", "-m", "late night"], {
    GIT_AUTHOR_DATE: "2023-11-14T02:30:00+00:00",
    GIT_COMMITTER_DATE: "2023-11-14T02:30:00+00:00",
  });

  // Commit 2: 10 AM (outside the window)
  await writeFile(
    file1,
    "// i am become code\nconst x = 1;\n// sensible daytime comment\nconst y = 2;\n",
  );
  await run(["add", "."]);
  await run(["commit", "-m", "daytime"], {
    GIT_AUTHOR_DATE: "2023-11-14T10:00:00+00:00",
    GIT_COMMITTER_DATE: "2023-11-14T10:00:00+00:00",
  });

  // Commit 3: 3:45 AM (in the window)
  const file2 = join(dir, "util.py");
  await writeFile(file2, "# why does this work\ndef f(): pass\n");
  await run(["add", "."]);
  await run(["commit", "-m", "more late"], {
    GIT_AUTHOR_DATE: "2023-11-15T03:45:00-05:00",
    GIT_COMMITTER_DATE: "2023-11-15T03:45:00-05:00",
  });

  return dir;
}

async function git(cwd: string, args: string[], env?: Record<string, string>) {
  try {
    await execFileAsync("git", ["-C", cwd, ...args], { env: { ...process.env, ...env } });
  } catch {
    throw new Error(`git ${args.join(" ")} failed`);
  }
}

/** Create an empty repo for a single test; removed again when the test ends. */
async function emptyRepo(t: { after: (fn: () => Promise<void>) => void }): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "linus-test-"));
  t.after(() => rm(repo, { recursive: true, force: true }));
  await git(repo, ["init"]);
  await git(repo, ["config", "user.name", "Test User"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  return repo;
}

async function commitAll(repo: string, message: string, isoDate: string) {
  await git(repo, ["add", "-A"]);
  await git(repo, ["commit", "-m", message], {
    GIT_AUTHOR_DATE: isoDate,
    GIT_COMMITTER_DATE: isoDate,
  });
}

let dir: string;

before(async () => {
  dir = await createTempRepo();
});

after(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

test("readGitLog - reads commits from temp repo", async () => {
  const commits = [];
  for await (const commit of readGitLog({ repoPath: dir })) {
    commits.push(commit);
  }

  // Should have 3 commits (git log outputs newest first)
  assert.deepEqual(commits.length, 3);

  // Newest commit first: 3:45 AM
  assert.deepEqual(commits[0].meta.localHour, 3);
  assert.deepEqual(commits[0].meta.localMinute, 45);
  assert.deepEqual(commits[0].meta.author, "Test User");
  assert.ok(commits[0].addedLines.length > 0);

  // Middle commit: 10:00 AM
  assert.deepEqual(commits[1].meta.localHour, 10);

  // Oldest commit: 2:30 AM
  assert.deepEqual(commits[2].meta.localHour, 2);
});

test("readGitLog - maxCommits limits output", async () => {
  const commits = [];
  for await (const commit of readGitLog({ repoPath: dir, maxCommits: 1 })) {
    commits.push(commit);
  }
  assert.deepEqual(commits.length, 1);
});

test("readGitLog - added lines have correct file paths", async () => {
  const commits = [];
  for await (const commit of readGitLog({ repoPath: dir })) {
    commits.push(commit);
  }

  // Newest commit added util.py
  const pyLines = commits[0].addedLines.filter((l) => l.filePath === "util.py");
  assert.ok(pyLines.length > 0);
  assert.ok(pyLines.some((l) => l.content.includes("why does this work")));
});

test("readGitLog - diff lines that look like metadata stay in the diff", async (t) => {
  const repo = await emptyRepo(t);
  await writeFile(join(repo, "a.ts"), "// first\n");
  await commitAll(repo, "first", "2023-11-14T02:00:00+00:00");
  // An added line shaped exactly like our metadata line.
  const tricky = "x†Mallory†m@example.com†2020-01-01T12:00:00+00:00";
  await writeFile(join(repo, "b.txt"), `${tricky}\nafter\n`);
  await commitAll(repo, "second", "2023-11-15T03:00:00+00:00");

  const commits = [];
  for await (const commit of readGitLog({ repoPath: repo })) commits.push(commit);

  assert.deepEqual(commits.length, 2);
  assert.deepEqual(commits[0].meta.author, "Test User");
  assert.deepEqual(commits[0].meta.localHour, 3);
  assert.deepEqual(
    commits[0].addedLines.map((l) => l.content),
    [tricky, "after"],
  );
});

test("readGitLog - stopping early does not throw", async (t) => {
  const repo = await emptyRepo(t);
  // A diff far larger than the pipe buffers, so git is still writing when
  // the consumer stops reading.
  const big = Array.from({ length: 40_000 }, (_, i) => `// line ${i} ${"x".repeat(60)}`).join("\n");
  await writeFile(join(repo, "big.ts"), big + "\n");
  await commitAll(repo, "big", "2023-11-14T02:00:00+00:00");
  await writeFile(join(repo, "small.ts"), "// small\n");
  await commitAll(repo, "small", "2023-11-15T02:00:00+00:00");
  await writeFile(join(repo, "small2.ts"), "// small 2\n");
  await commitAll(repo, "small2", "2023-11-16T02:00:00+00:00");

  let seen = 0;
  for await (const commit of readGitLog({ repoPath: repo })) {
    seen++;
    assert.ok(commit.addedLines.length > 0);
    break;
  }
  assert.deepEqual(seen, 1);
});

test("readGitLog - includes lines added to renamed files", async (t) => {
  const repo = await emptyRepo(t);
  const body = Array.from({ length: 10 }, (_, i) => `const v${i} = ${i};`).join("\n");
  await writeFile(join(repo, "old.ts"), body + "\n");
  await commitAll(repo, "add", "2023-11-14T02:00:00+00:00");
  await git(repo, ["mv", "old.ts", "new.ts"]);
  await writeFile(join(repo, "new.ts"), body + "\n// added while renaming\n");
  await commitAll(repo, "rename", "2023-11-15T02:00:00+00:00");

  const commits = [];
  for await (const commit of readGitLog({ repoPath: repo })) commits.push(commit);

  assert.deepEqual(commits.length, 2);
  assert.deepEqual(commits[0].addedLines, [
    { filePath: "new.ts", lineNumber: 11, content: "// added while renaming" },
  ]);
});

test("readGitLog - reports git failures", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "linus-test-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  await assert.rejects(async () => {
    for await (const _ of readGitLog({ repoPath: join(parent, "missing") })) {
      // drain
    }
  }, /git log failed/);
});

// --- parseAuthorDate ---

test("parseAuthorDate - extracts local hour and minute", () => {
  const result = parseAuthorDate("2023-11-14T02:47:13+05:30");
  assert.deepEqual(result.localHour, 2);
  assert.deepEqual(result.localMinute, 47);
  assert.deepEqual(result.localDate, "2023-11-14");
});

test("parseAuthorDate - negative timezone offset", () => {
  const result = parseAuthorDate("2023-06-01T23:15:00-08:00");
  assert.deepEqual(result.localHour, 23);
  assert.deepEqual(result.localMinute, 15);
});

test("parseAuthorDate - midnight", () => {
  const result = parseAuthorDate("2023-01-01T00:00:00+00:00");
  assert.deepEqual(result.localHour, 0);
  assert.deepEqual(result.localMinute, 0);
});
