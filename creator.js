'use strict'

const bridge = window.creatorBridge
const root = document.getElementById('viewRoot')
const nav = document.getElementById('nav')
const viewTitle = document.getElementById('viewTitle')
const viewSubtitle = document.getElementById('viewSubtitle')
const runtimeState = document.getElementById('runtimeState')
const refreshAll = document.getElementById('refreshAll')
const quickIdea = document.getElementById('quickIdea')
const quickContent = document.getElementById('quickContent')
const switchStandard = document.getElementById('switchStandard')
const toggleAi = document.getElementById('toggleAi')
const aiPanel = document.getElementById('aiPanel')
const aiEmpty = document.getElementById('aiEmpty')
const conversationFrame = document.getElementById('conversationFrame')
const editorDialog = document.getElementById('editorDialog')
const editorTitle = document.getElementById('editorTitle')
const editorPath = document.getElementById('editorPath')
const editorText = document.getElementById('editorText')
const saveContent = document.getElementById('saveContent')
const openContentFolder = document.getElementById('openContentFolder')
const formDialog = document.getElementById('formDialog')
const genericForm = document.getElementById('genericForm')
const formTitle = document.getElementById('formTitle')
const formHint = document.getElementById('formHint')
const formFields = document.getElementById('formFields')
const formSubmit = document.getElementById('formSubmit')
const toastEl = document.getElementById('toast')

let state = null
let contents = []
let status = null
let currentView = 'today'
let editing = null
let editingTab = 'topic'
let formHandler = null
let toastTimer = null

const viewCopy = {
  today: ['今日推进', '把灵感、内容、档期和目标汇总成今天真正要做的事。'],
  content: ['内容', '正文和素材始终保存在你选择的本地目录，Creator 只管理工作流。'],
  ideas: ['灵感', '先快速记录，再把验证过的想法升级成真实内容项目。'],
  operations: ['运营', '统一维护档期、下一步和阶段目标，不复制内容正文。'],
  reviews: ['复盘', '发布之后记录结果、有效做法和下一次实验，让经验回到下一轮创作。'],
  settings: ['设置与备份', '管理内容目录和 Creator 运营数据；切换模式不会删除这些数据。'],
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild)
}

function node(tag, className, text) {
  const item = document.createElement(tag)
  if (className) item.className = className
  if (text !== undefined && text !== null) item.textContent = String(text)
  return item
}

function button(label, className, click) {
  const item = node('button', className, label)
  item.type = 'button'
  item.addEventListener('click', click)
  return item
}

function badge(text, kind = '') {
  return node('span', `badge${kind ? ` ${kind}` : ''}`, text)
}

function toast(message, error = false) {
  toastEl.textContent = String(message || '')
  toastEl.className = `toast show${error ? ' error' : ''}`
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastEl.className = 'toast' }, 2600)
}

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(value) {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10)
  return parsed.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function contentById(id) {
  return contents.find((item) => item.id === id) || null
}

function contentTitle(id) {
  const hit = contentById(id)
  return hit ? hit.title : id || '未关联内容'
}

function stageKind(stage) {
  if (stage === '已发布') return 'good'
  if (stage === '待发布') return 'warn'
  return 'muted'
}

async function loadAll(showToast = false) {
  if (!bridge) return
  refreshAll.disabled = true
  try {
    const [nextStatus, nextState] = await Promise.all([bridge.status(), bridge.state()])
    status = nextStatus
    state = nextState
    contents = await bridge.listContents()
    updateRuntime(status && status.harnessUrl)
    render()
    if (showToast) toast('已刷新 Creator 工作区')
  } catch (error) {
    toast(error && error.message ? error.message : String(error), true)
  } finally {
    refreshAll.disabled = false
  }
}

