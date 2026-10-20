import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPretty, formatJson, formatStats } from "../src/format.ts";
import type { LateNightComment } from "../src/types.ts";

function makeComment(overrides: Partial<LateNightComment> = {}): LateNightComment {
  return {
    hash: "abc1234",
    author: "Night Owl",
    authorEmail: "owl@example.com",
    date: new Date("2023-11-14T02:47:00Z"),
    localDate: "2023-11-14",
    localHour: 2,
    localMinute: 47,
    filePath: "src/db/connection.ts",
    lineNumber: 42,
    comment: "i think this works but i don't know why",
    language: "ts",
    ...overrides,
  };
}

test("formatPretty - contains key info", () => {
  const output = formatPretty(makeComment(), false);
  assert.ok(output.includes("2:47 AM"));
  assert.ok(output.includes("@Night Owl"));
  assert.ok(output.includes("abc1234"));
  assert.ok(output.includes("src/db/connection.ts"));
  assert.ok(output.includes("i think this works"));
});

test("formatPretty - uses box drawing", () => {
  const output = formatPretty(makeComment(), false);
  assert.ok(output.includes("┌"));
  assert.ok(output.includes("┘"));
  assert.ok(output.includes("├"));
});

test("formatJson - produces valid JSON", () => {
  const output = formatJson(makeComment());
  const parsed = JSON.parse(output);
  assert.deepEqual(parsed.hash, "abc1234");
  assert.deepEqual(parsed.author, "Night Owl");
  assert.deepEqual(parsed.comment, "i think this works but i don't know why");
  assert.deepEqual(parsed.filePath, "src/db/connection.ts");
  assert.deepEqual(parsed.lineNumber, 42);
  assert.deepEqual(parsed.localTime, "2:47 AM");
});

test("formatStats - empty list", () => {
  const output = formatStats([], false);
  assert.deepEqual(output, "No late-night comments found.");
});

test("formatStats - computes correct stats", () => {
  const comments = [
    makeComment({ author: "Alice", localHour: 2 }),
    makeComment({ author: "Alice", localHour: 2 }),
    makeComment({ author: "Bob", localHour: 3, filePath: "other.ts" }),
  ];
  const output = formatStats(comments, false);
  assert.ok(output.includes("Total late-night comments: 3"));
  assert.ok(output.includes("Alice"));
  assert.ok(output.includes("2:00"));
});

test("formatPretty - colored card lines have equal visible width", () => {
  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const output = formatPretty(
    makeComment({ comment: "a long late-night comment that should wrap across more than one line of the card body" }),
    true,
  );
  assert.ok(output.includes("\x1b["), "expected ANSI codes in colored output");
  const widths = output.split("\n").map((l) => [...stripAnsi(l)].length);
  assert.ok(widths.length > 5);
  for (const w of widths) assert.equal(w, widths[0]);
});

test("formatPretty - shows the author-local date, not the UTC date", () => {
  // 2:30 AM on Nov 14 at +05:30 is 21:00 UTC on Nov 13.
  const output = formatPretty(
    makeComment({
      date: new Date("2023-11-14T02:30:00+05:30"),
      localDate: "2023-11-14",
      localHour: 2,
      localMinute: 30,
    }),
    false,
  );
  assert.ok(output.includes("2023-11-14"), output);
  assert.ok(!output.includes("2023-11-13"), output);
});
