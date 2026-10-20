import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAuthorDate,
  isInTimeWindow,
  filterByAuthor,
  filterByPath,
  filterByGrep,
  filterByLength,
} from "../src/filter.ts";

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
  const meta = { hash: "", author: "John Doe", authorEmail: "john@example.com", dateIso: "", localDate: "", localHour: 0, localMinute: 0, date: new Date() };
  assert.deepEqual(filterByAuthor(meta, "john"), true);
  assert.deepEqual(filterByAuthor(meta, "Jane"), false);
});

test("filterByAuthor - matches email substring", () => {
  const meta = { hash: "", author: "John", authorEmail: "john@example.com", dateIso: "", localDate: "", localHour: 0, localMinute: 0, date: new Date() };
  assert.deepEqual(filterByAuthor(meta, "example.com"), true);
});

test("filterByAuthor - no filter passes all", () => {
  const meta = { hash: "", author: "Anyone", authorEmail: "", dateIso: "", localDate: "", localHour: 0, localMinute: 0, date: new Date() };
  assert.deepEqual(filterByAuthor(meta, undefined), true);
});

// --- filterByPath ---

test("filterByPath - glob matching", () => {
  assert.deepEqual(filterByPath("src/foo.ts", "src/*.ts"), true);
  assert.deepEqual(filterByPath("lib/foo.ts", "src/*.ts"), false);
  assert.deepEqual(filterByPath("src/deep/bar.ts", "src/*"), true);
  assert.deepEqual(filterByPath("anything.js", "*.js"), true);
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