function updateRuntime(url) {
  if (url) {
    runtimeState.className = 'runtime-state ready'
    runtimeState.lastChild.textContent = 'DSH 会话已就绪'
    conversationFrame.src = url
    conversationFrame.hidden = false
    aiEmpty.hidden = true
  } else {
    runtimeState.className = 'runtime-state error'
    runtimeState.lastChild.textContent = 'DSH 会话暂不可用'
    conversationFrame.hidden = true
    aiEmpty.hidden = false
    const strong = aiEmpty.querySelector('strong')
    const paragraph = aiEmpty.querySelector('p')
    if (strong) strong.textContent = 'DSH 会话暂未启动'
    if (paragraph) paragraph.textContent = '内容、灵感和运营仍可离线使用；重新启动 Creator 后会再次尝试连接 Runtime。'
  }
}

async function persist(renderAfter = true) {
  state = await bridge.saveState(state)
  if (renderAfter) render()
  return state
}

function setView(view) {
  if (!viewCopy[view]) return
  currentView = view
  for (const item of nav.querySelectorAll('.nav-item')) item.classList.toggle('active', item.dataset.view === view)
  render()
}

function setHeader() {
  const copy = viewCopy[currentView] || viewCopy.today
  viewTitle.textContent = copy[0]
  viewSubtitle.textContent = copy[1]
}

function metric(label, value, note) {
  const item = node('div', 'metric')
  item.append(node('div', 'metric-label', label), node('div', 'metric-value', value), node('div', 'metric-note', note))
  return item
}

function section(title, subtitle, action) {
  const wrap = node('section', 'section')
  const head = node('div', 'section-head')
  const copy = node('div')
  copy.append(node('h2', '', title))
  if (subtitle) copy.append(node('p', '', subtitle))
  head.append(copy)
  if (action) head.append(action)
  wrap.append(head)
  return wrap
}

function emptyState(title, text, action) {
  const item = node('div', 'empty')
  item.append(node('strong', '', title), node('p', '', text))
  if (action) item.append(action)
  return item
}

function renderToday() {
  const metrics = node('div', 'metric-grid section')
  const openIdeas = state.ideas.filter((item) => item.status === 'open').length
  const due = state.schedule.filter((item) => !item.done && item.date && item.date <= todayString()).length
  const published = contents.filter((item) => item.stage === '已发布').length
  metrics.append(
    metric('内容项目', contents.length, '真实本地文件夹'),
    metric('待验证灵感', openIdeas, '可随时升级为内容'),
    metric('今日 / 逾期', due, '统一档期'),
    metric('已发布', published, '等待复盘与经验沉淀'),
  )
  root.append(metrics)

  const grid = node('div', 'two-col section')
  const schedulePanel = node('div', 'panel')
  const scheduleHead = node('div', 'panel-pad')
  scheduleHead.append(node('div', 'panel-title', '今天要推进'), node('div', 'panel-sub', '到期和逾期事项优先显示'))
  schedulePanel.append(scheduleHead)
  const dueItems = state.schedule.filter((item) => !item.done && (!item.date || item.date <= todayString())).slice(0, 8)
  const scheduleList = node('div', 'list')
  if (!dueItems.length) scheduleList.append(emptyState('今天没有硬性档期', '可以从内容或灵感里挑一件最重要的事推进。'))
  for (const item of dueItems) scheduleList.append(scheduleRow(item, true))
  schedulePanel.append(scheduleList)

  const nextPanel = node('div', 'panel')
  const nextHead = node('div', 'panel-pad')
  nextHead.append(node('div', 'panel-title', '最近内容'), node('div', 'panel-sub', '按本地目录修改时间排序'))
  nextPanel.append(nextHead)
  const list = node('div', 'list')
  if (!contents.length) list.append(emptyState('还没有内容项目', '选择一个内容目录后，可以从灵感或主题直接创建项目。', button('选择内容目录', 'secondary', pickLibrary)))
  for (const item of contents.slice(0, 7)) list.append(contentListRow(item))
  nextPanel.append(list)
  grid.append(schedulePanel, nextPanel)
  root.append(grid)

  const goalSection = section('阶段目标', '目标只记录运营进度，不会覆盖真实内容状态。', button('+ 新目标', 'ghost', openGoalForm))
  const goalGrid = node('div', 'three-col')
  if (!state.goals.length) goalGrid.append(emptyState('还没有阶段目标', '例如：本月发布 8 条视频、完成 4 篇技术文章。'))
  for (const goal of state.goals.slice(0, 6)) goalGrid.append(goalCard(goal))
  goalSection.append(goalGrid)
  root.append(goalSection)
}

