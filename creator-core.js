'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const STATE_SCHEMA = 1
const MAX_STATE_ITEMS = 2000
const MAX_TEXT_BYTES = 2 * 1024 * 1024
const ALLOWED_EDIT_FILES = new Set(['topic.md', 'script.md'])

function cleanText(value, max = 2000) {
  return typeof value === 'string' ? value.replace(/\0/g, '').trim().slice(0, max) : ''
}

function cleanTags(value) {
  const source = Array.isArray(value) ? value : []
  const result = []
  for (const item of source.slice(0, 20)) {
    const tag = cleanText(item, 40)
    if (tag && !result.includes(tag)) result.push(tag)
  }
  return result
}

function safeId(value) {
  const id = cleanText(value, 120)
  return /^[A-Za-z0-9._-]+$/.test(id) && id !== '.' && id !== '..' ? id : ''
}

function newId(prefix = 'item') {
  return `${prefix}-${crypto.randomUUID()}`
}

function sanitizeTitle(value) {
  const title = cleanText(value, 120)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
  if (!title) throw new Error('标题不能为空。')
  return title.slice(0, 80)
}

function defaultState() {
  return {
    schema: STATE_SCHEMA,
    revision: 0,
    libraryRoot: '',
    ideas: [],
    schedule: [],
    goals: [],
    reviews: [],
    contentMeta: {},
    settings: {
      contentTypes: ['视频', '公众号', '小红书', '技术文章', '教程'],
      ideaTiers: ['待验证', '值得做', '优先'],
    },
  }
}

function normalizeIdea(item) {
  if (!item || typeof item !== 'object') return null
  const id = safeId(item.id) || newId('idea')
  const title = cleanText(item.title, 160)
  if (!title) return null
  return {
    id,
    title,
    notes: cleanText(item.notes, 5000),
    type: cleanText(item.type, 60) || '视频',
    tier: cleanText(item.tier, 60) || '待验证',
    tags: cleanTags(item.tags),
    status: ['open', 'promoted', 'archived'].includes(item.status) ? item.status : 'open',
    contentId: safeId(item.contentId) || '',
    createdAt: cleanText(item.createdAt, 80) || new Date().toISOString(),
    updatedAt: cleanText(item.updatedAt, 80) || new Date().toISOString(),
  }
}

function normalizeScheduleItem(item) {
  if (!item || typeof item !== 'object') return null
  const title = cleanText(item.title, 160)
  if (!title) return null
  return {
    id: safeId(item.id) || newId('schedule'),
    title,
    date: cleanText(item.date, 20),
    type: cleanText(item.type, 40) || '内容推进',
    contentId: safeId(item.contentId) || '',
    done: item.done === true,
    notes: cleanText(item.notes, 2000),
  }
}

function normalizeGoal(item) {
  if (!item || typeof item !== 'object') return null
  const title = cleanText(item.title, 160)
  if (!title) return null
  const target = Number(item.target)
  const current = Number(item.current)
  return {
    id: safeId(item.id) || newId('goal'),
    title,
    target: Number.isFinite(target) && target >= 0 ? target : 0,
    current: Number.isFinite(current) && current >= 0 ? current : 0,
    unit: cleanText(item.unit, 40) || '项',
    deadline: cleanText(item.deadline, 20),
    notes: cleanText(item.notes, 2000),
  }
}

function normalizeReview(item) {
  if (!item || typeof item !== 'object') return null
  const contentId = safeId(item.contentId)
  if (!contentId) return null
  return {
    id: safeId(item.id) || newId('review'),
    contentId,
    result: cleanText(item.result, 6000),
    worked: cleanText(item.worked, 6000),
    problems: cleanText(item.problems, 6000),
    nextExperiment: cleanText(item.nextExperiment, 6000),
    createdAt: cleanText(item.createdAt, 80) || new Date().toISOString(),
    updatedAt: cleanText(item.updatedAt, 80) || new Date().toISOString(),
  }
}

