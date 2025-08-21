import type { AddedLine } from "./types.ts";

/**
 * Parse unified diff text and extract only added lines with their
 * file paths and new-file line numbers.
 */
export function parseDiff(diffText: string): AddedLine[] {
  const lines = diffText.split("\n");
  const result: AddedLine[] = [];
  let currentFile: string | null = null;
  let newLineNum = 0;

  for (const line of lines) {
    // New file header: "diff --git a/foo b/foo"
    if (line.startsWith("diff --git ")) {
      currentFile = null; // reset until we see +++
      continue;
    }

    // Binary file — skip entirely
    if (line.startsWith("Binary files ")) {
      currentFile = null;
      continue;
    }

    // New file target: "+++ b/src/foo.ts"
    if (line.startsWith("+++ ")) {
      const path = line.slice(4);
      // "+++ /dev/null" means file was deleted
      if (path === "/dev/null") {
        currentFile = null;
      } else {
        // Strip leading "b/" prefix
        currentFile = path.startsWith("b/") ? path.slice(2) : path;
      }
      continue;
    }

    // Hunk header: "@@ -old,count +new,count @@"
    if (line.startsWith("@@ ")) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        newLineNum = parseInt(match[1], 10);
      }
      continue;
    }

    if (currentFile === null) continue;

    if (line.startsWith("+")) {
      // Added line (strip the leading "+")
      result.push({
        filePath: currentFile,
        lineNumber: newLineNum,
        content: line.slice(1),
      });
      newLineNum++;
    } else if (line.startsWith("-")) {
      // Removed line — doesn't affect new line numbering
    } else {
      // Context line (or " " prefixed) — advances new line counter
      newLineNum++;
    }
  }

  return result;
}

/** Get the file extension (without dot) from a file path. */
export function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filePath.length - 1) return "";
  return filePath.slice(lastDot + 1).toLowerCase();
}