function contentListRow(item) {
  const row = node('div', 'list-row')
  const main = node('div', 'row-main')
  main.append(node('div', 'row-title', item.title), node('div', 'row-meta', `${item.id} · ${formatDate(item.modifiedAt)}`))
  const actions = node('div', 'row-actions')
  actions.append(badge(item.stage, stageKind(item.stage)), button('编辑', 'ghost', () => openEditor(item.id)))
  row.append(main, actions)
  return row
}

function renderContent() {
  const lib = node('div', 'library-bar')
  lib.append(node('span', 'badge muted', '内容目录'))
  lib.append(node('div', 'library-path', state.libraryRoot || '尚未选择'))
  lib.append(button('选择目录', 'ghost', pickLibrary))
  if (state.libraryRoot) lib.append(button('打开', 'ghost', () => bridge.openLibrary().catch((e) => toast(e.message, true))))
  root.append(lib)

  if (!state.libraryRoot) {
    root.append(emptyState('先选择一个真实内容目录', 'Creator 不把正文锁进数据库。每条内容仍是普通文件夹，AI、编辑器和你都可以直接读写。', button('选择内容目录', 'primary', pickLibrary)))
    return
  }

  const head = section('内容管线', '选题 → 脚本 → 制作 → 待发布 → 已发布', button('+ 新建内容', 'primary', openContentForm))
  const grid = node('div', 'content-grid')
  if (!contents.length) grid.append(emptyState('目录里还没有内容', '新建项目会生成日期_标题文件夹、topic.md 和 script.md。'))
  for (const item of contents) grid.append(contentCard(item))
  head.append(grid)
  root.append(head)
}

function contentCard(item) {
  const card = node('article', 'content-card')
  card.append(badge(item.stage, stageKind(item.stage)))
  card.append(node('h3', '', item.title), node('p', '', item.id))
  const assets = node('div', 'asset-line')
  for (const [label, key] of [['选题', 'topic'], ['脚本', 'script'], ['视频', 'video'], ['字幕', 'subtitle'], ['封面', 'cover']]) {
    assets.append(node('span', `asset${item.facts[key] ? ' on' : ''}`, label))
  }
  card.append(assets)
  const actions = node('div', 'card-actions')
  actions.append(button('编辑', 'secondary', () => openEditor(item.id)), button('文件夹', 'ghost', () => bridge.openContent(item.id).catch((e) => toast(e.message, true))))
  card.append(actions)
  return card
}

function renderIdeas() {
  const capture = section('快速捕捉', '先记录，不要求一开始就把题目想完整。')
  const inline = node('div', 'form-inline')
  const input = document.createElement('input')
  input.placeholder = '例如：做一期“人形机器人真正落地还缺什么”'
  const add = button('记下灵感', 'primary', async () => {
    const title = input.value.trim()
    if (!title) return
    state.ideas.unshift({ id: `idea-${cryptoId()}`, title, notes: '', type: '视频', tier: '待验证', tags: [], status: 'open', contentId: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    await persist()
    input.value = ''
    toast('灵感已记录')
  })
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); add.click() } })
  inline.append(input, add)
  capture.append(inline)
  root.append(capture)

  const open = state.ideas.filter((item) => item.status === 'open')
  const promoted = state.ideas.filter((item) => item.status === 'promoted')
  const grid = node('div', 'two-col section')
  grid.append(ideaPanel('灵感池', open, true), ideaPanel('已升级', promoted, false))
  root.append(grid)
}

