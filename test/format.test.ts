import assert from "node:assert/strict";
import { test } from "node:test";
import stringWidth from "string-width";
import { formatJson, formatPretty, formatStats, formatStatsJson } from "../src/format.ts";
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
    extension: "ts",
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
  assert.deepEqual(parsed.localTime, "02:47");
});

test("formatJson - localTime is 24-hour HH:MM", () => {
  assert.equal(
    JSON.parse(formatJson(makeComment({ localHour: 0, localMinute: 5 }))).localTime,
    "00:05",
  );
  assert.equal(
    JSON.parse(formatJson(makeComment({ localHour: 14, localMinute: 30 }))).localTime,
    "14:30",
  );
});

test("formatJson - reports the file extension as `extension`", () => {
  const parsed = JSON.parse(formatJson(makeComment()));
  assert.equal(parsed.extension, "ts");
  assert.ok(!("language" in parsed));
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
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matches ANSI escape sequences
  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const output = formatPretty(
    makeComment({
      comment:
        "a long late-night comment that should wrap across more than one line of the card body",
    }),
    true,
  );
  assert.ok(output.includes("\x1b["), "expected ANSI codes in colored output");
  const widths = output.split("\n").map((l) => [...stripAnsi(l)].length);
  assert.ok(widths.length > 5);
  for (const w of widths) assert.equal(w, widths[0]);
});

test("formatPretty - full-width quoted comment lines stay inside the box", () => {
  const output = formatPretty(
    makeComment({ comment: `${"x".repeat(60)} ${"y".repeat(51)}` }),
    false,
  );
  const widths = output.split("\n").map((l) => [...l].length);
  for (const w of widths) assert.equal(w, widths[0], output);
});

test("formatPretty - long header fields are truncated with an ellipsis to fit the box", () => {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matches ANSI escape sequences
  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const longAuthor = `Bartholomew ${"Q".repeat(60)} Featherstonehaugh`;
  const longPath = `src/${"deeply/nested/".repeat(8)}module.ts`;
  for (const color of [false, true]) {
    const output = formatPretty(makeComment({ author: longAuthor, filePath: longPath }), color);
    const lines = output.split("\n").map(stripAnsi);
    const widths = lines.map((l) => [...l].length);
    for (const w of widths) assert.equal(w, widths[0], lines.join("\n"));
    assert.match(lines[1], /@Bartholomew Q+…\s*│$/);
    assert.match(lines[2], /abc1234 · src\/deeply\/.*…\s*│$/);
  }
});

