import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const patch = fs.readFileSync(
  new URL("../internal/patches/0.5.53_trip_continuity.patch", import.meta.url),
  "utf8",
);

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

test("prepared 0.5.53 patch has syntactically complete unified-diff hunks", () => {
  const lines = patch.split("\n");
  let index = 0;
  let hunks = 0;

  while (index < lines.length) {
    if (!lines[index].startsWith("@@")) {
      index += 1;
      continue;
    }

    const match = lines[index].match(HUNK);
    assert.ok(match, `invalid unified-diff hunk header: ${lines[index]}`);
    hunks += 1;

    const expectedOld = Number(match[2] ?? 1);
    const expectedNew = Number(match[4] ?? 1);
    let oldCount = 0;
    let newCount = 0;
    index += 1;

    while (
      index < lines.length
      && !lines[index].startsWith("@@")
      && !lines[index].startsWith("diff --git ")
    ) {
      const line = lines[index];
      if (line.startsWith(" ")) {
        oldCount += 1;
        newCount += 1;
      } else if (line.startsWith("-")) {
        oldCount += 1;
      } else if (line.startsWith("+")) {
        newCount += 1;
      } else if (line !== "" && !line.startsWith("\\ No newline")) {
        assert.fail(`unexpected line inside unified-diff hunk: ${line}`);
      }
      index += 1;
    }

    assert.equal(oldCount, expectedOld, `old-line count mismatch for ${match[0]}`);
    assert.equal(newCount, expectedNew, `new-line count mismatch for ${match[0]}`);
  }

  assert.ok(hunks > 0, "prepared patch must contain at least one hunk");
});