function ideaPanel(title, items, actionable) {
  const panel = node('div', 'panel')
  const head = node('div', 'panel-pad')
  head.append(node('div', 'panel-title', title), node('div', 'panel-sub', actionable ? '确认值得做之后再创建真实内容目录' : '已经关联到内容项目'))
  panel.append(head)
  const list = node('div', 'list')
  if (!items.length) list.append(emptyState(actionable ? '灵感池是空的' : '还没有升级记录', actionable ? '看到任何值得做的东西先记下来。' : '从左侧灵感池点击“转为内容”。'))
  for (const idea of items) {
    const row = node('div', 'list-row')
    const main = node('div', 'row-main')
    main.append(node('div', 'row-title', idea.title), node('div', 'row-meta', `${idea.type} · ${idea.tier}${idea.tags.length ? ` · ${idea.tags.join(' / ')}` : ''}`))
    const actions = node('div', 'row-actions')
    if (actionable) {
      actions.append(button('编辑', 'ghost', () => openIdeaForm(idea)), button('转为内容', 'secondary', () => promoteIdea(idea)))
    } else if (idea.contentId) {
      actions.append(button('打开内容', 'ghost', () => openEditor(idea.contentId)))
    }
    row.append(main, actions)
    list.append(row)
  }
  panel.append(list)
  return panel
}

function renderOperations() {
  const grid = node('div', 'two-col section')
  const schedulePanel = node('div', 'panel')
  const head = node('div', 'panel-pad')
  const line = node('div', 'section-head')
  line.append(node('div', '', ''))
  head.append(node('div', 'panel-title', '档期规划'), node('div', 'panel-sub', '内容推进、复盘、直播或自定义事项只保留一套日期'))
  head.append(button('+ 新事项', 'ghost', openScheduleForm))
  schedulePanel.append(head)
  const scheduleList = node('div', 'list')
  const sorted = [...state.schedule].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  if (!sorted.length) scheduleList.append(emptyState('还没有档期', '先给最重要的下一步一个明确日期。'))
  for (const item of sorted) scheduleList.append(scheduleRow(item, false))
  schedulePanel.append(scheduleList)

  const goalPanel = node('div', 'panel')
  const goalHead = node('div', 'panel-pad')
  goalHead.append(node('div', 'panel-title', '目标追踪'), node('div', 'panel-sub', '目标值和当前值可以人工维护，不伪造平台数据'), button('+ 新目标', 'ghost', openGoalForm))
  goalPanel.append(goalHead)
  const goalList = node('div', 'list')
  if (!state.goals.length) goalList.append(emptyState('还没有目标', '创建一个有数字、有截止日期的阶段目标。'))
  for (const goal of state.goals) {
    const row = node('div', 'list-row')
    const main = node('div', 'row-main')
    const pct = goal.target > 0 ? Math.min(100, Math.round(goal.current / goal.target * 100)) : 0
    main.append(node('div', 'row-title', goal.title), node('div', 'row-meta', `${goal.current} / ${goal.target} ${goal.unit} · ${pct}%${goal.deadline ? ` · 截止 ${goal.deadline}` : ''}`))
    const actions = node('div', 'row-actions')
    actions.append(button('更新', 'ghost', () => openGoalForm(goal)), button('删除', 'danger', async () => { state.goals = state.goals.filter((x) => x.id !== goal.id); await persist(); }))
    row.append(main, actions)
    goalList.append(row)
  }
  goalPanel.append(goalList)
  grid.append(schedulePanel, goalPanel)
  root.append(grid)
}

