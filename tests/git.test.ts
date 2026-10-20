import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  await writeFile(file1, '// i am become code\nconst x = 1;\n');
  await run(["add", "."]);
  await run(["commit", "-m", "late night"], {
    GIT_AUTHOR_DATE: "2023-11-14T02:30:00+00:00",
    GIT_COMMITTER_DATE: "2023-11-14T02:30:00+00:00",
  });

  // Commit 2: 10 AM (outside the window)
  await writeFile(file1, '// i am become code\nconst x = 1;\n// sensible daytime comment\nconst y = 2;\n');
  await run(["add", "."]);
  await run(["commit", "-m", "daytime"], {
    GIT_AUTHOR_DATE: "2023-11-14T10:00:00+00:00",
    GIT_COMMITTER_DATE: "2023-11-14T10:00:00+00:00",
  });

  // Commit 3: 3:45 AM (in the window)
  const file2 = join(dir, "util.py");
  await writeFile(file2, '# why does this work\ndef f(): pass\n');
  await run(["add", "."]);
  await run(["commit", "-m", "more late"], {
    GIT_AUTHOR_DATE: "2023-11-15T03:45:00-05:00",
    GIT_COMMITTER_DATE: "2023-11-15T03:45:00-05:00",
  });

  return dir;
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
