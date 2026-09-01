import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const languages = ["de", "en", "fr", "it", "es", "pt", "nl", "da", "nb", "sv", "fi", "pl", "cs", "sk", "hu", "ro", "sl", "hr"];

const inspect = spawnSync("python3", ["-c", String.raw`
import ast, json, re
from pathlib import Path
source = Path("custom_components/e_c3_dashboard/i18n.py").read_text()
tree = ast.parse(source)
messages = None
for node in tree.body:
    if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == "_MESSAGES":
        messages = ast.literal_eval(node.value)
        break
if messages is None:
    raise SystemExit("_MESSAGES not found")
def placeholders(text):
    return sorted(re.findall(r"\{([a-zA-Z0-9_]+)\}", text))
print(json.dumps({
    "languages": list(messages),
    "keys": {lang: sorted(data) for lang, data in messages.items()},
    "placeholders": {lang: {key: placeholders(value) for key, value in data.items()} for lang, data in messages.items()},
}))
`], { encoding: "utf8" });

assert.equal(inspect.status, 0, inspect.stderr);
const data = JSON.parse(inspect.stdout);

test("server messages cover the planned 18-language matrix", () => {
  assert.deepEqual(data.languages, languages);
  const canonical = data.keys.en;
  for (const language of languages) assert.deepEqual(data.keys[language], canonical, `${language} server message key mismatch`);
});

test("server translations preserve every format placeholder", () => {
  const canonical = data.placeholders.en;
  for (const language of languages) {
    for (const key of Object.keys(canonical)) {
      assert.deepEqual(data.placeholders[language][key], canonical[key], `${language}/${key} placeholder mismatch`);
    }
  }
});