function scheduleRow(item, compact) {
  const row = node('div', `list-row${item.done ? ' schedule-done' : ''}`)
  row.append(node('div', 'schedule-date', item.date || '未排期'))
  const main = node('div', 'row-main')
  main.append(node('div', 'row-title', item.title), node('div', 'row-meta', `${item.type}${item.contentId ? ` · ${contentTitle(item.contentId)}` : ''}`))
  const actions = node('div', 'row-actions')
  actions.append(button(item.done ? '恢复' : '完成', 'ghost', async () => { item.done = !item.done; await persist() }))
  if (!compact) actions.append(button('编辑', 'ghost', () => openScheduleForm(item)), button('删除', 'danger', async () => { state.schedule = state.schedule.filter((x) => x.id !== item.id); await persist(); }))
  row.append(main, actions)
  return row
}

function goalCard(goal) {
  const card = node('div', 'panel goal-card')
  const pct = goal.target > 0 ? Math.min(100, Math.round(goal.current / goal.target * 100)) : 0
  card.append(node('div', 'panel-title', goal.title), node('div', 'panel-sub', goal.deadline ? `截止 ${goal.deadline}` : '未设置截止日期'))
  const track = node('div', 'progress-track')
  const fill = node('div', 'progress-fill')
  fill.style.width = `${pct}%`
  track.append(fill)
  card.append(track)
  const numbers = node('div', 'goal-numbers')
  numbers.append(node('span', '', `${goal.current} / ${goal.target} ${goal.unit}`), node('span', '', `${pct}%`))
  card.append(numbers)
  return card
}

function renderReviews() {
  if (!contents.length) {
    root.append(emptyState('还没有可复盘的内容', '创建内容并推进后，就可以在这里保存结果和下一次实验。'))
    return
  }
  const sectionEl = section('内容复盘', '人工填写是默认入口；结果不会自动改写脚本或规则。')
  const form = node('div', 'panel panel-pad review-form')
  const contentLabel = node('label', '', '选择内容')
  const select = document.createElement('select')
  for (const item of contents) {
    const opt = document.createElement('option')
    opt.value = item.id
    opt.textContent = `${item.title} · ${item.stage}`
    select.append(opt)
  }
  contentLabel.append(select)
  const fields = {}
  for (const [key, label, placeholder] of [
    ['result', '本次结果', '播放、阅读、反馈、转化，或者只是你自己的判断。'],
    ['worked', '有效做法', '哪些选题、结构、表达或制作方法值得保留？'],
    ['problems', '存在问题', '哪些地方不理想，原因可能是什么？'],
    ['nextExperiment', '下一次实验', '下一条内容只改一个什么变量？'],
  ]) {
    const wrap = node('label', '', label)
    const area = document.createElement('textarea')
    area.placeholder = placeholder
    fields[key] = area
    wrap.append(area)
    form.append(wrap)
  }
  form.prepend(contentLabel)
  form.append(button('保存复盘', 'primary', async () => {
    const contentId = select.value
    const existing = state.reviews.find((item) => item.contentId === contentId)
    const review = existing || { id: `review-${cryptoId()}`, contentId, createdAt: new Date().toISOString() }
    for (const key of Object.keys(fields)) review[key] = fields[key].value
    review.updatedAt = new Date().toISOString()
    if (!existing) state.reviews.unshift(review)
    await persist(false)
    toast('复盘已保存')
    render()
  }))

  const loadReview = () => {
    const hit = state.reviews.find((item) => item.contentId === select.value)
    for (const key of Object.keys(fields)) fields[key].value = hit ? hit[key] || '' : ''
  }
  select.addEventListener('change', loadReview)
  loadReview()
  sectionEl.append(form)
  root.append(sectionEl)

  const history = section('已保存复盘', 'Creator 数据与内容正文分开，可独立导出备份。')
  const panel = node('div', 'panel list')
  if (!state.reviews.length) panel.append(emptyState('暂无历史复盘', '保存第一条复盘后会显示在这里。'))
  for (const review of state.reviews.slice(0, 20)) {
    const row = node('div', 'list-row')
    const main = node('div', 'row-main')
    main.append(node('div', 'row-title', contentTitle(review.contentId)), node('div', 'row-meta', `${formatDate(review.updatedAt)} · ${review.nextExperiment || review.result || '已保存'}`))
    row.append(main, badge('已复盘', 'good'))
    panel.append(row)
  }
  history.append(panel)
  root.append(history)
}

