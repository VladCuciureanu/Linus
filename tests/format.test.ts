import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { formatPretty, formatJson, formatStats } from "../src/format.ts";
import type { LateNightComment } from "../src/types.ts";

function makeComment(overrides: Partial<LateNightComment> = {}): LateNightComment {
  return {
    hash: "abc1234",
    author: "Night Owl",
    authorEmail: "owl@example.com",
    date: new Date("2023-11-14T02:47:00Z"),
    localHour: 2,
    localMinute: 47,
    filePath: "src/db/connection.ts",
    lineNumber: 42,
    comment: "i think this works but i don't know why",
    language: "ts",
    ...overrides,
  };
}

Deno.test("formatPretty - contains key info", () => {
  const output = formatPretty(makeComment(), false);
  assert(output.includes("2:47 AM"));
  assert(output.includes("@Night Owl"));
  assert(output.includes("abc1234"));
  assert(output.includes("src/db/connection.ts"));
  assert(output.includes("i think this works"));
});

Deno.test("formatPretty - uses box drawing", () => {
  const output = formatPretty(makeComment(), false);
  assert(output.includes("┌"));
  assert(output.includes("┘"));
  assert(output.includes("├"));
});

Deno.test("formatJson - produces valid JSON", () => {
  const output = formatJson(makeComment());
  const parsed = JSON.parse(output);
  assertEquals(parsed.hash, "abc1234");
  assertEquals(parsed.author, "Night Owl");
  assertEquals(parsed.comment, "i think this works but i don't know why");
  assertEquals(parsed.filePath, "src/db/connection.ts");
  assertEquals(parsed.lineNumber, 42);
  assertEquals(parsed.localTime, "2:47 AM");
});

Deno.test("formatStats - empty list", () => {
  const output = formatStats([], false);
  assertEquals(output, "No late-night comments found.");
});

Deno.test("formatStats - computes correct stats", () => {
  const comments = [
    makeComment({ author: "Alice", localHour: 2 }),
    makeComment({ author: "Alice", localHour: 2 }),
    makeComment({ author: "Bob", localHour: 3, filePath: "other.ts" }),
  ];
  const output = formatStats(comments, false);
  assert(output.includes("Total late-night comments: 3"));
  assert(output.includes("Alice"));
  assert(output.includes("2:00"));
});