function normalizeContentMeta(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const result = {}
  for (const [rawId, raw] of Object.entries(input).slice(0, MAX_STATE_ITEMS)) {
    const id = safeId(rawId)
    if (!id || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    result[id] = {
      published: raw.published === true,
      publishedAt: cleanText(raw.publishedAt, 80),
      nextStep: cleanText(raw.nextStep, 240),
      tags: cleanTags(raw.tags),
      contentType: cleanText(raw.contentType, 60),
    }
  }
  return result
}

function normalizeState(value) {
  const base = defaultState()
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const ideas = (Array.isArray(input.ideas) ? input.ideas : []).slice(0, MAX_STATE_ITEMS).map(normalizeIdea).filter(Boolean)
  const schedule = (Array.isArray(input.schedule) ? input.schedule : []).slice(0, MAX_STATE_ITEMS).map(normalizeScheduleItem).filter(Boolean)
  const goals = (Array.isArray(input.goals) ? input.goals : []).slice(0, MAX_STATE_ITEMS).map(normalizeGoal).filter(Boolean)
  const reviews = (Array.isArray(input.reviews) ? input.reviews : []).slice(0, MAX_STATE_ITEMS).map(normalizeReview).filter(Boolean)
  const settings = input.settings && typeof input.settings === 'object' && !Array.isArray(input.settings) ? input.settings : {}
  return {
    schema: STATE_SCHEMA,
    revision: Number.isSafeInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
    libraryRoot: cleanText(input.libraryRoot, 1200),
    ideas,
    schedule,
    goals,
    reviews,
    contentMeta: normalizeContentMeta(input.contentMeta),
    settings: {
      contentTypes: cleanTags(settings.contentTypes).length ? cleanTags(settings.contentTypes) : base.settings.contentTypes,
      ideaTiers: cleanTags(settings.ideaTiers).length ? cleanTags(settings.ideaTiers) : base.settings.ideaTiers,
    },
  }
}

function canonicalRoot(root) {
  const raw = cleanText(root, 1200)
  if (!raw) throw new Error('请先选择内容目录。')
  const resolved = fs.realpathSync(raw)
  const stat = fs.statSync(resolved)
  if (!stat.isDirectory()) throw new Error('内容目录无效。')
  return path.resolve(resolved)
}

function resolveContentDir(root, id) {
  const safe = safeId(id)
  if (!safe) throw new Error('内容 ID 无效。')
  const base = canonicalRoot(root)
  const candidate = path.resolve(base, safe)
  if (path.dirname(candidate) !== base) throw new Error('内容路径越界。')
  const stat = fs.lstatSync(candidate)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('内容目录必须是真实本地文件夹。')
  return candidate
}

function resolveEditableFile(root, id, fileName) {
  if (!ALLOWED_EDIT_FILES.has(fileName)) throw new Error('不允许编辑该文件。')
  const dir = resolveContentDir(root, id)
  const candidate = path.join(dir, fileName)
  if (fs.existsSync(candidate)) {
    const stat = fs.lstatSync(candidate)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('内容文件必须是真实普通文件。')
  }
  return candidate
}

function readTextLimited(file) {
  if (!fs.existsSync(file)) return ''
  const stat = fs.statSync(file)
  if (!stat.isFile() || stat.size > MAX_TEXT_BYTES) throw new Error('内容文件过大或类型异常。')
  return fs.readFileSync(file, 'utf8')
}

function writeTextAtomic(file, text) {
  const value = typeof text === 'string' ? text : ''
  if (Buffer.byteLength(value, 'utf8') > MAX_TEXT_BYTES) throw new Error('内容文本超过 2 MiB 限制。')
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temp, value, 'utf8')
  try {
    fs.renameSync(temp, file)
  } catch (error) {
    fs.copyFileSync(temp, file)
    fs.rmSync(temp, { force: true })
  }
}

function inferStage(facts, meta = {}) {
  if (meta.published) return '已发布'
  if (facts.video && facts.cover) return '待发布'
  if (facts.video) return '制作中'
  if (facts.script) return '脚本'
  return '选题'
}

module.exports = {
  ALLOWED_EDIT_FILES,
  MAX_TEXT_BYTES,
  STATE_SCHEMA,
  canonicalRoot,
  defaultState,
  inferStage,
  newId,
  normalizeState,
  readTextLimited,
  resolveContentDir,
  resolveEditableFile,
  safeId,
  sanitizeTitle,
  writeTextAtomic,
}
