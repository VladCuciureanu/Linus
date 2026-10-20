import assert from "node:assert/strict";
import { test } from "node:test";
import { getExtension, parseDiff } from "../src/diff.ts";

test("parseDiff - single file with added lines", () => {
  const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,5 @@
 const x = 1;
+// this is fine
+const y = 2;
 const z = 3;`;

  const result = parseDiff(diff);
  assert.deepEqual(result.length, 2);
  assert.deepEqual(result[0], {
    filePath: "src/index.ts",
    lineNumber: 2,
    content: "// this is fine",
  });
  assert.deepEqual(result[1], {
    filePath: "src/index.ts",
    lineNumber: 3,
    content: "const y = 2;",
  });
});

test("parseDiff - multiple files", () => {
  const diff = `diff --git a/a.ts b/a.ts
--- /dev/null
+++ b/a.ts
@@ -0,0 +1,2 @@
+// file a
+const a = 1;
diff --git a/b.py b/b.py
--- /dev/null
+++ b/b.py
@@ -0,0 +1,2 @@
+# file b
+b = 1`;

  const result = parseDiff(diff);
  assert.deepEqual(result.length, 4);
  assert.deepEqual(result[0].filePath, "a.ts");
  assert.deepEqual(result[0].lineNumber, 1);
  assert.deepEqual(result[2].filePath, "b.py");
  assert.deepEqual(result[2].content, "# file b");
});

test("parseDiff - skips binary files", () => {
  const diff = `diff --git a/image.png b/image.png
Binary files /dev/null and b/image.png differ
diff --git a/code.ts b/code.ts
--- /dev/null
+++ b/code.ts
@@ -0,0 +1 @@
+// real code`;

  const result = parseDiff(diff);
  assert.deepEqual(result.length, 1);
  assert.deepEqual(result[0].filePath, "code.ts");
});

test("parseDiff - skips deleted files", () => {
  const diff = `diff --git a/old.ts b/old.ts
--- a/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-// gone
-const x = 1;`;

  const result = parseDiff(diff);
  assert.deepEqual(result.length, 0);
});

test("parseDiff - correct line numbers with mixed hunks", () => {
  const diff = `diff --git a/f.ts b/f.ts
--- a/f.ts
+++ b/f.ts
@@ -5,4 +5,6 @@
 line5
-removed
+added1
+added2
 line7
+added3`;

  const result = parseDiff(diff);
  assert.deepEqual(result.length, 3);
  assert.deepEqual(result[0].lineNumber, 6);
  assert.deepEqual(result[1].lineNumber, 7);
  assert.deepEqual(result[2].lineNumber, 9);
});

test("getExtension - common cases", () => {
  assert.deepEqual(getExtension("src/foo.ts"), "ts");
  assert.deepEqual(getExtension("bar.py"), "py");
  assert.deepEqual(getExtension("Makefile"), "");
  assert.deepEqual(getExtension("a.b.c.js"), "js");
});
