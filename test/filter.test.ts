import assert from "node:assert/strict";
import { test } from "node:test";
import { filterByAuthor, filterByPath, filterComment, isInTimeWindow } from "../src/filter.ts";
import type { LateNightComment } from "../src/types.ts";

// --- isInTimeWindow ---

test("isInTimeWindow - inside default 00:00-04:00", () => {
  assert.deepEqual(isInTimeWindow(2, 30, { hour: 0, minute: 0 }, { hour: 4, minute: 0 }), true);
});

test("isInTimeWindow - at start boundary (inclusive)", () => {
  assert.deepEqual(isInTimeWindow(0, 0, { hour: 0, minute: 0 }, { hour: 4, minute: 0 }), true);
});

test("isInTimeWindow - at end boundary (exclusive)", () => {
  assert.deepEqual(isInTimeWindow(4, 0, { hour: 0, minute: 0 }, { hour: 4, minute: 0 }), false);
});

test("isInTimeWindow - outside window", () => {
  assert.deepEqual(isInTimeWindow(12, 0, { hour: 0, minute: 0 }, { hour: 4, minute: 0 }), false);
});

test("isInTimeWindow - wrapping window 22:00-06:00", () => {
  assert.deepEqual(isInTimeWindow(23, 0, { hour: 22, minute: 0 }, { hour: 6, minute: 0 }), true);
  assert.deepEqual(isInTimeWindow(3, 0, { hour: 22, minute: 0 }, { hour: 6, minute: 0 }), true);
  assert.deepEqual(isInTimeWindow(12, 0, { hour: 22, minute: 0 }, { hour: 6, minute: 0 }), false);
});

// --- filterByAuthor ---

test("filterByAuthor - matches name substring", () => {
  const meta = {
    hash: "",
    author: "John Doe",
    authorEmail: "john@example.com",
    localDate: "",
    localHour: 0,
    localMinute: 0,
    date: new Date(),
  };
  assert.deepEqual(filterByAuthor(meta, "john"), true);
  assert.deepEqual(filterByAuthor(meta, "Jane"), false);
});

test("filterByAuthor - matches email substring", () => {
  const meta = {
    hash: "",
    author: "John",
    authorEmail: "john@example.com",
    localDate: "",
    localHour: 0,
    localMinute: 0,
    date: new Date(),
  };
  assert.deepEqual(filterByAuthor(meta, "example.com"), true);
});

test("filterByAuthor - no filter passes all", () => {
  const meta = {
    hash: "",
    author: "Anyone",
    authorEmail: "",
    localDate: "",
    localHour: 0,
    localMinute: 0,
    date: new Date(),
  };
  assert.deepEqual(filterByAuthor(meta, undefined), true);
});

// --- filterByPath ---

test("filterByPath - glob matching", () => {
  assert.deepEqual(filterByPath("src/foo.ts", "src/*.ts"), true);
  assert.deepEqual(filterByPath("lib/foo.ts", "src/*.ts"), false);
  assert.deepEqual(filterByPath("anything.js", "*.js"), true);
});

test("filterByPath - * does not cross directories", () => {
  assert.deepEqual(filterByPath("src/deep/bar.ts", "src/*"), false);
  assert.deepEqual(filterByPath("src/deep/bar.ts", "*.ts"), false);
});

test("filterByPath - ** spans directories", () => {
  assert.deepEqual(filterByPath("src/deep/bar.ts", "src/**"), true);
  assert.deepEqual(filterByPath("src/deep/bar.ts", "**/*.ts"), true);
  assert.deepEqual(filterByPath("bar.ts", "**/*.ts"), true);
  assert.deepEqual(filterByPath("src/deep/bar.js", "**/*.ts"), false);
});

test("filterByPath - ? matches one character within a segment", () => {
  assert.deepEqual(filterByPath("src/a.ts", "src/?.ts"), true);
  assert.deepEqual(filterByPath("src/ab.ts", "src/?.ts"), false);
  assert.deepEqual(filterByPath("src/a.ts", "src?a.ts"), false);
});

test("filterByPath - no glob passes all", () => {
  assert.deepEqual(filterByPath("any/file.ts", undefined), true);
});

// --- filterComment ---

function passes(comment: string, opts: { grep?: RegExp; minLength?: number; pathGlob?: string }) {
  const lnc = { comment, filePath: "src/foo.ts" } as LateNightComment;
  return filterComment(lnc, { minLength: 0, ...opts });
}

test("filterComment - grep regex match", () => {
  assert.deepEqual(passes("why does this work", { grep: /why/i }), true);
  assert.deepEqual(passes("normal comment", { grep: /why/i }), false);
});

test("filterComment - no grep pattern passes all", () => {
  assert.deepEqual(passes("anything", {}), true);
});

test("filterComment - filters short comments", () => {
  assert.deepEqual(passes("ok", { minLength: 3 }), false);
  assert.deepEqual(passes("yes", { minLength: 3 }), true);
  assert.deepEqual(passes("a longer comment", { minLength: 3 }), true);
});

test("filterComment - applies the path glob", () => {
  assert.deepEqual(passes("comment", { pathGlob: "src/*.ts" }), true);
  assert.deepEqual(passes("comment", { pathGlob: "lib/*.ts" }), false);
});
