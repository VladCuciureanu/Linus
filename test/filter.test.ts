import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterByAuthor,
  filterByGrep,
  filterByLength,
  filterByPath,
  isInTimeWindow,
} from "../src/filter.ts";

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

// --- filterByGrep ---

test("filterByGrep - regex match", () => {
  assert.deepEqual(filterByGrep("why does this work", /why/i), true);
  assert.deepEqual(filterByGrep("normal comment", /why/i), false);
});

test("filterByGrep - no pattern passes all", () => {
  assert.deepEqual(filterByGrep("anything", undefined), true);
});

// --- filterByLength ---

test("filterByLength - filters short comments", () => {
  assert.deepEqual(filterByLength("ok", 3), false);
  assert.deepEqual(filterByLength("yes", 3), true);
  assert.deepEqual(filterByLength("a longer comment", 3), true);
});
