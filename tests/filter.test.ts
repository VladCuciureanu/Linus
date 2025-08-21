import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import {
  parseAuthorDate,
  isInTimeWindow,
  filterByAuthor,
  filterByPath,
  filterByGrep,
  filterByLength,
} from "../src/filter.ts";

// --- parseAuthorDate ---

Deno.test("parseAuthorDate - extracts local hour and minute", () => {
  const result = parseAuthorDate("2023-11-14T02:47:13+05:30");
  assertEquals(result.localHour, 2);
  assertEquals(result.localMinute, 47);
});

Deno.test("parseAuthorDate - negative timezone offset", () => {
  const result = parseAuthorDate("2023-06-01T23:15:00-08:00");
  assertEquals(result.localHour, 23);
  assertEquals(result.localMinute, 15);
});

Deno.test("parseAuthorDate - midnight", () => {
  const result = parseAuthorDate("2023-01-01T00:00:00+00:00");
  assertEquals(result.localHour, 0);
  assertEquals(result.localMinute, 0);
});

// --- isInTimeWindow ---

Deno.test("isInTimeWindow - inside default 00:00-04:00", () => {
  assertEquals(isInTimeWindow(2, 30, { hour: 0, minute: 0 }, { hour: 4, minute: 0 }), true);
});

Deno.test("isInTimeWindow - at start boundary (inclusive)", () => {
  assertEquals(isInTimeWindow(0, 0, { hour: 0, minute: 0 }, { hour: 4, minute: 0 }), true);
});

Deno.test("isInTimeWindow - at end boundary (exclusive)", () => {
  assertEquals(isInTimeWindow(4, 0, { hour: 0, minute: 0 }, { hour: 4, minute: 0 }), false);
});

Deno.test("isInTimeWindow - outside window", () => {
  assertEquals(isInTimeWindow(12, 0, { hour: 0, minute: 0 }, { hour: 4, minute: 0 }), false);
});

Deno.test("isInTimeWindow - wrapping window 22:00-06:00", () => {
  assertEquals(isInTimeWindow(23, 0, { hour: 22, minute: 0 }, { hour: 6, minute: 0 }), true);
  assertEquals(isInTimeWindow(3, 0, { hour: 22, minute: 0 }, { hour: 6, minute: 0 }), true);
  assertEquals(isInTimeWindow(12, 0, { hour: 22, minute: 0 }, { hour: 6, minute: 0 }), false);
});

// --- filterByAuthor ---

Deno.test("filterByAuthor - matches name substring", () => {
  const meta = { hash: "", author: "John Doe", authorEmail: "john@example.com", dateIso: "", localHour: 0, localMinute: 0, date: new Date() };
  assertEquals(filterByAuthor(meta, "john"), true);
  assertEquals(filterByAuthor(meta, "Jane"), false);
});

Deno.test("filterByAuthor - matches email substring", () => {
  const meta = { hash: "", author: "John", authorEmail: "john@example.com", dateIso: "", localHour: 0, localMinute: 0, date: new Date() };
  assertEquals(filterByAuthor(meta, "example.com"), true);
});

Deno.test("filterByAuthor - no filter passes all", () => {
  const meta = { hash: "", author: "Anyone", authorEmail: "", dateIso: "", localHour: 0, localMinute: 0, date: new Date() };
  assertEquals(filterByAuthor(meta, undefined), true);
});

// --- filterByPath ---

Deno.test("filterByPath - glob matching", () => {
  assertEquals(filterByPath("src/foo.ts", "src/*.ts"), true);
  assertEquals(filterByPath("lib/foo.ts", "src/*.ts"), false);
  assertEquals(filterByPath("src/deep/bar.ts", "src/*"), true);
  assertEquals(filterByPath("anything.js", "*.js"), true);
});

Deno.test("filterByPath - no glob passes all", () => {
  assertEquals(filterByPath("any/file.ts", undefined), true);
});

// --- filterByGrep ---

Deno.test("filterByGrep - regex match", () => {
  assertEquals(filterByGrep("why does this work", /why/i), true);
  assertEquals(filterByGrep("normal comment", /why/i), false);
});

Deno.test("filterByGrep - no pattern passes all", () => {
  assertEquals(filterByGrep("anything", undefined), true);
});

// --- filterByLength ---

Deno.test("filterByLength - filters short comments", () => {
  assertEquals(filterByLength("ok", 3), false);
  assertEquals(filterByLength("yes", 3), true);
  assertEquals(filterByLength("a longer comment", 3), true);
});
