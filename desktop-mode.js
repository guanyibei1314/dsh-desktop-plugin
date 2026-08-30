'use strict'

const { app, Menu } = require('electron')
const fs = require('fs')
const path = require('path')

const MODE_STANDARD = 'standard'
const MODE_CREATOR = 'creator'
const MODES = new Set([MODE_STANDARD, MODE_CREATOR])
let registered = false

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function readSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (_) {
    return {}
  }
}

function writeSettings(patch) {
  const file = settingsFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const next = Object.assign({}, readSettings(), patch)
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temp, JSON.stringify(next, null, 2), 'utf8')
  try {
    fs.renameSync(temp, file)
  } catch (error) {
    fs.copyFileSync(temp, file)
    fs.rmSync(temp, { force: true })
  }
  return next
}

function cliMode() {
  if (process.argv.includes('--creator-mode')) return MODE_CREATOR
  if (process.argv.includes('--standard-mode')) return MODE_STANDARD
  const hit = process.argv.find((arg) => arg.startsWith('--desktop-mode='))
  if (!hit) return null
  const value = hit.slice('--desktop-mode='.length).trim().toLowerCase()
  return MODES.has(value) ? value : null
}

function getMode() {
  const forced = String(process.env.DSH_DESKTOP_MODE || '').trim().toLowerCase()
  if (MODES.has(forced)) return forced
  const fromCli = cliMode()
  if (fromCli) return fromCli
  const saved = String(readSettings().desktopMode || '').trim().toLowerCase()
  return MODES.has(saved) ? saved : MODE_STANDARD
}

function setMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase()
  if (!MODES.has(normalized)) throw new Error(`unsupported desktop mode: ${mode}`)
  writeSettings({ desktopMode: normalized })
  return normalized
}

function switchMode(mode) {
  const next = setMode(mode)
  if (next === getMode() && !process.argv.includes('--creator-mode') && !process.argv.includes('--standard-mode')) {
    // getMode() now reads the persisted value; callers may still request an
    // explicit reload to rebuild the DSH shell, so relaunch intentionally.
  }
  app.relaunch({ args: process.argv.slice(1).filter((arg) => !/^--(?:creator|standard)-mode$|^--desktop-mode=/.test(arg)) })
  app.exit(0)
}

function modeSubmenu() {
  const mode = getMode()
  return [
    {
      label: '标准模式',
      type: 'radio',
      checked: mode === MODE_STANDARD,
      click: () => { if (getMode() !== MODE_STANDARD) switchMode(MODE_STANDARD) },
    },
    {
      label: 'Creator 模式',
      type: 'radio',
      checked: mode === MODE_CREATOR,
      click: () => { if (getMode() !== MODE_CREATOR) switchMode(MODE_CREATOR) },
    },
  ]
}

function patchMenus() {
  const original = Menu.buildFromTemplate.bind(Menu)
  Menu.buildFromTemplate = function dualModeBuildFromTemplate(template) {
    if (!Array.isArray(template)) return original(template)

    const hasAppMenu = template.some((item) => item && item.label === '文件') && template.some((item) => item && item.label === '帮助')
    if (hasAppMenu && !template.some((item) => item && item.label === '模式')) {
      const next = template.map((item) => item)
      const insertAt = Math.max(1, next.findIndex((item) => item && (item.label === '主题' || item.label === '选项')))
      next.splice(insertAt, 0, { label: '模式', submenu: modeSubmenu() })
      return original(next)
    }

    const isTray = template.length > 0 && template[0] && template[0].label === 'DSH Desktop'
    if (isTray && !template.some((item) => item && /^切换到/.test(String(item.label || '')))) {
      const next = template.map((item) => item)
      const exitIndex = next.findIndex((item) => item && item.label === '退出')
      const insertAt = exitIndex >= 0 ? Math.max(0, exitIndex - 1) : next.length
      const target = getMode() === MODE_CREATOR ? MODE_STANDARD : MODE_CREATOR
      next.splice(insertAt, 0, {
        label: target === MODE_CREATOR ? '切换到 Creator 模式' : '切换到标准模式',
        click: () => switchMode(target),
      })
      return original(next)
    }

    return original(template)
  }
}

function registerDesktopMode() {
  if (registered) return
  registered = true
  patchMenus()
}

module.exports = {
  MODE_CREATOR,
  MODE_STANDARD,
  getMode,
  registerDesktopMode,
  setMode,
  switchMode,
}
