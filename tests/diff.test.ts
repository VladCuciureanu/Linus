import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { parseDiff, getExtension } from "../src/diff.ts";

Deno.test("parseDiff - single file with added lines", () => {
  const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,5 @@
 const x = 1;
+// this is fine
+const y = 2;
 const z = 3;`;

  const result = parseDiff(diff);
  assertEquals(result.length, 2);
  assertEquals(result[0], {
    filePath: "src/index.ts",
    lineNumber: 2,
    content: "// this is fine",
  });
  assertEquals(result[1], {
    filePath: "src/index.ts",
    lineNumber: 3,
    content: "const y = 2;",
  });
});

Deno.test("parseDiff - multiple files", () => {
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
  assertEquals(result.length, 4);
  assertEquals(result[0].filePath, "a.ts");
  assertEquals(result[0].lineNumber, 1);
  assertEquals(result[2].filePath, "b.py");
  assertEquals(result[2].content, "# file b");
});

Deno.test("parseDiff - skips binary files", () => {
  const diff = `diff --git a/image.png b/image.png
Binary files /dev/null and b/image.png differ
diff --git a/code.ts b/code.ts
--- /dev/null
+++ b/code.ts
@@ -0,0 +1 @@
+// real code`;

  const result = parseDiff(diff);
  assertEquals(result.length, 1);
  assertEquals(result[0].filePath, "code.ts");
});

Deno.test("parseDiff - skips deleted files", () => {
  const diff = `diff --git a/old.ts b/old.ts
--- a/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-// gone
-const x = 1;`;

  const result = parseDiff(diff);
  assertEquals(result.length, 0);
});

Deno.test("parseDiff - correct line numbers with mixed hunks", () => {
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
  assertEquals(result.length, 3);
  assertEquals(result[0].lineNumber, 6);
  assertEquals(result[1].lineNumber, 7);
  assertEquals(result[2].lineNumber, 9);
});

Deno.test("getExtension - common cases", () => {
  assertEquals(getExtension("src/foo.ts"), "ts");
  assertEquals(getExtension("bar.py"), "py");
  assertEquals(getExtension("Makefile"), "");
  assertEquals(getExtension("a.b.c.js"), "js");
});
