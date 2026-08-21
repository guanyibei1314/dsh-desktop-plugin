'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', '.github', 'workflows')
const files = fs.readdirSync(root).filter((name) => /\.ya?ml$/i.test(name)).sort()
assert.ok(files.length > 0, 'no workflow files found')

const failures = []
for (const name of files) {
  const file = path.join(root, name)
  const text = fs.readFileSync(file, 'utf8')
  if (/\bpull_request_target\s*:/m.test(text)) failures.push(`${name}: pull_request_target is forbidden`)
  if (/permissions:\s*write-all/i.test(text)) failures.push(`${name}: permissions write-all is forbidden`)
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const match = line.match(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/)
    if (!match) continue
    const ref = match[1]
    if (ref.startsWith('./') || ref.startsWith('docker://')) continue
    const at = ref.lastIndexOf('@')
    if (at < 1) {
      failures.push(`${name}:${index + 1}: action reference has no @sha: ${ref}`)
      continue
    }
    const sha = ref.slice(at + 1)
    if (!/^[0-9a-f]{40}$/i.test(sha)) failures.push(`${name}:${index + 1}: action must be pinned to full commit SHA: ${ref}`)
  }
}

if (failures.length) throw new Error(`workflow supply-chain policy failed:\n${failures.join('\n')}`)
console.log(`[workflow-security] ${files.length} workflow file(s) use immutable action SHAs and least-privilege trigger policy`)
