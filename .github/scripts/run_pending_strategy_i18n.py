from pathlib import Path

source_path = Path(".github/workflows/dev-strategy-i18n-once.yml")
source = source_path.read_text()
start_marker = "      - name: Localize dashboard strategy\n        shell: python\n        run: |\n"
end_marker = "\n      - name: Validate transformed source\n"
if source.count(start_marker) != 1 or source.count(end_marker) != 1:
    raise SystemExit("Could not locate the pending strategy-i18n transform")

body = source.split(start_marker, 1)[1].split(end_marker, 1)[0]
lines = []
in_triple = False
for line in body.splitlines():
    triple_count = line.count("'''")
    if in_triple:
        # These are contents of Python triple-quoted JS anchors/replacements.
        # Preserve their indentation byte-for-byte; it is part of the guarded
        # source match and was the reason the temporary YAML wrapper was invalid.
        lines.append(line)
        if triple_count % 2:
            in_triple = False
        continue

    if line.startswith(" " * 10):
        line = line[10:]
    lines.append(line)
    if triple_count % 2:
        in_triple = True

code = "\n".join(lines) + "\n"
compile(code, "<pending-strategy-i18n>", "exec")
exec(code, {"__name__": "__main__"})
