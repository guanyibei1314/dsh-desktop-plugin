'use strict'
/**
 * Creator topic/script editor state, shared by the page (window.CreatorEditorState)
 * and Node tests. Each tab keeps its own draft; saving writes every field that
 * differs from what was last read or written, so switching tabs never drops
 * edits made in the other one.
 */
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.CreatorEditorState = api
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const FIELDS = ['topic', 'script']

  function text(value) {
    return typeof value === 'string' ? value : ''
  }

  /** Editor state for one content item as returned by getContent(). */
  function open(content) {
    const saved = { topic: text(content && content.topic), script: text(content && content.script) }
    return {
      id: content && content.id,
      path: content && content.path,
      tab: 'topic',
      saved,
      draft: { topic: saved.topic, script: saved.script },
    }
  }

  /** Record the textarea for the active tab, switch, and return the next tab's text. */
  function switchTab(state, currentText, nextTab) {
    if (!FIELDS.includes(nextTab)) throw new Error(`unknown editor tab: ${nextTab}`)
    state.draft[state.tab] = text(currentText)
    state.tab = nextTab
    return state.draft[nextTab]
  }

  function dirtyFields(state, currentText) {
    if (currentText !== undefined) state.draft[state.tab] = text(currentText)
    return FIELDS.filter((field) => state.draft[field] !== state.saved[field])
  }

  /**
   * Write every modified field through writeContent(id, field, text), which
   * resolves to the content as stored. A failure stops with the remaining
   * drafts kept, so nothing typed is lost.
   */
  async function saveDirty(state, currentText, writeContent) {
    const fields = dirtyFields(state, currentText)
    const written = []
    for (const field of fields) {
      const stored = await writeContent(state.id, field, state.draft[field])
      state.saved[field] = text(stored && stored[field])
      state.draft[field] = state.saved[field]
      written.push(field)
    }
    return written
  }

  return { FIELDS, dirtyFields, open, saveDirty, switchTab }
})
