'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const source = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8')

assert.ok(/per-machine setup/i.test(source), 'installer should document elevated boundary')
assert.ok(source.includes('$PROGRAMFILES64\\nodejs\\node.exe'), 'Node detection must use Program Files absolute location')
assert.ok(source.includes('$PROGRAMFILES64\\Git') || source.includes('$7\\cmd\\git.exe'), 'Git detection must use Program Files absolute location')
assert.ok(!/cmd\.exe[^\n]*node\s+--version/i.test(source), 'elevated installer must not execute bare node through PATH')
assert.ok(!/cmd\.exe[^\n]*git\s+--version/i.test(source), 'elevated installer must not execute bare git through PATH')
assert.ok(!/ExecToStack[^\n]*(?:node|git)(?:\.exe|\.cmd)?\b/i.test(source), 'toolchain detection must not execute node/git')
assert.ok(source.includes('FileExists'), 'trusted machine toolchain detection should be filesystem based')

console.log('[installer-security] no elevated node/git PATH execution; trusted Program Files detection passed')