function renderSettings() {
  const lib = section('内容目录', '正文、视频、字幕、封面和文章都留在这个真实文件夹。')
  const panel = node('div', 'panel panel-pad')
  const bar = node('div', 'library-bar')
  bar.append(node('span', 'badge muted', 'Root'), node('div', 'library-path', state.libraryRoot || '尚未选择'), button('选择', 'secondary', pickLibrary))
  if (state.libraryRoot) bar.append(button('打开', 'ghost', () => bridge.openLibrary().catch((e) => toast(e.message, true))))
  panel.append(bar)
  panel.append(node('p', 'muted small', '切换到标准模式不会删除这个目录，也不会移动任何正文或媒体。'))
  lib.append(panel)
  root.append(lib)

  const backup = section('运营数据与备份', '灵感、档期、目标、复盘和内容元数据保存在 Creator 独立状态中。')
  const backupPanel = node('div', 'panel panel-pad')
  backupPanel.append(node('div', 'panel-title', `State schema ${state.schema} · revision ${state.revision}`))
  backupPanel.append(node('p', 'muted small', '导出只包含 Creator 运营状态，不复制视频、图片、topic.md 或 script.md。'))
  backupPanel.append(button('导出 JSON 备份', 'secondary', async () => {
    try {
      const result = await bridge.exportBackup()
      if (result && result.ok) toast(`备份已导出：${result.path}`)
    } catch (error) { toast(error.message, true) }
  }))
  backup.append(backupPanel)
  root.append(backup)

  const about = section('双模式', 'Standard 与 Creator 共用 DSH Runtime、Node/Git、插件、安全更新与凭据。')
  const aboutPanel = node('div', 'panel panel-pad')
  aboutPanel.append(node('div', 'panel-title', '当前：Creator 模式'))
  aboutPanel.append(node('p', 'muted small', '标准模式适合通用 Agent 与工程工作；Creator 模式适合内容、灵感、运营和复盘。模式切换会重启 Desktop Shell，以保证两套 UI 不互相污染。'))
  aboutPanel.append(button('切回标准模式', 'primary', () => bridge.switchMode('standard')))
  about.append(aboutPanel)
  root.append(about)
}

function render() {
  if (!state) return
  setHeader()
  clear(root)
  if (currentView === 'today') renderToday()
  else if (currentView === 'content') renderContent()
  else if (currentView === 'ideas') renderIdeas()
  else if (currentView === 'operations') renderOperations()
  else if (currentView === 'reviews') renderReviews()
  else renderSettings()
}

async function pickLibrary() {
  try {
    state = await bridge.pickLibrary()
    contents = await bridge.listContents()
    render()
    toast('内容目录已更新')
  } catch (error) {
    toast(error.message, true)
  }
}

function cryptoId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function openForm({ title, hint = '', fields, submitLabel = '保存', onSubmit }) {
  formTitle.textContent = title
  formHint.textContent = hint
  formSubmit.textContent = submitLabel
  clear(formFields)
  for (const spec of fields) {
    const label = node('label', '', spec.label)
    let input
    if (spec.type === 'textarea') {
      input = document.createElement('textarea')
    } else if (spec.type === 'select') {
      input = document.createElement('select')
      for (const option of spec.options || []) {
        const opt = document.createElement('option')
        opt.value = option.value === undefined ? option : option.value
        opt.textContent = option.label === undefined ? option : option.label
        input.append(opt)
      }
    } else {
      input = document.createElement('input')
      input.type = spec.type || 'text'
    }
    input.name = spec.name
    input.value = spec.value === undefined || spec.value === null ? '' : spec.value
    if (spec.placeholder) input.placeholder = spec.placeholder
    if (spec.required) input.required = true
    label.append(input)
    formFields.append(label)
  }
  formHandler = onSubmit
  formDialog.showModal()
  const first = formFields.querySelector('input,textarea,select')
  if (first) setTimeout(() => first.focus(), 30)
}

