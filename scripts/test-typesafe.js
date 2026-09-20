'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const typesafe = require('../creator-typesafe')

const root = path.join(__dirname, '..')
const idea = {
  id: 'idea-1',
  title: '用真实案例解释 AI 工作流',
  notes: '已有一篇参考文章和一次用户访谈，准备做一个短视频实验。',
  type: '视频',
  tier: '待验证',
  tags: ['AI', '工作流'],
}

function responseBody() {
  return {
    model: 'jev-1.13.0',
    usage: { input_tokens: 120, output_tokens: 24 },
    answers: {
      priority: {
        type: 'score',
        score: 1.6,
        confidence: 0.8,
        probabilities: { '0': 0.05, '1': 0.25, '2': 0.7 },
      },
      angle: {
        type: 'choice',
        choice: 'case',
        confidence: 0.9,
        probabilities: {
          education: 0.05,
          tool: 0.05,
          insight: 0.1,
          case: 0.7,
          story: 0.05,
          unclear: 0.05,
        },
      },
      evidence: { type: 'noul', noul: 0.9 },
    },
  }
}

function okResponse(body) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  }
}

async function main() {
  const request = typesafe.buildRequest(idea)
  assert.strictEqual(request.model, 'jev-latest')
  assert.deepStrictEqual(Object.keys(request.questions), ['priority', 'angle', 'evidence'])
  assert.strictEqual(request.questions.priority.type, 'score')
  assert.strictEqual(request.questions.angle.type, 'choice')
  assert.strictEqual(request.questions.evidence.type, 'noul')
  assert.ok(!JSON.stringify(request).includes('TYPESAFE_API_KEY'), 'API credentials must never be part of state or questions')

  const validated = typesafe.validateResponse(responseBody())
  assert.strictEqual(validated.answers.priority.score, 1.6)
  assert.strictEqual(validated.usage.inputTokens, 120)
  assert.strictEqual(validated.usage.outputTokens, 24)

  const assessment = typesafe.composeAssessment(idea, responseBody(), new Date('2026-09-20T00:00:00.000Z'))
  assert.strictEqual(assessment.priority.level, 'high')
  assert.strictEqual(assessment.angle.label, '案例复盘')
  assert.strictEqual(assessment.recommendation.key, 'promote')
  assert.deepStrictEqual(assessment.usage, { inputTokens: 120, outputTokens: 24 })
  assert.strictEqual(assessment.inputHash.length, 64)

  let calls = 0
  let capturedUrl = ''
  let capturedOptions = null
  const fetched = await typesafe.assessIdea(idea, {
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      calls += 1
      capturedUrl = url
      capturedOptions = options
      return okResponse(responseBody())
    },
    now: new Date('2026-09-20T00:00:00.000Z'),
  })
  assert.strictEqual(calls, 1)
  assert.strictEqual(capturedUrl, typesafe.TYPESAFE_ENDPOINT)
  assert.strictEqual(capturedOptions.headers.Authorization, 'Bearer test-key')
  assert.strictEqual(JSON.parse(capturedOptions.body).state.idea.title, idea.title)
  assert.strictEqual(fetched.recommendation.key, 'promote')

  let retryCalls = 0
  const retried = await typesafe.requestSystemOne(request, {
    apiKey: 'test-key',
    fetchImpl: async () => {
      retryCalls += 1
      if (retryCalls < 3) return { ok: false, status: 429, text: async () => '{"message":"slow down"}' }
      return okResponse(responseBody())
    },
    timeoutMs: 1000,
  })
  assert.strictEqual(retryCalls, 3)
  assert.strictEqual(retried.answers.evidence.noul, 0.9)

  await assert.rejects(
    () => typesafe.requestSystemOne(request, { apiKey: ' ', fetchImpl: async () => okResponse(responseBody()) }),
    /未配置 TYPESAFE_API_KEY/,
  )
  assert.throws(
    () => typesafe.validateResponse({ answers: { priority: { type: 'score' } } }),
    /概率分布缺失/,
  )

  const preload = fs.readFileSync(path.join(root, 'creator-preload.js'), 'utf8')
  const renderer = fs.readFileSync(path.join(root, 'creator.js'), 'utf8')
  const host = fs.readFileSync(path.join(root, 'creator-main.js'), 'utf8')
  assert.ok(preload.includes("creator:idea:assess"), 'Creator preload must expose the typed assessment IPC')
  assert.ok(!preload.includes('TYPESAFE_API_KEY'), 'API credentials must not reach the preload')
  assert.ok(!renderer.includes('Authorization'), 'Renderer must not construct TypeSafe authorization headers')
  assert.ok(host.includes("require('./creator-typesafe')"), 'TypeSafe client must live in the main process')
  assert.ok(host.includes("creator:idea:assess"), 'assessment IPC must be registered in the main process')

  console.log('[typesafe] typed idea assessment, retries, response validation and main-process credential boundary passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
