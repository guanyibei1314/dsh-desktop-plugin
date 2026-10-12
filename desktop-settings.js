'use strict'

const { app } = require('electron')
const fs = require('fs')
const path = require('path')

// settings.json is shared by the Standard host (window, theme, options),
// desktop mode and the Runtime updater. Every read-modify-write goes through
// here: a write lands in a temp file that is renamed over the old one, so a
// crash mid-write can never leave truncated JSON that silently resets the mode
// and update settings to defaults.

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function parseSettings(text) {
  const parsed = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('settings.json is not an object')
  return parsed
}

function readSettings() {
  try {
    return parseSettings(fs.readFileSync(settingsFile(), 'utf8'))
  } catch (_) {
    return {}
  }
}

/** Merge patch into settings.json atomically and return the stored object. */
function updateSettings(patch) {
  const file = settingsFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  let current = {}
  try {
    current = parseSettings(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    // Keep an unreadable file for diagnosis instead of overwriting it silently.
    if (error && error.code !== 'ENOENT') {
      try { fs.copyFileSync(file, `${file}.corrupt`) } catch (_) { /* best effort */ }
    }
  }
  const next = Object.assign(current, patch)
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

module.exports = {
  readSettings,
  settingsFile,
  updateSettings,
}