function openContentForm(sourceIdea = null) {
  openForm({
    title: sourceIdea ? '把灵感升级为内容' : '新建内容',
    hint: '创建真实文件夹，并初始化 topic.md / script.md。',
    fields: [{ name: 'title', label: '内容标题', value: sourceIdea ? sourceIdea.title : '', placeholder: '输入一个可读标题', required: true }],
    submitLabel: '创建项目',
    onSubmit: async (data) => {
      const result = await bridge.createContent(data.title, sourceIdea ? sourceIdea.id : '')
      state = result.state
      contents = await bridge.listContents()
      formDialog.close()
      setView('content')
      toast('内容项目已创建')
      openEditor(result.id)
    },
  })
}

function openIdeaForm(existing = null) {
  openForm({
    title: existing ? '编辑灵感' : '记录灵感',
    hint: '先记录事实和判断，之后再决定要不要做。',
    fields: [
      { name: 'title', label: '灵感标题', value: existing && existing.title, required: true },
      { name: 'notes', label: '补充说明', type: 'textarea', value: existing && existing.notes, placeholder: '为什么值得做？有什么证据或素材？' },
      { name: 'type', label: '内容类型', type: 'select', value: existing && existing.type, options: state.settings.contentTypes },
      { name: 'tier', label: '优先级', type: 'select', value: existing && existing.tier, options: state.settings.ideaTiers },
      { name: 'tags', label: '标签', value: existing && existing.tags.join(', '), placeholder: 'AI, 机器人, 创业' },
    ],
    onSubmit: async (data) => {
      const now = new Date().toISOString()
      if (existing) {
        existing.title = data.title
        existing.notes = data.notes
        existing.type = data.type
        existing.tier = data.tier
        existing.tags = data.tags.split(/[,，]/).map((x) => x.trim()).filter(Boolean)
        existing.updatedAt = now
      } else {
        state.ideas.unshift({ id: `idea-${cryptoId()}`, title: data.title, notes: data.notes, type: data.type, tier: data.tier, tags: data.tags.split(/[,，]/).map((x) => x.trim()).filter(Boolean), status: 'open', contentId: '', createdAt: now, updatedAt: now })
      }
      await persist(false)
      formDialog.close()
      setView('ideas')
      toast('灵感已保存')
    },
  })
}

async function promoteIdea(idea) {
  if (!state.libraryRoot) {
    toast('先选择内容目录，再把灵感升级为内容。', true)
    setView('settings')
    return
  }
  openContentForm(idea)
}

function openScheduleForm(existing = null) {
  const contentOptions = [{ value: '', label: '不关联内容' }, ...contents.map((item) => ({ value: item.id, label: item.title }))]
  openForm({
    title: existing ? '编辑档期' : '新建档期',
    fields: [
      { name: 'title', label: '事项', value: existing && existing.title, required: true },
      { name: 'date', label: '日期', type: 'date', value: existing && existing.date },
      { name: 'type', label: '类型', type: 'select', value: existing && existing.type, options: ['内容推进', '发布', '复盘', '直播', '自定义'] },
      { name: 'contentId', label: '关联内容', type: 'select', value: existing && existing.contentId, options: contentOptions },
      { name: 'notes', label: '备注', type: 'textarea', value: existing && existing.notes },
    ],
    onSubmit: async (data) => {
      if (existing) Object.assign(existing, data)
      else state.schedule.push({ id: `schedule-${cryptoId()}`, ...data, done: false })
      await persist(false)
      formDialog.close()
      setView('operations')
      toast('档期已保存')
    },
  })
}

