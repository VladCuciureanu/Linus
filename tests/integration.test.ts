import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";

async function git(dir: string, args: string[], env?: Record<string, string>) {
  const cmd = new Deno.Command("git", {
    args: ["-C", dir, ...args],
    stdout: "null",
    stderr: "null",
    env: { ...Deno.env.toObject(), ...env },
  });
  const { success } = await cmd.output();
  if (!success) throw new Error(`git ${args.join(" ")} failed`);
}

async function runLinus(args: string[]): Promise<{ stdout: string; code: number }> {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-run=git",
      "--allow-read",
      "--allow-env",
      "src/main.ts",
      ...args,
    ],
    stdout: "piped",
    stderr: "piped",
    env: { ...Deno.env.toObject(), NO_COLOR: "1" },
  });
  const output = await cmd.output();
  return {
    stdout: new TextDecoder().decode(output.stdout),
    code: output.code,
  };
}

async function createTestRepo(): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "linus-integ-" });

  await git(dir, ["init"]);
  await git(dir, ["config", "user.name", "Sleepy Dev"]);
  await git(dir, ["config", "user.email", "sleepy@dev.io"]);

  // Commit 1: 2:30 AM — should be found
  await Deno.writeTextFile(`${dir}/app.ts`, '// the void stares back\nconst x = 1;\n');
  await git(dir, ["add", "."], );
  await git(dir, ["commit", "-m", "commit1"], {
    GIT_AUTHOR_DATE: "2023-06-01T02:30:00+00:00",
    GIT_COMMITTER_DATE: "2023-06-01T02:30:00+00:00",
  });

  // Commit 2: 14:00 — should NOT be found
  await Deno.writeTextFile(`${dir}/app.ts`, '// the void stares back\nconst x = 1;\n// normal comment\nconst y = 2;\n');
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-m", "commit2"], {
    GIT_AUTHOR_DATE: "2023-06-02T14:00:00+00:00",
    GIT_COMMITTER_DATE: "2023-06-02T14:00:00+00:00",
  });

  // Commit 3: 3:15 AM — should be found
  await Deno.writeTextFile(`${dir}/util.py`, '# sleep is for the weak\ndef run(): pass\n');
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-m", "commit3"], {
    GIT_AUTHOR_DATE: "2023-06-03T03:15:00-05:00",
    GIT_COMMITTER_DATE: "2023-06-03T03:15:00-05:00",
  });

  // Commit 4: 1:00 AM, different author — should be found
  await git(dir, ["config", "user.name", "Night Owl"]);
  await git(dir, ["config", "user.email", "owl@night.com"]);
  await Deno.writeTextFile(`${dir}/debug.js`, '// why does this even work\nconsole.log("?");\n');
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-m", "commit4"], {
    GIT_AUTHOR_DATE: "2023-06-04T01:00:00+00:00",
    GIT_COMMITTER_DATE: "2023-06-04T01:00:00+00:00",
  });

  return dir;
}

Deno.test("integration - finds late-night comments", async () => {
  const dir = await createTestRepo();
  try {
    const { stdout, code } = await runLinus(["--json", dir]);
    assertEquals(code, 0);
    const lines = stdout.trim().split("\n").filter(Boolean);
    assertEquals(lines.length, 3);
    const comments = lines.map((l) => JSON.parse(l));

    // Newest first
    assert(comments.some((c: Record<string, unknown>) => c.comment === "why does this even work"));
    assert(comments.some((c: Record<string, unknown>) => c.comment === "sleep is for the weak"));
    assert(comments.some((c: Record<string, unknown>) => c.comment === "the void stares back"));

    // "normal comment" from the 14:00 commit should NOT appear
    assert(!comments.some((c: Record<string, unknown>) => c.comment === "normal comment"));
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("integration - --author filter", async () => {
  const dir = await createTestRepo();
  try {
    const { stdout, code } = await runLinus(["--json", "--author", "Night Owl", dir]);
    assertEquals(code, 0);
    const lines = stdout.trim().split("\n").filter(Boolean);
    assertEquals(lines.length, 1);
    const c = JSON.parse(lines[0]);
    assertEquals(c.author, "Night Owl");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("integration - --grep filter", async () => {
  const dir = await createTestRepo();
  try {
    const { stdout, code } = await runLinus(["--json", "--grep", "void", dir]);
    assertEquals(code, 0);
    const lines = stdout.trim().split("\n").filter(Boolean);
    assertEquals(lines.length, 1);
    assert(JSON.parse(lines[0]).comment.includes("void"));
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("integration - --path filter", async () => {
  const dir = await createTestRepo();
  try {
    const { stdout, code } = await runLinus(["--json", "--path", "*.py", dir]);
    assertEquals(code, 0);
    const lines = stdout.trim().split("\n").filter(Boolean);
    assertEquals(lines.length, 1);
    assertEquals(JSON.parse(lines[0]).filePath, "util.py");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("integration - --stats flag", async () => {
  const dir = await createTestRepo();
  try {
    const { stdout, code } = await runLinus(["--stats", dir]);
    assertEquals(code, 0);
    assert(stdout.includes("Total late-night comments: 3"));
    assert(stdout.includes("Stats"));
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("integration - --help", async () => {
  const { stdout, code } = await runLinus(["--help"]);
  assertEquals(code, 0);
  assert(stdout.includes("linus v0.1.0"));
  assert(stdout.includes("USAGE:"));
});

Deno.test("integration - --version", async () => {
  const { stdout, code } = await runLinus(["--version"]);
  assertEquals(code, 0);
  assert(stdout.trim().startsWith("linus v"));
});
