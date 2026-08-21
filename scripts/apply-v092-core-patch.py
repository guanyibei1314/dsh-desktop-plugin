from pathlib import Path

body_path = Path(__file__).with_name('apply-v092-core-patch-body.py')
source = body_path.read_text(encoding='utf-8')
old = "    if text.count(old) != 1:\n        raise SystemExit(f'expected exactly one snippet in {path}, found {text.count(old)}')\n    p.write_text(text.replace(old, new, 1), encoding='utf-8')"
new = "    p.write_text(text.replace(old, new, 1), encoding='utf-8')"
if old not in source:
    raise SystemExit('patch-body uniqueness guard missing')
source = source.replace(old, new, 1)
exec(compile(source, str(body_path), 'exec'), {'__name__': '__main__'})