function openGoalForm(existing = null) {
  openForm({
    title: existing ? '更新目标' : '新建目标',
    fields: [
      { name: 'title', label: '目标', value: existing && existing.title, required: true },
      { name: 'target', label: '目标值', type: 'number', value: existing && existing.target },
      { name: 'current', label: '当前值', type: 'number', value: existing && existing.current },
      { name: 'unit', label: '单位', value: existing && existing.unit || '项' },
      { name: 'deadline', label: '截止日期', type: 'date', value: existing && existing.deadline },
      { name: 'notes', label: '备注', type: 'textarea', value: existing && existing.notes },
    ],
    onSubmit: async (data) => {
      const next = { ...data, target: Number(data.target) || 0, current: Number(data.current) || 0 }
      if (existing) Object.assign(existing, next)
      else state.goals.push({ id: `goal-${cryptoId()}`, ...next })
      await persist(false)
      formDialog.close()
      setView(currentView === 'today' ? 'today' : 'operations')
      toast('目标已保存')
    },
  })
}

async function openEditor(id) {
  try {
    editing = await bridge.getContent(id)
    editingTab = 'topic'
    editorTitle.textContent = contentTitle(id)
    editorPath.textContent = editing.path
    for (const tab of editorDialog.querySelectorAll('[data-editor-tab]')) tab.classList.toggle('active', tab.dataset.editorTab === editingTab)
    editorText.value = editing.topic
    editorDialog.showModal()
  } catch (error) {
    toast(error.message, true)
  }
}

for (const tab of editorDialog.querySelectorAll('[data-editor-tab]')) {
  tab.addEventListener('click', () => {
    if (!editing) return
    if (editingTab === 'topic') editing.topic = editorText.value
    else editing.script = editorText.value
    editingTab = tab.dataset.editorTab
    editorText.value = editingTab === 'topic' ? editing.topic : editing.script
    for (const item of editorDialog.querySelectorAll('[data-editor-tab]')) item.classList.toggle('active', item === tab)
  })
}

saveContent.addEventListener('click', async () => {
  if (!editing) return
  try {
    const field = editingTab
    editing[field] = editorText.value
    editing = await bridge.writeContent(editing.id, field, editing[field])
    contents = await bridge.listContents()
    toast(`${field === 'topic' ? '选题' : '脚本'}已保存`)
    render()
  } catch (error) { toast(error.message, true) }
})

openContentFolder.addEventListener('click', () => { if (editing) bridge.openContent(editing.id).catch((e) => toast(e.message, true)) })

genericForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!formHandler) return
  const data = Object.fromEntries(new FormData(genericForm).entries())
  try {
    formSubmit.disabled = true
    await formHandler(data)
  } catch (error) {
    toast(error && error.message ? error.message : String(error), true)
  } finally {
    formSubmit.disabled = false
  }
})

nav.addEventListener('click', (event) => {
  const target = event.target.closest('[data-view]')
  if (target) setView(target.dataset.view)
})

refreshAll.addEventListener('click', () => loadAll(true))
quickIdea.addEventListener('click', () => openIdeaForm())
quickContent.addEventListener('click', () => openContentForm())
switchStandard.addEventListener('click', () => bridge.switchMode('standard'))
toggleAi.addEventListener('click', () => {
  document.querySelector('.app-shell').classList.toggle('ai-collapsed')
  toggleAi.title = document.querySelector('.app-shell').classList.contains('ai-collapsed') ? '展开 AI 面板' : '收起 AI 面板'
})

if (bridge) {
  bridge.onHarnessUrl((url) => updateRuntime(url))
  bridge.onCommand((command) => {
    if (command === 'new-content') openContentForm()
    else if (command === 'new-idea') openIdeaForm()
    else if (command === 'refresh') loadAll(true)
  })
}

loadAll()
