'use strict'

// Load desktop-owned extensions before the legacy main process so we can add
// menus and isolated capability windows without widening the DSH Web renderer
// privilege boundary.
require('./desktop-extensions').registerDesktopExtensions()
require('./main.js')
