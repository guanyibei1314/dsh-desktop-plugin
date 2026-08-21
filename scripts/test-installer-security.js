'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const source = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8')

assert.ok(/elevated per-machine setup/i.test(source), 'installer should document elevated boundary')
assert.ok(/StrCpy\s+\$6\s+"\$PROGRAMFILES64\\nodejs"/i.test(source), 'Node root must be derived from 64-bit Program Files')
assert.ok(/FileExists\}\s+"\$6\\node\.exe"/i.test(source), 'Node detection must check the trusted absolute root')
assert.ok(/FileExists\}\s+"\$6\\npm\.cmd"/i.test(source), 'npm detection must check the trusted absolute root')
assert.ok(/StrCpy\s+\$7\s+"\$PROGRAMFILES64\\Git"/i.test(source), 'Git root must be derived from 64-bit Program Files')
assert.ok(/FileExists\}\s+"\$7\\cmd\\git\.exe"/i.test(source), 'Git detection must check the trusted absolute root')
assert.ok(!/cmd\.exe[^\n]*node\s+--version/i.test(source), 'elevated installer must not execute bare node through PATH')
assert.ok(!/cmd\.exe[^\n]*git\s+--version/i.test(source), 'elevated installer must not execute bare git through PATH')
assert.ok(!/ExecToStack[^\n]*(?:node|git)(?:\.exe|\.cmd)?\b/i.test(source), 'toolchain detection must not execute node/git')
assert.ok(!/ExecWait[^\n]*\b(?:node|git)(?:\.exe|\.cmd)?\b/i.test(source), 'elevated detection must not execute an existing node/git binary')
assert.ok(source.includes('${FileExists}'), 'trusted machine toolchain detection should be filesystem based')

console.log('[installer-security] elevated detection is Program-Files-rooted and never executes PATH node/git')
