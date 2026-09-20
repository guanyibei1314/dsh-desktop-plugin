'use strict'

const crypto = require('crypto')

const TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const TYPESAFE_MODEL = 'jev-latest'
const MAX_ATTEMPTS = 3
const REQUEST_TIMEOUT_MS = 10000
const MAX_RESPONSE_BYTES = 256 * 1024
const RETRYABLE_STATUS = new Set([429, 529])

const PRIORITY_CRITERIA = [
  'Low priority: the idea has a weak connection to a defined audience, goal, timely evidence, or available production resources.',
  'Medium priority: the idea has a plausible audience and useful angle, but the evidence, differentiation, or next action is still incomplete.',
  'High priority: the idea has a clear audience, a specific useful angle, timely evidence or a concrete experiment, and a realistic next action.',
]

const ANGLE_CRITERIA = {
  education: 'Explains a concept, context, or underlying reason so the audience understands it.',
  tool: 'Provides a practical method, checklist, workflow, or tool that the audience can apply.',
  insight: 'Offers an opinion, comparison, interpretation, or non-obvious conclusion.',
  case: 'Uses a real example, result, failure, or process as the main material.',
  story: 'Leads with a personal experience, narrative, conflict, or human-interest arc.',
  unclear: 'No single angle is clear from the idea and its notes; more context is needed.',
}

const ANGLE_LABELS = {
  education: '知识解释',
  tool: '方法工具',
  insight: '观点洞察',
  case: '案例复盘',
  story: '故事经历',
  unclear: '暂不明确',
}

const RECOMMENDATION_LABELS = {
  promote: '建议推进',
  gather_evidence: '先补证据',
  review: '需要人工判断',
  hold: '暂缓',
}

function clean(value, max) {
  return typeof value === 'string' ? value.replace(/\0/g, '').trim().slice(0, max) : ''
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function ideaState(idea) {
  const state = {
    title: clean(idea && idea.title, 240),
    notes: clean(idea && idea.notes, 6000),
    contentType: clean(idea && (idea.type || idea.contentType), 80),
    currentTier: clean(idea && idea.tier, 80),
    tags: Array.isArray(idea && idea.tags)
      ? idea.tags.slice(0, 20).map((tag) => clean(tag, 60)).filter(Boolean)
      : [],
  }
  if (!state.title) throw new Error('灵感标题不能为空。')
  return state
}

function hashIdea(idea) {
  return crypto.createHash('sha256').update(JSON.stringify(ideaState(idea))).digest('hex')
}

function buildRequest(idea) {
  return {
    state: { idea: ideaState(idea) },
    model: TYPESAFE_MODEL,
    questions: {
      priority: {
        type: 'score',
        instructions: 'Rate how strongly this creator idea deserves near-term execution. Judge the idea as a content-workflow decision, not as a prediction of guaranteed audience performance. Consider the defined audience, useful angle, evidence or material, differentiation, and whether a realistic next action is visible.',
        criteria: PRIORITY_CRITERIA,
      },
      angle: {
        type: 'choice',
        instructions: 'Which single primary content angle best describes this creator idea? Choose unclear when the supplied idea and notes do not establish one dominant angle.',
        criteria: ANGLE_CRITERIA,
      },
      evidence: {
        type: 'noul',
        instructions: 'Does the idea include concrete evidence or material that can support the next content step?',
        criteria: {
          true: 'The idea includes a source, example, observed result, data point, user question, reference material, or a specific experiment to investigate.',
          false: 'The idea is only a broad topic, wish, or opinion without a concrete source, example, result, question, or material.',
        },
      },
    },
  }
}

function finiteProbabilityMap(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('TypeSafe ' + label + ' 概率分布缺失。')
  }
  const result = {}
  for (const key of keys) {
    const probability = Number(value[key])
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error('TypeSafe ' + label + ' 概率分布无效。')
    }
    result[key] = probability
  }
  return result
}

function finiteConfidence(value, label) {
  const confidence = Number(value)
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('TypeSafe ' + label + ' 置信度无效。')
  }
  return confidence
}

function validateResponse(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('TypeSafe 返回不是 JSON 对象。')
  }
  const answers = body.answers
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    throw new Error('TypeSafe 返回缺少 answers。')
  }
  const usage = body.usage && typeof body.usage === 'object' ? body.usage : {}
  const inputTokens = Number.isSafeInteger(usage.input_tokens) ? usage.input_tokens : usage.inputTokens
  const outputTokens = Number.isSafeInteger(usage.output_tokens) ? usage.output_tokens : usage.outputTokens

  const priority = answers.priority
  if (!priority || priority.type !== 'score') throw new Error('TypeSafe priority 返回类型不匹配。')
  const priorityProbabilities = finiteProbabilityMap(priority.probabilities, ['0', '1', '2'], 'priority')
  const priorityScore = Number(priority.score)
  if (!Number.isFinite(priorityScore) || priorityScore < 0 || priorityScore > 2) throw new Error('TypeSafe priority 分数无效。')

  const angle = answers.angle
  if (!angle || angle.type !== 'choice' || !Object.prototype.hasOwnProperty.call(ANGLE_CRITERIA, angle.choice)) {
    throw new Error('TypeSafe angle 返回选项无效。')
  }
  const angleProbabilities = finiteProbabilityMap(angle.probabilities, Object.keys(ANGLE_CRITERIA), 'angle')

  const evidence = answers.evidence
  if (!evidence || evidence.type !== 'noul') throw new Error('TypeSafe evidence 返回类型不匹配。')
  const evidenceProbability = Number(evidence.noul)
  if (!Number.isFinite(evidenceProbability) || evidenceProbability < 0 || evidenceProbability > 1) {
    throw new Error('TypeSafe evidence 概率无效。')
  }

  return {
    model: clean(body.model, 80) || TYPESAFE_MODEL,
    usage: {
      inputTokens: Number.isSafeInteger(inputTokens) ? inputTokens : 0,
      outputTokens: Number.isSafeInteger(outputTokens) ? outputTokens : 0,
    },
    answers: {
      priority: {
        type: 'score',
        score: priorityScore,
        confidence: finiteConfidence(priority.confidence, 'priority'),
        probabilities: priorityProbabilities,
      },
      angle: {
        type: 'choice',
        choice: angle.choice,
        confidence: finiteConfidence(angle.confidence, 'angle'),
        probabilities: angleProbabilities,
      },
      evidence: { type: 'noul', noul: evidenceProbability },
    },
  }
}

