'use strict'
/**
 * One-command GitHub Release publisher for DSH Desktop.
 *
 *   npm run dist     # build the installer first
 *   $env:GH_TOKEN='ghp_...'   # or GITHUB_TOKEN
 *   npm run release  # tags v<version>, creates the GitHub Release,
 *                    # uploads DSH-Desktop-Setup-<version>.exe + blockmap
 *
 * Uses the GitHub REST API only — no gh CLI required.
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const pkg = require(path.join(ROOT, 'package.json'))
const OWNER_REPO = 'guanyibei1314/dsh-desktop'
const VERSION = 'v' + pkg.version
const API = 'https://api.github.com'
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN

function fail(msg) {
  console.error('[release] FAILED:', msg)
  process.exitCode = 1
}

if (!TOKEN) fail('GH_TOKEN / GITHUB_TOKEN 环境变量未设置')

const exeName = `DSH-Desktop-Setup-${pkg.version}.exe`
const exePath = path.join(ROOT, 'dist', exeName)
const blockmapPath = exePath + '.blockmap'
if (!fs.existsSync(exePath)) fail(`未找到安装包: ${exePath}（先运行 npm run dist）`)

async function gh(pathname, options = {}) {
  const res = await fetch(API + pathname, {
    method: options.method || 'GET',
    headers: Object.assign({
      Authorization: 'Bearer ' + TOKEN,
      'User-Agent': 'dsh-desktop-release',
      Accept: 'application/vnd.github+json',
    }, options.headers || {}),
    body: options.body,
  })
  const text = await res.text()
  let json = null
  try { json = text === '' ? null : JSON.parse(text) } catch (e) { json = null }
  if (res.status === 404 && options.allow404) return null
  if (!res.ok) fail(`${options.method || 'GET'} ${pathname} -> ${res.status}: ${(json && (json.message || json.errors)) || text.slice(0, 300)}`)
  return json
}

function git(args) {
  const git = process.env.GIT || 'git'
  try {
    return execFileSync(git, args, { cwd: ROOT, encoding: 'utf8' })
  } catch (e) {
    return null // git unavailable or command failed — never fatal (the GitHub API creates tags itself)
  }
}

function releaseNotes() {
  const log = git(['log', '--oneline', '-8'])
  const lines = log === null ? [] : log.split('\n').filter(Boolean)
  const changes = lines.length === 0 ? '- 见仓库提交历史' : lines.map((l) => '- ' + l).join('\n')
  return `## DSH Desktop ${pkg.version}\n\n零配置开箱即用：下载安装包双击安装，自动连接本机 DSH 服务（http://127.0.0.1:3080）。\n\n### 变更\n${changes}\n\n### 使用\n1. 安装（可选安装目录）\n2. 确保本机已运行 DSH 服务（dsh 或 pnpm dev:web）\n3. 打开「DSH Desktop」，从托盘/菜单使用全部功能\n\n详见 README。`
}

async function uploadAsset(uploadUrl, fileName, filePath, contentType) {
  const url = uploadUrl.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`)
  const data = fs.readFileSync(filePath)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      'User-Agent': 'dsh-desktop-release',
      Accept: 'application/vnd.github+json',
      'Content-Type': contentType,
      'Content-Length': String(data.length),
    },
    body: data,
  })
  const text = await res.text()
  if (!res.ok) fail(`上传 ${fileName} -> ${res.status}: ${text.slice(0, 300)}`)
  const json = JSON.parse(text)
  console.log('  uploaded', fileName, '->', json.browser_download_url)
}

async function main() {
  // local tag (best-effort; the GitHub API creates the tag reference itself)
  if (git(['tag', VERSION]) === null) {
    console.log('[release] local tag exists (or git unavailable — API will tag automatically)')
  } else {
    console.log('[release] tag created:', VERSION)
  }
  if (git(['push', 'origin', VERSION]) === null) {
    console.log('[release] tag push skipped (git unavailable)')
  } else {
    console.log('[release] tag pushed')
  }

  // release
  let release = await gh(`/repos/${OWNER_REPO}/releases/tags/${VERSION}`, { allow404: true })
  if (release === null) {
    release = await gh(`/repos/${OWNER_REPO}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: VERSION,
        name: `DSH Desktop ${pkg.version}`,
        body: releaseNotes(),
      }),
    })
    console.log('[release] release created:', release.html_url)
  } else {
    console.log('[release] release exists — updating assets')
  }

  // assets (idempotent: skip already-uploaded names)
  const existing = new Set((release.assets || []).map((a) => a.name))
  if (!existing.has(exeName)) {
    await uploadAsset(release.upload_url, exeName, exePath, 'application/octet-stream')
  } else {
    console.log('  asset exists:', exeName)
  }
  if (fs.existsSync(blockmapPath) && !existing.has(exeName + '.blockmap')) {
    await uploadAsset(release.upload_url, exeName + '.blockmap', blockmapPath, 'application/octet-stream')
  }
  console.log('[release] done ->', release.html_url)
}

main().catch((err) => fail(err && err.message ? err.message : String(err)))
