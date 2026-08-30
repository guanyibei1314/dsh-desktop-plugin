'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const core = require('../creator-core')

const root = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const bootstrap = read('bootstrap.js')
const mode = read('desktop-mode.js')
const host = read('creator-main.js')
const preload = read('creator-preload.js')
const html = read('creator.html')
const pkg = JSON.parse(read('package.json'))

assert.strictEqual(pkg.version, '0.10.0', 'dual-mode release must be versioned as 0.10.0')
for (const file of ['desktop-mode.js', 'creator-core.js', 'creator-main.js', 'creator-preload.js', 'creator.html', 'creator.js', 'creator.css']) {
  assert.ok(pkg.build.files.includes(file), `${file} must be packaged`)
}
assert.ok(pkg.scripts['smoke:creator'], 'Creator mode must have an explicit smoke entrypoint')

assert.ok(bootstrap.includes("desktopMode.getMode() === desktopMode.MODE_CREATOR"), 'bootstrap must select Creator without replacing the shared runtime')
assert.ok(bootstrap.includes("require('./creator-main.js')"), 'Creator host must be loaded only through bootstrap mode selection')
assert.ok(bootstrap.includes("require('./main.js')"), 'Standard host must remain available')

assert.ok(mode.includes("const MODE_STANDARD = 'standard'"), 'standard mode constant missing')
assert.ok(mode.includes("const MODE_CREATOR = 'creator'"), 'creator mode constant missing')
assert.ok(mode.includes("desktopMode: normalized"), 'mode selection must be persisted explicitly')
assert.ok(mode.includes('app.relaunch'), 'mode switching must rebuild the shell instead of mixing both UIs in one renderer')
assert.ok(mode.includes("label: '标准模式'"), 'standard mode menu item missing')
assert.ok(mode.includes("label: 'Creator 模式'"), 'Creator mode menu item missing')

assert.ok(host.includes("listen(0, '127.0.0.1'"), 'Creator Harness must use a random loopback port')
assert.ok(!host.includes("|| 'http://127.0.0.1:3080'"), 'Creator must not implicitly trust fixed port 3080')
assert.ok(host.includes('session.setPermissionRequestHandler'), 'Creator shell must deny permission requests')
assert.ok(host.includes('session.setPermissionCheckHandler'), 'Creator shell must deny permission checks')
assert.ok(host.includes('requireCreatorSender(event)'), 'Creator IPC must authorize the exact local renderer')
assert.ok(host.includes('resolveContentDir(root, id)'), 'Creator content operations must use contained-path validation')
assert.ok(host.includes("resolveEditableFile(root, id, 'topic.md')"), 'topic editor must use allowlisted path validation')
assert.ok(host.includes("resolveEditableFile(root, id, 'script.md')"), 'script editor must use allowlisted path validation')
assert.ok(host.includes('entry.isSymbolicLink()'), 'Creator catalog must refuse symlink content directories')
assert.ok(host.includes("partition: 'persist:dsh-creator-shell'"), 'Creator shell must have a dedicated session partition')

assert.ok(preload.includes("contextBridge.exposeInMainWorld('creatorBridge'"), 'Creator must use a narrow contextBridge API')
assert.ok(!preload.includes("exposeInMainWorld('ipcRenderer'"), 'raw ipcRenderer must never be exposed')
assert.ok(!preload.includes('sendSync('), 'Creator preload must not expose synchronous arbitrary IPC')
assert.ok(/Content-Security-Policy/.test(html), 'Creator local page must define a CSP')
assert.ok(/object-src 'none'/.test(html), 'Creator CSP must disable object embedding')
assert.ok(/frame-src http:\/\/127\.0\.0\.1:\*/.test(html), 'Creator may frame only the owned loopback DSH service')

assert.strictEqual(core.sanitizeTitle('  Hello: World?  '), 'Hello World', 'Windows-invalid title characters must be removed and whitespace normalized')
assert.throws(() => core.sanitizeTitle('***'), /标题不能为空/, 'empty sanitized title must fail')
assert.strictEqual(core.safeId('../escape'), '', 'path traversal ids must be rejected')
assert.strictEqual(core.safeId('2026-08-30_project'), '2026-08-30_project')
const normalized = core.normalizeState({
  libraryRoot: ' C:/Creator ',
  ideas: [{ id: '../bad', title: 'Idea', tags: ['AI', 'AI', '机器人'] }],
  goals: [{ title: 'Ship', target: '8', current: '2' }],
  contentMeta: { '../escape': { published: true }, safe_id: { published: true } },
})
assert.strictEqual(normalized.schema, 1)
assert.strictEqual(normalized.ideas.length, 1)
assert.deepStrictEqual(normalized.ideas[0].tags, ['AI', '机器人'])
assert.strictEqual(normalized.goals[0].target, 8)
assert.ok(!normalized.contentMeta['../escape'])
assert.strictEqual(normalized.contentMeta.safe_id.published, true)

assert.strictEqual(core.inferStage({ script: false, video: false, cover: false }, {}), '选题')
assert.strictEqual(core.inferStage({ script: true, video: false, cover: false }, {}), '脚本')
assert.strictEqual(core.inferStage({ script: true, video: true, cover: true }, {}), '待发布')
assert.strictEqual(core.inferStage({ script: true, video: true, cover: true }, { published: true }), '已发布')

console.log('[dual-mode] Standard/Creator selection, local-first state, IPC isolation and content path boundaries passed')