async function responseText(response) {
  if (!response || typeof response.text !== 'function') throw new Error('TypeSafe 返回缺少正文。')
  const text = await response.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('TypeSafe 返回超过大小限制。')
  return text
}

function responseMessage(text) {
  try {
    const parsed = JSON.parse(text)
    if (parsed && parsed.error && typeof parsed.error.message === 'string') return clean(parsed.error.message, 240)
    if (parsed && typeof parsed.message === 'string') return clean(parsed.message, 240)
  } catch (_) {
    // Fall through to the bounded raw response.
  }
  return clean(text, 240) || '未知错误'
}

async function requestSystemOne(request, options = {}) {
  const apiKey = clean(options.apiKey || process.env.TYPESAFE_API_KEY, 400)
  if (!apiKey) throw new Error('未配置 TYPESAFE_API_KEY；TypeSafe 评估保持离线，不会发送灵感内容。')
  const fetchImpl = options.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new Error('当前运行环境不提供 fetch，无法调用 TypeSafe。')
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1000, options.timeoutMs) : REQUEST_TIMEOUT_MS

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response
    try {
      response = await fetchImpl(TYPESAFE_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      })
    } catch (error) {
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(250 * (2 ** attempt))
        continue
      }
      throw new Error('TypeSafe 网络请求失败：' + (error && error.message ? error.message : String(error)))
    } finally {
      clearTimeout(timer)
    }

    const text = await responseText(response)
    if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_ATTEMPTS - 1) {
      await sleep(250 * (2 ** attempt))
      continue
    }
    if (!response.ok) throw new Error('TypeSafe 请求失败（HTTP ' + response.status + '）：' + responseMessage(text))

    let body
    try {
      body = JSON.parse(text)
    } catch (_) {
      throw new Error('TypeSafe 返回不是合法 JSON。')
    }
    return validateResponse(body)
  }

  throw new Error('TypeSafe 请求失败。')
}

function recommendationFor(answer) {
  const priorityConfidence = answer.priority.confidence
  const score = answer.priority.score
  const evidence = answer.evidence.noul

  if (evidence < 0.5) {
    return {
      key: 'gather_evidence',
      label: RECOMMENDATION_LABELS.gather_evidence,
      reason: '灵感里缺少具体来源、案例、数据、问题或实验材料；先补一条可核验依据。',
    }
  }
  if (score >= 1.35 && priorityConfidence >= 0.6) {
    return {
      key: 'promote',
      label: RECOMMENDATION_LABELS.promote,
      reason: '优先级判断集中在中高位，且已有具体依据；建议你确认受众和下一步后再推进。',
    }
  }
  if (priorityConfidence < 0.5) {
    return {
      key: 'review',
      label: RECOMMENDATION_LABELS.review,
      reason: '模型在优先级层级之间分歧较大；补充受众、目标或素材后再判断。',
    }
  }
  if (score >= 0.75) {
    return {
      key: 'review',
      label: RECOMMENDATION_LABELS.review,
      reason: '灵感有一定执行价值，但还需要结合你的资源、档期和差异化判断。',
    }
  }
  return {
    key: 'hold',
    label: RECOMMENDATION_LABELS.hold,
    reason: '当前更适合留在灵感池，等出现更具体的证据或切入角度再决定。',
  }
}

function priorityLevel(score) {
  if (score >= 1.35) return 'high'
  if (score >= 0.75) return 'medium'
  return 'low'
}

function composeAssessment(idea, response, now = new Date()) {
  const validated = validateResponse(response)
  const priority = validated.answers.priority
  const angle = validated.answers.angle
  const evidence = validated.answers.evidence
  const recommendation = recommendationFor(validated.answers)
  return {
    inputHash: hashIdea(idea),
    evaluatedAt: now.toISOString(),
    model: validated.model,
    usage: validated.usage,
    priority: {
      level: priorityLevel(priority.score),
      score: priority.score,
      confidence: priority.confidence,
      probabilities: priority.probabilities,
    },
    angle: {
      key: angle.choice,
      label: ANGLE_LABELS[angle.choice],
      confidence: angle.confidence,
      probabilities: angle.probabilities,
    },
    evidence: { noul: evidence.noul },
    recommendation,
  }
}

async function assessIdea(idea, options = {}) {
  const request = buildRequest(idea)
  const response = await requestSystemOne(request, options)
  return composeAssessment(idea, response, options.now || new Date())
}

module.exports = {
  ANGLE_CRITERIA,
  ANGLE_LABELS,
  MAX_RESPONSE_BYTES,
  PRIORITY_CRITERIA,
  RECOMMENDATION_LABELS,
  TYPESAFE_ENDPOINT,
  TYPESAFE_MODEL,
  assessIdea,
  buildRequest,
  composeAssessment,
  hashIdea,
  ideaState,
  requestSystemOne,
  validateResponse,
}
