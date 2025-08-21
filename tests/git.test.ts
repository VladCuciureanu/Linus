import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { readGitLog } from "../src/git.ts";

async function createTempRepo(): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "linus-test-" });

  const run = async (args: string[], env?: Record<string, string>) => {
    const cmd = new Deno.Command("git", {
      args: ["-C", dir, ...args],
      stdout: "null",
      stderr: "null",
      env: { ...Deno.env.toObject(), ...env },
    });
    const status = await cmd.output();
    if (!status.success) throw new Error(`git ${args.join(" ")} failed`);
  };

  await run(["init"]);
  await run(["config", "user.name", "Test User"]);
  await run(["config", "user.email", "test@example.com"]);

  // Commit 1: 2 AM (in the window)
  const file1 = `${dir}/code.ts`;
  await Deno.writeTextFile(file1, '// i am become code\nconst x = 1;\n');
  await run(["add", "."]);
  await run(["commit", "-m", "late night"], {
    GIT_AUTHOR_DATE: "2023-11-14T02:30:00+00:00",
    GIT_COMMITTER_DATE: "2023-11-14T02:30:00+00:00",
  });

  // Commit 2: 10 AM (outside the window)
  await Deno.writeTextFile(file1, '// i am become code\nconst x = 1;\n// sensible daytime comment\nconst y = 2;\n');
  await run(["add", "."]);
  await run(["commit", "-m", "daytime"], {
    GIT_AUTHOR_DATE: "2023-11-14T10:00:00+00:00",
    GIT_COMMITTER_DATE: "2023-11-14T10:00:00+00:00",
  });

  // Commit 3: 3:45 AM (in the window)
  const file2 = `${dir}/util.py`;
  await Deno.writeTextFile(file2, '# why does this work\ndef f(): pass\n');
  await run(["add", "."]);
  await run(["commit", "-m", "more late"], {
    GIT_AUTHOR_DATE: "2023-11-15T03:45:00-05:00",
    GIT_COMMITTER_DATE: "2023-11-15T03:45:00-05:00",
  });

  return dir;
}

Deno.test("readGitLog - reads commits from temp repo", async () => {
  const dir = await createTempRepo();
  try {
    const commits = [];
    for await (const commit of readGitLog({ repoPath: dir })) {
      commits.push(commit);
    }

    // Should have 3 commits (git log outputs newest first)
    assertEquals(commits.length, 3);

    // Newest commit first: 3:45 AM
    assertEquals(commits[0].meta.localHour, 3);
    assertEquals(commits[0].meta.localMinute, 45);
    assertEquals(commits[0].meta.author, "Test User");
    assert(commits[0].addedLines.length > 0);

    // Middle commit: 10:00 AM
    assertEquals(commits[1].meta.localHour, 10);

    // Oldest commit: 2:30 AM
    assertEquals(commits[2].meta.localHour, 2);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("readGitLog - maxCommits limits output", async () => {
  const dir = await createTempRepo();
  try {
    const commits = [];
    for await (const commit of readGitLog({ repoPath: dir, maxCommits: 1 })) {
      commits.push(commit);
    }
    assertEquals(commits.length, 1);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("readGitLog - added lines have correct file paths", async () => {
  const dir = await createTempRepo();
  try {
    const commits = [];
    for await (const commit of readGitLog({ repoPath: dir })) {
      commits.push(commit);
    }

    // Newest commit added util.py
    const pyLines = commits[0].addedLines.filter((l) => l.filePath === "util.py");
    assert(pyLines.length > 0);
    assert(pyLines.some((l) => l.content.includes("why does this work")));
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
