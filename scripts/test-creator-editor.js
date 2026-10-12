'use strict'
/**
 * Behavior tests for the Creator topic/script editor state that creator.js
 * uses: edits in one tab survive switching tabs and saving from the other, a
 * failed write keeps the unsaved draft, and the page loads the module first.
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const EditorState = require('../creator-editor-state')

const root = path.join(__dirname, '..')

function fakeStore(initial, failOn = '') {
  const disk = Object.assign({}, initial)
  const writes = []
  return {
    disk,
    writes,
    async write(id, field, text) {
      writes.push([id, field, text])
      if (field === failOn) throw new Error(`disk full while writing ${field}`)
      disk[field] = text
      return { id, topic: disk.topic, script: disk.script }
    },
  }
}

;(async () => {
  // Edit topic, switch to script, edit, save: both edits must reach disk.
  {
    const store = fakeStore({ topic: '# T0', script: '# S0' })
    const editing = EditorState.open({ id: '2026-10-12_人形机器人', path: 'C:/library/x', topic: '# T0', script: '# S0' })
    assert.strictEqual(editing.tab, 'topic')
    assert.strictEqual(EditorState.switchTab(editing, '# T1 新角度', 'script'), '# S0')
    assert.deepStrictEqual(EditorState.dirtyFields(editing, '# S1 新脚本'), ['topic', 'script'])
    const written = await EditorState.saveDirty(editing, '# S1 新脚本', store.write)
    assert.deepStrictEqual(written, ['topic', 'script'], 'saving from the script tab must also save the edited topic')
    assert.deepStrictEqual(store.disk, { topic: '# T1 新角度', script: '# S1 新脚本' })
    assert.deepStrictEqual(EditorState.dirtyFields(editing, '# S1 新脚本'), [])
    assert.strictEqual(EditorState.switchTab(editing, '# S1 新脚本', 'topic'), '# T1 新角度', 'the topic tab shows what was saved, not the old file')
  }

  // Nothing changed: no writes.
  {
    const store = fakeStore({ topic: 'a', script: 'b' })
    const editing = EditorState.open({ id: 'x', topic: 'a', script: 'b' })
    assert.deepStrictEqual(await EditorState.saveDirty(editing, 'a', store.write), [])
    assert.strictEqual(store.writes.length, 0)
  }

  // A failed write keeps the unsaved draft; fields written before it stay saved.
  {
    const store = fakeStore({ topic: 'a', script: 'b' }, 'script')
    const editing = EditorState.open({ id: 'x', topic: 'a', script: 'b' })
    EditorState.switchTab(editing, 'a2', 'script')
    await assert.rejects(EditorState.saveDirty(editing, 'b2', store.write), /disk full/)
    assert.strictEqual(store.disk.topic, 'a2')
    assert.deepStrictEqual(EditorState.dirtyFields(editing), ['script'], 'the script edit is still pending, not lost')
    assert.strictEqual(editing.draft.script, 'b2')
  }

  // Closing logic relies on dirtyFields including the visible textarea.
  {
    const editing = EditorState.open({ id: 'x', topic: 'a', script: 'b' })
    assert.deepStrictEqual(EditorState.dirtyFields(editing, 'a'), [])
    assert.deepStrictEqual(EditorState.dirtyFields(editing, 'a + typing'), ['topic'])
    assert.throws(() => EditorState.switchTab(editing, 'a', 'notes'), /unknown editor tab/)
  }

  // The page must load the state module before creator.js, and ship it.
  {
    const html = fs.readFileSync(path.join(root, 'creator.html'), 'utf8')
    const scripts = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g), (match) => match[1])
    assert.deepStrictEqual(scripts, ['creator-editor-state.js', 'creator.js'])
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    assert.ok(pkg.build.files.includes('creator-editor-state.js'), 'creator-editor-state.js must be packaged')
  }

  console.log('[creator-editor] edits survive tab switches and failed saves; every modified tab is written')
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error)
  process.exit(1)
})
