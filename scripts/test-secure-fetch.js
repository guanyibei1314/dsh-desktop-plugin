'use strict'

const assert = require('assert')
const { readJsonLimited } = require('../secure-fetch')

function streamingResponse(chunks, headers = {}) {
  const encoder = new TextEncoder()
  const values = chunks.map((chunk) => typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
  return new Response(new ReadableStream({
    start(controller) {
      for (const value of values) controller.enqueue(value)
      controller.close()
    },
  }), {
    status: 200,
    headers: Object.assign({ 'content-type': 'application/json' }, headers),
  })
}

async function main() {
  const safe = await readJsonLimited(streamingResponse(['{"ok":', 'true}']), 64, { label: 'fixture' })
  assert.deepEqual(safe, { ok: true })

  await assert.rejects(
    () => readJsonLimited(streamingResponse(['{"pad":"', 'x'.repeat(128), '"}']), 32, { label: 'fixture' }),
    /exceeds size limit/,
  )

  await assert.rejects(
    () => readJsonLimited(streamingResponse(['{}'], { 'content-length': '9999' }), 32, { label: 'fixture' }),
    /exceeds size limit/,
  )

  await assert.rejects(
    () => readJsonLimited(new Response('not-json', { status: 200, headers: { 'content-type': 'text/plain' } }), 64, { label: 'fixture' }),
    /unexpected content type/,
  )

  console.log('[secure-fetch] streamed byte limits and content-type gates passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
