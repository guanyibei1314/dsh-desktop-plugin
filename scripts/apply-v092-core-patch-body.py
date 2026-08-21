from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'missing expected snippet in {path}: {old[:120]!r}')
    if text.count(old) != 1:
        raise SystemExit(f'expected exactly one snippet in {path}, found {text.count(old)}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# ---------------------------------------------------------------- main.js
replace_once('main.js',
"const { spawn } = require('child_process')\n",
"const { spawn } = require('child_process')\nconst { pathToFileURL } = require('url')\nconst { readJsonLimited } = require('./secure-fetch')\n")

replace_once('main.js',
"const HARNESS_URL = (process.env.DSH_URL || ARG_URL || 'http://127.0.0.1:3080').replace(/\\/+$/, '')\nconst SMOKE = process.argv.includes('--smoke')\n\n// ---------------------------------------------------------------- bundled DeepSeek Harness runtime\n// 零配置的核心：优先连接本机已有服务（兼容现状）；没有则用 Electron 自带的\n// Node 运行时启动打包内置的 DSH CLI（无需用户安装 Node / 执行命令）。\nlet dshProc = null       // 内置 DSH 子进程\nlet activeUrl = HARNESS_URL // 实际连接的 Harness URL（内置启动后可能变化）\n",
"const EXPLICIT_HARNESS_URL = (process.env.DSH_URL || ARG_URL || '').replace(/\\/+$/, '')\nconst SMOKE = process.argv.includes('--smoke')\n\n// ---------------------------------------------------------------- bundled DeepSeek Harness runtime\n// 默认模式只信任 Desktop 自己启动并持有进程句柄的随机 loopback Runtime。\n// 复用外部服务必须由用户显式提供 DSH_URL / --url；固定 3080 不再自动信任。\nlet dshProc = null\nlet activeUrl = EXPLICIT_HARNESS_URL\n")

replace_once('main.js',
"const sessionCache = new Map() // sessionId -> { cwd, running, blank, updatedAt }\n",
"const sessionCache = new Map() // sessionId -> { cwd, running, blank, updatedAt }\nconst MAX_RPC_BYTES = 4 * 1024 * 1024\nconst MAX_SSE_BUFFER_BYTES = 1024 * 1024\n")

replace_once('main.js',
"async function startBundledDsh() {\n  if (dshProc !== null && activeUrl !== HARNESS_URL) return activeUrl\n",
"async function startBundledDsh() {\n  if (dshProc !== null && activeUrl) return activeUrl\n")

replace_once('main.js',
"  child.on('exit', () => { if (dshProc === child) { dshProc = null; activeUrl = HARNESS_URL } })\n",
"  child.on('exit', () => { if (dshProc === child) { dshProc = null; activeUrl = EXPLICIT_HARNESS_URL } })\n")

replace_once('main.js',
"  while (Date.now() < deadline) {\n    if (await probeUrl(url, 1000)) {\n      activeUrl = url\n      return url\n    }\n    if (dshProc === null) break // 子进程提前退出\n    await delay(1000)\n  }\n",
"  while (Date.now() < deadline) {\n    // Never accept a responder after the child we launched has exited. This\n    // closes the port-race path where a different local process answers first.\n    if (dshProc !== child || child.exitCode !== null) break\n    if (await probeUrl(url, 1000)) {\n      if (dshProc !== child || child.exitCode !== null) break\n      activeUrl = url\n      return url\n    }\n    await delay(1000)\n  }\n")

replace_once('main.js',
"/**\n * 决定实际连接的 Harness URL：\n * 1. 用户显式指定 --url / DSH_URL：只连它，失败就报错页（尊重用户意图）。\n * 2. 默认：先探测 3080（本机已有服务则直接复用）；\n * 3. 没有则启动打包内置的 DSH 并等待就绪。\n * @returns 就绪的 URL；null 表示不可用（走错误页）。\n */\nasync function ensureHarness() {\n  if (process.env.DSH_URL || ARG_URL) {\n    return (await probeUrl(HARNESS_URL)) ? HARNESS_URL : null\n  }\n  if (await probeUrl(HARNESS_URL)) {\n    activeUrl = HARNESS_URL\n    return HARNESS_URL\n  }\n  // 冒烟测试保持快速失败，不启动内置 DSH（冷启动很慢）。\n  if (SMOKE) return null\n  if (!hasBundledDsh()) return null\n  try {\n    return await startBundledDsh()\n  } catch (err) {\n    process.stderr.write(String(err && err.message || err) + '\\n')\n    return null\n  }\n}\n",
"/**\n * 决定实际连接的 Harness URL：\n * 1. 只有用户显式指定 --url / DSH_URL 时才复用外部服务；\n * 2. 默认始终启动 Desktop 自己持有句柄的 bundled DSH 随机端口。\n * @returns 就绪的 URL；null 表示不可用（走错误页）。\n */\nasync function ensureHarness() {\n  if (EXPLICIT_HARNESS_URL) {\n    return (await probeUrl(EXPLICIT_HARNESS_URL)) ? EXPLICIT_HARNESS_URL : null\n  }\n  // 冒烟测试保持快速失败，不启动内置 DSH（冷启动很慢）。\n  if (SMOKE) return null\n  if (!hasBundledDsh()) return null\n  try {\n    return await startBundledDsh()\n  } catch (err) {\n    process.stderr.write(String(err && err.message || err) + '\\n')\n    return null\n  }\n}\n")

replace_once('main.js',
"  if (!res.ok) throw new Error('HTTP ' + res.status)\n  const body = await res.json()\n  const result = body && body.result\n",
"  const body = await readJsonLimited(res, MAX_RPC_BYTES, { label: 'DSH RPC response' })\n  const result = body && body.result\n")

replace_once('main.js',
"        buf += decoder.decode(value, { stream: true })\n        let i\n",
"        buf += decoder.decode(value, { stream: true })\n        if (Buffer.byteLength(buf, 'utf8') > MAX_SSE_BUFFER_BYTES) {\n          throw new Error('DSH SSE buffer exceeds size limit')\n        }\n        let i\n")

replace_once('main.js',
"async function loadMain() {\n  if (!win) return\n  let url = HARNESS_URL\n",
"async function loadMain() {\n  if (!win) return\n  let url = activeUrl || EXPLICIT_HARNESS_URL\n")

replace_once('main.js',
"function createWindow() {\n",
"function sameOrigin(candidate, trusted) {\n  try {\n    return !!trusted && new URL(candidate).origin === new URL(trusted).origin\n  } catch (_) {\n    return false\n  }\n}\n\nfunction isTrustedMainNavigation(url) {\n  if (url === pathToFileURL(ERROR_HTML).href) return true\n  return sameOrigin(url, activeUrl)\n}\n\nfunction createWindow() {\n")

replace_once('main.js',
"    webPreferences: {\n      preload: PRELOAD,\n      contextIsolation: true,\n      nodeIntegration: false,\n      sandbox: true,\n    },\n",
"    webPreferences: {\n      preload: PRELOAD,\n      partition: 'persist:dsh-main',\n      contextIsolation: true,\n      nodeIntegration: false,\n      sandbox: true,\n    },\n",)

replace_once('main.js',
"  win = new BrowserWindow(winOptions)\n  win.once('ready-to-show', () => {\n",
"  win = new BrowserWindow(winOptions)\n  const mainSession = win.webContents.session\n  mainSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))\n  mainSession.setPermissionCheckHandler(() => false)\n  const enforceMainOrigin = (event, url) => {\n    if (!isTrustedMainNavigation(url)) event.preventDefault()\n  }\n  win.webContents.on('will-navigate', enforceMainOrigin)\n  win.webContents.on('will-redirect', enforceMainOrigin)\n  win.once('ready-to-show', () => {\n")

replace_once('main.js',
"function isTrustedSender(event) {\n  const url = (event.senderFrame && event.senderFrame.url) || event.sender.getURL()\n  return url.startsWith('file://') || url.startsWith(activeUrl) || url.startsWith(HARNESS_URL)\n}\n",
"function isTrustedSender(event) {\n  const sender = event && event.sender\n  if (!sender) return false\n  return [win, sendDialog, termWin].some((candidate) =>\n    candidate && !candidate.isDestroyed() && sender === candidate.webContents)\n}\n")

replace_once('main.js',
"ipcMain.on('desktop:retry', () => loadMain())\nipcMain.on('desktop:quit', () => { quitting = true; app.quit() })\n",
"ipcMain.on('desktop:retry', (event) => { if (isTrustedSender(event)) loadMain() })\nipcMain.on('desktop:quit', (event) => { if (isTrustedSender(event)) { quitting = true; app.quit() } })\n")

# ---------------------------------------------------------- runtime-manager.js
replace_once('runtime-manager.js',
"  PACKAGE_NAME,\n  REGISTRY_ORIGIN,\n",
"  EXPECTED_REPOSITORY,\n  PACKAGE_NAME,\n  REGISTRY_ORIGIN,\n")
replace_once('runtime-manager.js',
"  normalizeOsvResponse,\n  normalizeRegistryRelease,\n",
"  normalizeOsvResponse,\n  normalizeRegistryRelease,\n  normalizeRepository,\n")
replace_once('runtime-manager.js',
"} = require('./runtime-update-core')\n",
"} = require('./runtime-update-core')\nconst { readJsonLimited } = require('./secure-fetch')\n")

replace_once('runtime-manager.js',
"    if (pkg.name !== PACKAGE_NAME || pkg.version !== version || !fs.existsSync(bin)) return null\n    return { version, dir, bin }\n",
"    if (pkg.name !== PACKAGE_NAME || pkg.version !== version || !fs.existsSync(bin)) return null\n    if (normalizeRepository(pkg.repository) !== EXPECTED_REPOSITORY) return null\n    return { version, dir, bin, repository: EXPECTED_REPOSITORY }\n")

old_fetch = """async function fetchJson(url, options, maxBytes) {\n  const response = await fetch(url, Object.assign({}, options, {\n    redirect: 'error',\n    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),\n  }))\n  if (!response.ok) throw new Error(`HTTP ${response.status}`)\n  const contentType = response.headers.get('content-type') || ''\n  if (!/application\\/(?:json|[^;]+\\+json)/i.test(contentType)) throw new Error('unexpected response content type')\n  const declared = Number(response.headers.get('content-length') || 0)\n  if (declared > maxBytes) throw new Error('response exceeds size limit')\n  const bytes = new Uint8Array(await response.arrayBuffer())\n  if (bytes.byteLength > maxBytes) throw new Error('response exceeds size limit')\n  return JSON.parse(new TextDecoder().decode(bytes))\n}\n"""
new_fetch = """async function fetchJson(url, options, maxBytes) {\n  const response = await fetch(url, Object.assign({}, options, {\n    redirect: 'error',\n    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),\n  }))\n  return readJsonLimited(response, maxBytes, { label: 'Runtime security response' })\n}\n"""
replace_once('runtime-manager.js', old_fetch, new_fetch)

insert_after_osv = """async function queryOsv(version) {\n  const body = await fetchJson(OSV_URL, {\n    method: 'POST',\n    headers: { 'content-type': 'application/json', accept: 'application/json' },\n    body: JSON.stringify({ package: { ecosystem: 'npm', name: PACKAGE_NAME }, version }),\n  }, MAX_OSV_BYTES)\n  return normalizeOsvResponse(body)\n}\n"""
provenance_code = insert_after_osv + """\nfunction systemNpmCliPath() {\n  const candidates = []\n  if (process.platform === 'win32') {\n    for (const root of [process.env.ProgramW6432, process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {\n      if (root) candidates.push(path.join(root, 'nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js'))\n    }\n  }\n  if (process.env.CI === 'true' && process.env.npm_execpath) candidates.push(process.env.npm_execpath)\n  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null\n}\n\nfunction runNpmCli(npmCli, args, cwd, timeoutMs = 180000) {\n  return new Promise((resolve, reject) => {\n    const child = originalSpawn(process.execPath, [npmCli, ...args], {\n      cwd,\n      windowsHide: true,\n      stdio: ['ignore', 'pipe', 'pipe'],\n      env: runtimeEnvironment(path.join(runtimeRoot(), 'provenance-home')),\n    })\n    let stdout = ''\n    let stderr = ''\n    let settled = false\n    const timer = setTimeout(() => {\n      terminateTree(child)\n      if (!settled) { settled = true; reject(new Error('npm provenance verification timed out')) }\n    }, timeoutMs)\n    child.stdout.on('data', (data) => { stdout += String(data); if (stdout.length > 4_000_000) stdout = stdout.slice(-4_000_000) })\n    child.stderr.on('data', (data) => { stderr += String(data); if (stderr.length > 500_000) stderr = stderr.slice(-500_000) })\n    child.once('error', (error) => {\n      clearTimeout(timer)\n      if (!settled) { settled = true; reject(error) }\n    })\n    child.once('exit', (code) => {\n      clearTimeout(timer)\n      if (settled) return\n      settled = true\n      if (code === 0) resolve({ stdout, stderr })\n      else reject(new Error(`npm provenance verification failed (${code}): ${stderr.slice(-4000)} ${stdout.slice(-4000)}`))\n    })\n  })\n}\n\nfunction decodedProvenancePayloads(value, out = []) {\n  if (!value || typeof value !== 'object') return out\n  if (value.dsseEnvelope && typeof value.dsseEnvelope.payload === 'string') {\n    try {\n      const decoded = Buffer.from(value.dsseEnvelope.payload, 'base64').toString('utf8')\n      out.push(decodeURIComponent(decoded))\n    } catch (_) { /* invalid payload is simply not accepted */ }\n  }\n  if (Array.isArray(value)) {\n    for (const item of value) decodedProvenancePayloads(item, out)\n  } else {\n    for (const item of Object.values(value)) decodedProvenancePayloads(item, out)\n  }\n  return out\n}\n\nasync function verifyRuntimeProvenance(release, installed) {\n  if (!release.attestations || !/provenance/i.test(release.attestations.predicateType || '')) {\n    throw new Error('official DSH release is missing npm provenance metadata')\n  }\n  if (!installed || installed.repository !== EXPECTED_REPOSITORY) {\n    throw new Error('installed DSH repository identity does not match expected publisher source')\n  }\n  const npmCli = systemNpmCliPath()\n  if (!npmCli) throw new Error('trusted npm CLI is unavailable for provenance verification')\n\n  const verifyRoot = path.join(runtimeRoot(), 'provenance-verify', `${release.version}-${Date.now()}`)\n  fs.mkdirSync(verifyRoot, { recursive: true })\n  fs.writeFileSync(path.join(verifyRoot, 'package.json'), JSON.stringify({\n    name: 'dsh-runtime-provenance-verifier',\n    private: true,\n    version: '0.0.0',\n    dependencies: { [PACKAGE_NAME]: release.version },\n  }, null, 2), 'utf8')\n  try {\n    await runNpmCli(npmCli, [\n      'install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact',\n      `--registry=${REGISTRY_ORIGIN}/`,\n    ], verifyRoot)\n\n    const lock = readJson(path.join(verifyRoot, 'package-lock.json'))\n    const lockEntry = lock && lock.packages && lock.packages[`node_modules/${PACKAGE_NAME}`]\n    if (!lockEntry || lockEntry.version !== release.version || lockEntry.integrity !== release.integrity) {\n      throw new Error('npm provenance verification workspace does not match expected DSH version/integrity')\n    }\n    const rootPkg = readJson(path.join(verifyRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))\n    if (!rootPkg || normalizeRepository(rootPkg.repository) !== EXPECTED_REPOSITORY) {\n      throw new Error('npm provenance package repository does not match expected DeepSeek source')\n    }\n\n    const audited = await runNpmCli(npmCli, [\n      'audit', 'signatures', '--json', '--include-attestations', `--registry=${REGISTRY_ORIGIN}/`,\n    ], verifyRoot)\n    let report\n    try { report = JSON.parse(audited.stdout) } catch (_) { throw new Error('npm audit signatures returned invalid JSON') }\n    const verified = report && Array.isArray(report.verified) ? report.verified : []\n    const payloads = decodedProvenancePayloads(verified)\n    const rootProvenance = payloads.some((payload) =>\n      /provenance/i.test(payload) && payload.includes(PACKAGE_NAME) && payload.includes(release.version))\n    if (!rootProvenance) {\n      throw new Error('verified Sigstore provenance for exact @deepseek-ai/dsh release was not found')\n    }\n    appendLog(`verified npm/Sigstore provenance for ${release.version} source=${EXPECTED_REPOSITORY}`)\n    return true\n  } finally {\n    try { fs.rmSync(verifyRoot, { recursive: true, force: true }) } catch (_) { /* best effort */ }\n  }\n}\n"""
replace_once('runtime-manager.js', insert_after_osv, provenance_code)

replace_once('runtime-manager.js',
"  const smokeHome = path.join(runtimeRoot(), 'smoke-home', `${release.version}-${Date.now()}`)\n  await probeDshBin(installed.bin, smokeHome)\n",
"  // Authenticity must be independently verified before candidate JavaScript is\n  // ever executed by --version or dsh web. Integrity from the same npm metadata\n  // is not treated as an independent publisher identity.\n  await verifyRuntimeProvenance(release, installed)\n  const smokeHome = path.join(runtimeRoot(), 'smoke-home', `${release.version}-${Date.now()}`)\n  await probeDshBin(installed.bin, smokeHome)\n")

replace_once('runtime-manager.js',
"  validateInstalledVersion,\n}\n",
"  validateInstalledVersion,\n  verifyRuntimeProvenance,\n}\n")

# ------------------------------------------------------- desktop-extensions.js
replace_once('desktop-extensions.js',
"const TOOLBAR_HEIGHT = 58\n",
"const TOOLBAR_HEIGHT = 58\nconst NPM_REGISTRY_ORIGIN = 'https://registry.npmjs.org'\n")

replace_once('desktop-extensions.js',
"    npm_config_disturl: 'https://electronjs.org/headers',\n",
"    npm_config_disturl: 'https://electronjs.org/headers',\n    npm_config_registry: `${NPM_REGISTRY_ORIGIN}/`,\n")

replace_once('desktop-extensions.js',
"function pluginArgs(action, rawSpec) {\n",
"function validateInstallationPlan(value) {\n  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('市场安装计划无效。')\n  const packageName = String(value.packageName || '').trim()\n  const version = String(value.version || '').trim()\n  const spec = String(value.spec || '').trim()\n  const registry = String(value.registry || '').trim()\n  const integrity = String(value.integrity || '').trim()\n  const tarball = String(value.tarball || '').trim()\n  if (!isPackageName(packageName) || !/^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('市场安装计划包名/版本无效。')\n  if (spec !== `${packageName}@${version}`) throw new Error('市场安装计划 spec 与精确版本不一致。')\n  if (registry !== `${NPM_REGISTRY_ORIGIN}/`) throw new Error('市场安装计划 Registry 不是官方 npm。')\n  if (!/^sha512-[A-Za-z0-9+/=]+$/.test(integrity)) throw new Error('市场安装计划 integrity 无效。')\n  try {\n    const parsed = new URL(tarball)\n    if (parsed.protocol !== 'https:' || parsed.origin !== NPM_REGISTRY_ORIGIN || parsed.username || parsed.password) {\n      throw new Error('untrusted tarball')\n    }\n  } catch (_) {\n    throw new Error('市场安装计划 tarball 不是官方 npm HTTPS 地址。')\n  }\n  return { packageName, version, spec, registry, integrity, tarball }\n}\n\nfunction pluginArgs(action, rawSpec) {\n")

replace_once('desktop-extensions.js',
"  if (action === 'install') {\n    const parsed = parseInstallSpec(rawSpec)\n    if (!parsed) throw new Error('仅支持 npm Registry 包名，可选 latest/next/beta/alpha/rc/canary 或精确版本号。')\n    return ['add', parsed.spec]\n  }\n  if (action === 'update') {\n    const name = String(rawSpec || '').trim()\n    if (!isPackageName(name)) throw new Error('升级时请输入合法的 npm 包名。')\n    return ['update', name]\n  }\n",
"  if (action === 'install') {\n    if (rawSpec && typeof rawSpec === 'object') return ['add', validateInstallationPlan(rawSpec).spec]\n    const parsed = parseInstallSpec(rawSpec)\n    if (!parsed) throw new Error('仅支持 npm Registry 包名，可选 latest/next/beta/alpha/rc/canary 或精确版本号。')\n    return ['add', parsed.spec]\n  }\n  if (action === 'update') {\n    if (rawSpec && typeof rawSpec === 'object') return ['add', validateInstallationPlan(rawSpec).spec]\n    const name = String(rawSpec || '').trim()\n    if (!isPackageName(name)) throw new Error('升级时请输入合法的 npm 包名。')\n    return ['update', name]\n  }\n")

replace_once('desktop-extensions.js',
"function runPlugin(action, rawSpec) {\n  if (pluginProcess) return Promise.reject(new Error('已有插件操作正在执行。'))\n  if (!fs.existsSync(dshBinPath())) return Promise.reject(new Error('内置 DSH CLI 缺失，请重新安装。'))\n  const args = pluginArgs(action, rawSpec)\n  fs.mkdirSync(dshHomeDir(), { recursive: true })\n",
"function profileRoot() {\n  return path.join(dshHomeDir(), 'profiles', WEB_PROFILE)\n}\n\nfunction verifyInstalledPluginPlan(plan) {\n  const pkgPath = path.join(profileRoot(), 'node_modules', ...plan.packageName.split('/'), 'package.json')\n  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))\n  if (pkg.name !== plan.packageName || pkg.version !== plan.version) {\n    throw new Error('插件安装后的 name/version 与安全预检对象不一致。')\n  }\n  const lock = fs.readFileSync(path.join(profileRoot(), 'pnpm-lock.yaml'), 'utf8')\n  if (!lock.includes(plan.integrity)) throw new Error('插件安装后的 lock integrity 与安全预检不一致。')\n  return true\n}\n\nfunction rollbackPluginPlan(plan) {\n  return new Promise((resolve) => {\n    const child = spawn(process.execPath, [\n      '--expose-internals', dshBinPath(), 'plugin', '--profile', WEB_PROFILE, 'remove', plan.packageName,\n    ], { cwd: app.getPath('home'), windowsHide: true, stdio: 'ignore', env: pluginEnvironment() })\n    const timer = setTimeout(() => { terminateTree(child); resolve(false) }, 60000)\n    child.once('error', () => { clearTimeout(timer); resolve(false) })\n    child.once('exit', (code) => { clearTimeout(timer); resolve(code === 0) })\n  })\n}\n\nfunction runPlugin(action, rawSpec) {\n  if (pluginProcess) return Promise.reject(new Error('已有插件操作正在执行。'))\n  if (!fs.existsSync(dshBinPath())) return Promise.reject(new Error('内置 DSH CLI 缺失，请重新安装。'))\n  let plan = null\n  if ((action === 'install' || action === 'update') && rawSpec && typeof rawSpec === 'object') {\n    plan = validateInstallationPlan(rawSpec)\n  }\n  const args = pluginArgs(action, plan || rawSpec)\n  fs.mkdirSync(dshHomeDir(), { recursive: true })\n")

replace_once('desktop-extensions.js',
"    child.once('exit', (code, signal) => {\n      if (pluginProcess === child) pluginProcess = null\n      if (code === 0 && action !== 'list') pluginNeedsRestart = true\n      sendPlugin('plugin:state', { running: false, action, needsRestart: pluginNeedsRestart })\n      const result = { ok: code === 0, code, signal, output, needsRestart: pluginNeedsRestart }\n      if (code === 0) resolve(result)\n      else reject(Object.assign(new Error(`插件操作失败（退出码 ${code === null ? 'null' : code}）`), { result }))\n    })\n",
"    child.once('exit', async (code, signal) => {\n      if (pluginProcess === child) pluginProcess = null\n      if (code === 0 && plan) {\n        try {\n          verifyInstalledPluginPlan(plan)\n        } catch (error) {\n          await rollbackPluginPlan(plan)\n          sendPlugin('plugin:state', { running: false, action, needsRestart: pluginNeedsRestart })\n          reject(new Error(`插件安全安装后验证失败，已尝试回滚：${error.message}`))\n          return\n        }\n      }\n      if (code === 0 && action !== 'list') pluginNeedsRestart = true\n      sendPlugin('plugin:state', { running: false, action, needsRestart: pluginNeedsRestart })\n      const result = { ok: code === 0, code, signal, output, needsRestart: pluginNeedsRestart, verifiedPlan: plan || null }\n      if (code === 0) resolve(result)\n      else reject(Object.assign(new Error(`插件操作失败（退出码 ${code === null ? 'null' : code}）`), { result }))\n    })\n")

# ------------------------------------------------------------- plugin-manager.js
replace_once('plugin-manager.js',
"async function securityGate(packageName) {\n  // Always refresh immediately before an install/update. A previous green\n  // badge is informational only and cannot be replayed to bypass the gate.\n  securityResults.delete(packageName)\n  const result = await assessPackage(packageName, true)\n  const assessment = result && result.assessment\n  if (!assessment || assessment.blocked) {\n    append(`\\n已阻止：${packageName} 未通过市场安全门禁。可查看风险原因；高级手动入口仍保留给明确了解风险的用户。\\n`)\n    return false\n  }\n  if (assessment.requiresConfirmation) {\n    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons.slice(0, 4).join('\\n• ') : ''\n    return window.confirm(`插件 ${packageName} 被评为高风险（${assessment.score}/100）。\\n\\n• ${reasons}\\n\\n仍要继续吗？`)\n  }\n  return true\n}\n\nasync function runMarketAction(action, spec) {\n  if (action === 'install' || action === 'update') {\n    const allowed = await securityGate(spec)\n    if (!allowed) return\n  }\n  return runAction(action, spec)\n}\n",
"async function securityGate(packageName) {\n  // Always refresh immediately before an install/update. The returned immutable\n  // plan binds the exact version/registry/tarball/integrity that was assessed.\n  securityResults.delete(packageName)\n  const result = await assessPackage(packageName, true)\n  const assessment = result && result.assessment\n  const plan = result && result.installationPlan\n  if (!assessment || assessment.blocked || !plan) {\n    append(`\\n已阻止：${packageName} 未通过市场安全门禁或无法绑定精确安装对象。高级手动入口仍保留给明确了解风险的用户。\\n`)\n    return null\n  }\n  if (assessment.requiresConfirmation) {\n    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons.slice(0, 4).join('\\n• ') : ''\n    const confirmed = window.confirm(`插件 ${packageName} 被评为高风险（${assessment.score}/100）。\\n\\n• ${reasons}\\n\\n仍要继续吗？`)\n    if (!confirmed) return null\n  }\n  return plan\n}\n\nasync function runMarketAction(action, spec) {\n  if (action === 'install' || action === 'update') {\n    const plan = await securityGate(spec)\n    if (!plan) return\n    return runAction(action, plan)\n  }\n  return runAction(action, spec)\n}\n")

replace_once('plugin-manager.js',
"  append(`\\n> ${labels[action] || action} ${spec}\\n\\n`)\n",
"  const displaySpec = spec && typeof spec === 'object' && spec.spec ? spec.spec : spec\n  append(`\\n> ${labels[action] || action} ${displaySpec}\\n\\n`)\n")

print('v0.9.2 core security patch applied')