test("formatPretty - short header fields are not truncated", () => {
  const output = formatPretty(makeComment({ author: "Alice", filePath: "src/a.ts" }), false);
  assert.ok(output.includes("@Alice "), output);
  assert.ok(output.includes("abc1234 · src/a.ts "), output);
  assert.ok(!output.includes("…"), output);
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

test("formatStatsJson - empty list", () => {
  assert.deepEqual(JSON.parse(formatStatsJson([])), {
    total: 0,
    busiestHour: null,
    topAuthor: null,
    topFile: null,
    hourDistribution: [],
  });
});

test("formatStatsJson - computes correct stats", () => {
  const comments = [
    makeComment({ author: "Alice", localHour: 2 }),
    makeComment({ author: "Alice", localHour: 2 }),
    makeComment({ author: "Bob", localHour: 0, filePath: "other.ts" }),
  ];
  assert.deepEqual(JSON.parse(formatStatsJson(comments)), {
    total: 3,
    busiestHour: { hour: 2, count: 2 },
    topAuthor: { name: "Alice", count: 2 },
    topFile: { path: "src/db/connection.ts", count: 2 },
    hourDistribution: [
      { hour: 0, count: 1 },
      { hour: 2, count: 2 },
    ],
  });
});

test("formatPretty - every card line has the same display width for wide, zero-width and control data", () => {
  const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}";
  const cases: [string, Partial<LateNightComment>][] = [
    ["20 emoji author", { author: "\u{1F600}".repeat(20) }],
    ["20 CJK author", { author: "漢".repeat(20) }],
    ["combining marks", { author: "e\u0301".repeat(40), comment: "cafe\u0301 ".repeat(30) }],
    ["ZWJ sequence", { author: family.repeat(20), filePath: `src/${family.repeat(30)}.ts` }],
    [
      "CJK path and comment",
      { filePath: `src/${"路径".repeat(30)}.ts`, comment: "日本語".repeat(30) },
    ],
    ["tab in comment", { comment: "a\tb\t\tc ".repeat(10) }],
    [
      "ANSI escape in comment",
      { comment: "\x1b[31mred\x1b[0m \x1b[2J\x1b[H \x1b]0;pwned\x07 \x1b[999C alert ".repeat(3) },
    ],
  ];
  for (const [name, overrides] of cases) {
    for (const color of [false, true]) {
      const output = formatPretty(makeComment(overrides), color);
      const lines = output.split("\n");
      const widths = lines.map((l) => stringWidth(l));
      for (const w of widths) assert.equal(w, 55, `${name} (color=${color}):\n${output}`);
      assert.ok(!output.includes("\t"), `${name}: tab leaked`);
      assert.ok(!/\u200D…/.test(output), `${name}: grapheme split by truncation`);
      // biome-ignore lint/suspicious/noControlCharactersInRegex: matches our own SGR styling
      const withoutOurStyles = output.replace(/\x1b\[[0-9;]*m/g, "");
      assert.ok(!withoutOurStyles.includes("\x1b"), `${name}: escape leaked`);
      if (!color) assert.ok(!output.includes("\x1b"), `${name}: escape in plain output`);
    }
  }
});

test("formatPretty - escape sequences in repo data are stripped from the card", () => {
  const output = formatPretty(makeComment({ comment: "\x1b[31mred\x1b[0m alert" }), false);
  assert.ok(output.includes('"red alert"'), output);
});

test("formatStats - escape sequences in author and path are stripped", () => {
  const output = formatStats(
    [makeComment({ author: "\x1b]0;pwned\x07Eve\x1b[2J", filePath: "a\x1b[31m.ts" })],
    false,
  );
  assert.ok(!output.includes("\x1b"), output);
  assert.ok(output.includes("Most prolific night owl: Eve "), output);
  assert.ok(output.includes("Most commented file: a.ts "), output);
});

const BIDI = /[‎‏‪-‮⁦-⁩]/;
const bidiControls = "‪‫‬‭‮⁦⁧⁨⁩‎‏";

test("formatPretty - bidi control characters in repo data are dropped", () => {
  const output = formatPretty(
    makeComment({
      author: `Eve${bidiControls}`,
      filePath: `src/‮exe.txt‬`,
      comment: `ok ⁧admin⁩ ${bidiControls}`,
    }),
    false,
  );
  assert.ok(!BIDI.test(output), JSON.stringify(output));
  assert.ok(output.includes("@Eve "), output);
  assert.ok(output.includes("abc1234 · src/exe.txt "), output);
  assert.ok(output.includes('"ok admin "'), output);
  for (const line of output.split("\n")) assert.equal(stringWidth(line), 55, output);
});

test("formatStats - bidi control characters in author and path are dropped", () => {
  const output = formatStats([makeComment({ author: `‮Eve‬`, filePath: `a⁦.ts⁩` })], false);
  assert.ok(!BIDI.test(output), JSON.stringify(output));
  assert.ok(output.includes("Most prolific night owl: Eve "), output);
  assert.ok(output.includes("Most commented file: a.ts "), output);
});

test("formatPretty - trailing whitespace in header fields is trimmed", () => {
  // Styled spans must end right after the text, not after invisible padding.
  const colored = formatPretty(makeComment({ author: "Eve\t", filePath: "src/a.ts\t \t" }), true);
  assert.ok(colored.includes("@Eve\x1b[0m"), JSON.stringify(colored));
  assert.ok(colored.includes("abc1234 · src/a.ts\x1b[0m"), JSON.stringify(colored));
  // A name that fits once trimmed must not be cut with an ellipsis.
  const fits = "Q".repeat(51 - "2:47 AM · 2023-11-14 · @".length);
  const plain = formatPretty(makeComment({ author: `${fits}\t` }), false);
  assert.ok(plain.includes(`@${fits} │`), plain);
  assert.ok(!plain.includes("…"), plain);
  for (const line of plain.split("\n")) assert.equal(stringWidth(line), 55, plain);
});

test("formatStats - trailing whitespace in author and path is trimmed", () => {
  const output = formatStats([makeComment({ author: "Eve\t", filePath: "a.ts \t" })], false);
  assert.ok(output.includes("Most prolific night owl: Eve (1 comments)"), output);
  assert.ok(output.includes("Most commented file: a.ts (1 comments)"), output);
});
