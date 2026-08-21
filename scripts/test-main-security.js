'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')

assert.ok(source.includes("const EXPLICIT_HARNESS_URL = (process.env.DSH_URL || ARG_URL || '')"), 'external Harness reuse must require explicit opt-in')
assert.ok(!/probeUrl\([^\n]*127\.0\.0\.1:3080/.test(source), 'default startup must not probe/trust fixed 3080')
assert.ok(!source.includes("|| 'http://127.0.0.1:3080'"), 'fixed 3080 must not be an implicit trust target')
assert.ok(source.includes("dshProc !== child || child.exitCode !== null"), 'random-port readiness must remain bound to launched child lifetime')
assert.ok(source.includes("partition: 'persist:dsh-main'"), 'main remote window must use dedicated session partition')
assert.ok(source.includes('setPermissionRequestHandler'), 'main session must explicitly handle permission requests')
assert.ok(source.includes('setPermissionCheckHandler'), 'main session must explicitly handle permission checks')
assert.ok(/setPermissionRequestHandler\([^\n]*callback\(false\)/.test(source), 'main permission requests must default deny')
assert.ok(/setPermissionCheckHandler\(\(\) => false\)/.test(source), 'main permission checks must default deny')
assert.ok(source.includes("win.webContents.on('will-navigate', enforceMainOrigin)"), 'main navigation must be origin restricted')
assert.ok(source.includes("win.webContents.on('will-redirect', enforceMainOrigin)"), 'main redirects must be origin restricted')
assert.ok(source.includes('sameOrigin(url, activeUrl)'), 'main navigation policy must compare exact origins')
assert.ok(!source.includes("url.startsWith(activeUrl)"), 'privileged sender checks must not use URL-prefix trust')
assert.ok(source.includes('MAX_SSE_BUFFER_BYTES'), 'SSE host stream must have bounded buffering')
assert.ok(source.includes("readJsonLimited(res, MAX_RPC_BYTES"), 'RPC responses must use streaming byte limits')

console.log('[main-security] owned random Runtime, deny-by-default permissions, origin navigation and bounded remote data passed')
