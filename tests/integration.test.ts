import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

async function runLinus(args: string[]): Promise<{ stdout: string; code: number }> {
  try {
    const { stdout } = await execFileAsync(process.execPath, [MAIN, ...args], {
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { stdout, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; code?: unknown };
    return {
      stdout: e.stdout ?? "",
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
  await writeFile(join(dir, "app.ts"), '// the void stares back\nconst x = 1;\n');
  await git(dir, ["add", "."], );
  await git(dir, ["commit", "-m", "commit1"], {
    GIT_AUTHOR_DATE: "2023-06-01T02:30:00+00:00",
    GIT_COMMITTER_DATE: "2023-06-01T02:30:00+00:00",
  });

  // Commit 2: 14:00 — should NOT be found
  await writeFile(join(dir, "app.ts"), '// the void stares back\nconst x = 1;\n// normal comment\nconst y = 2;\n');
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-m", "commit2"], {
    GIT_AUTHOR_DATE: "2023-06-02T14:00:00+00:00",
    GIT_COMMITTER_DATE: "2023-06-02T14:00:00+00:00",
  });

  // Commit 3: 3:15 AM — should be found
  await writeFile(join(dir, "util.py"), '# sleep is for the weak\ndef run(): pass\n');
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

test("integration - finds late-night comments", async () => {
  const dir = await createTestRepo();
  try {
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
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("integration - --author filter", async () => {
  const dir = await createTestRepo();
  try {
    const { stdout, code } = await runLinus(["--json", "--author", "Night Owl", dir]);
    assert.deepEqual(code, 0);
    const lines = stdout.trim().split("\n").filter(Boolean);
    assert.deepEqual(lines.length, 1);
    const c = JSON.parse(lines[0]);
    assert.deepEqual(c.author, "Night Owl");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("integration - --grep filter", async () => {
  const dir = await createTestRepo();
  try {
    const { stdout, code } = await runLinus(["--json", "--grep", "void", dir]);
    assert.deepEqual(code, 0);
    const lines = stdout.trim().split("\n").filter(Boolean);
    assert.deepEqual(lines.length, 1);
    assert.ok(JSON.parse(lines[0]).comment.includes("void"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("integration - --path filter", async () => {
  const dir = await createTestRepo();
  try {
    const { stdout, code } = await runLinus(["--json", "--path", "*.py", dir]);
    assert.deepEqual(code, 0);
    const lines = stdout.trim().split("\n").filter(Boolean);
    assert.deepEqual(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]).filePath, "util.py");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("integration - --stats flag", async () => {
  const dir = await createTestRepo();
  try {
    const { stdout, code } = await runLinus(["--stats", dir]);
    assert.deepEqual(code, 0);
    assert.ok(stdout.includes("Total late-night comments: 3"));
    assert.ok(stdout.includes("Stats"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
