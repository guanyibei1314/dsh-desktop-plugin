'use strict'
/**
 * Behavior tests for Creator content folders: real (Chinese/Unicode) titles
 * create, list, read and write content, while names Windows cannot round-trip
 * or that could escape the library are still rejected.
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const core = require('../creator-core')
const { withDesktop } = require('./behavior-harness')

const CREATOR_INTERNALS = '{ createContent, listContents, readContent, writeContent, saveState, readState }'

// ---------------------------------------------------------------- id rules
for (const id of [
  '2026-10-12_人形机器人真正落地还缺什么',
  '2026-10-12_AI_工具评测_(第2期)',
  '2026-10-12_Why_#1_matters',
  '2025-01-01 我的旧视频',
  '2026-10-12_家庭👨👩👧故事',
  'Ünïcödé-名前-이름',
  'idea-6f1c3b5e-0d43-4c8e-9a7a-2f1d9c1b2a3e',
]) {
  assert.strictEqual(core.safeId(id), id, `content id must be accepted: ${id}`)
}

for (const [id, why] of [
  ['', 'empty'],
  ['.', 'current directory'],
  ['..', 'parent directory'],
  ['../escape', 'traversal'],
  ['a/b', 'POSIX separator'],
  ['a\\b', 'Windows separator'],
  ['C:evil', 'drive-relative path'],
  ['name:stream', 'NTFS alternate data stream'],
  ['CON', 'reserved device name'],
  ['nul.txt', 'reserved device name with extension'],
  ['com1', 'reserved device name'],
  ['LPT9.md', 'reserved device name'],
  ['trail.', 'trailing dot Windows strips'],
  ['a<b', 'wildcard/redirection character'],
  ['a|b', 'pipe'],
  ['a?b', 'wildcard'],
  ['a*b', 'wildcard'],
  ['a"b', 'quote'],
  ['a‮b', 'bidi override'],
  ['a​b', 'zero-width character'],
  ['a\u0007b', 'control character'],
  ['a b', 'line separator'],
  ['\uD800x', 'unpaired surrogate'],
]) {
  assert.strictEqual(core.safeId(id), '', `content id must be rejected (${why}): ${JSON.stringify(id)}`)
}

// ---------------------------------------------------------------- titles
assert.strictEqual(core.sanitizeTitle('  人形机器人真正落地还缺什么  '), '人形机器人真正落地还缺什么')
assert.strictEqual(core.sanitizeTitle('Hello: World?'), 'Hello World')
assert.strictEqual(core.sanitizeTitle('a‮evil'), 'aevil', 'bidi overrides must not reach folder names')
assert.strictEqual(core.sanitizeTitle('家庭👨‍👩‍👧故事'), '家庭👨👩👧故事', 'zero-width joiners are dropped, emoji kept')
const longTitle = core.sanitizeTitle(`${'字'.repeat(79)}😀尾巴`)
assert.strictEqual(Array.from(longTitle).length, 80, 'titles are bounded by code points')
assert.ok(longTitle.endsWith('😀'), 'truncation must not split an emoji into a lone surrogate')
assert.strictEqual(core.sanitizeTitle('标题. . .'), '标题', 'trailing dots/spaces are trimmed')
assert.throws(() => core.sanitizeTitle('***'), /标题不能为空/)
assert.throws(() => core.sanitizeTitle('​​'), /标题不能为空/)

// ---------------------------------------------------------------- Creator host
;(async () => {
  await withDesktop({}, async (h) => {
    const creator = h.loadWithInternals('creator-main.js', CREATOR_INTERNALS)
    const library = path.join(h.temp, 'library')
    fs.mkdirSync(library)
    const legacy = path.join(library, '2025-01-01 我的旧视频')
    fs.mkdirSync(legacy)
    fs.writeFileSync(path.join(legacy, 'topic.md'), '# 旧视频标题\n', 'utf8')
    fs.writeFileSync(path.join(library, 'notes.txt'), 'not a content folder', 'utf8')
    let linked = false
    try {
      fs.symlinkSync(legacy, path.join(library, 'linked-content'), 'junction')
      linked = true
    } catch (_) {
      // Symlink/junction creation may be unavailable; the containment rule is covered above.
    }

    creator.saveState({
      libraryRoot: library,
      ideas: [{ id: 'idea-1', title: '人形机器人真正落地还缺什么', status: 'open' }],
    })

    const created = creator.createContent('人形机器人真正落地还缺什么', 'idea-1')
    assert.match(created.id, /^\d{4}-\d{2}-\d{2}_人形机器人真正落地还缺什么$/, 'Chinese title must become a dated content folder')
    assert.ok(fs.statSync(path.join(library, created.id)).isDirectory())
    assert.ok(fs.readFileSync(path.join(library, created.id, 'topic.md'), 'utf8').startsWith('# 人形机器人真正落地还缺什么\n'))
    assert.ok(fs.existsSync(path.join(library, created.id, 'script.md')))
    const idea = creator.readState().ideas.find((item) => item.id === 'idea-1')
    assert.strictEqual(idea.status, 'promoted', 'promoting a Chinese idea must succeed')
    assert.strictEqual(idea.contentId, created.id)

    const duplicate = creator.createContent('人形机器人真正落地还缺什么')
    assert.strictEqual(duplicate.id, `${created.id}_2`, 'same title on the same day gets a numbered folder')
    const mixed = creator.createContent('AI 工具评测 (第2期)')
    assert.match(mixed.id, /^\d{4}-\d{2}-\d{2}_AI_工具评测_\(第2期\)$/)
    assert.throws(() => creator.createContent('***'), /标题不能为空/)

    const listed = new Map(creator.listContents().map((item) => [item.id, item]))
    for (const id of [created.id, duplicate.id, mixed.id, '2025-01-01 我的旧视频']) {
      assert.ok(listed.has(id), `content list must include ${id}`)
    }
    assert.strictEqual(listed.get('2025-01-01 我的旧视频').title, '旧视频标题', 'existing Chinese folders are listed with their topic title')
    assert.ok(!listed.has('notes.txt'), 'files are not content items')
    if (linked) assert.ok(!listed.has('linked-content'), 'linked folders are not content items')

    const written = creator.writeContent(created.id, 'script', '# 脚本\n\n## 开头\n真正的问题是成本。\n')
    assert.strictEqual(written.script, '# 脚本\n\n## 开头\n真正的问题是成本。\n')
    assert.strictEqual(creator.readContent(created.id).script, written.script)

    for (const id of ['../escape', 'C:evil', 'a‮b', 'CON']) {
      assert.throws(() => creator.readContent(id), /内容 ID 无效/, `readContent must reject ${JSON.stringify(id)}`)
    }
    if (linked) assert.throws(() => creator.readContent('linked-content'), /真实本地文件夹/)
  })
  console.log('[creator-content] Unicode/Chinese titles create, list, read and write content; unsafe folder names stay rejected')
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error)
  process.exit(1)
})
