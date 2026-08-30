# DSH Desktop v0.10.0 — Dual Mode

DSH Desktop v0.10.0 uses one Windows installer and one validated DeepSeek Harness Runtime, with two switchable desktop work modes.

## Standard

Standard mode is the existing DSH Desktop experience. It keeps the normal Harness session UI and the existing desktop integrations:

- managed DSH Runtime update and rollback;
- plugin market and security preflight;
- Skin Center;
- built-in terminal;
- built-in browser and Sites;
- tray, notifications and desktop menu integration;
- full system Node.js and Git installed by the Windows setup when missing.

## Creator

Creator mode is a local-first content and operations workspace built into DSH Desktop for Windows.

The first v0.10.0 baseline contains:

- **Today** — recent content, due work and goal summary;
- **Content** — real local content folders, stage detection, topic/script editing;
- **Ideas** — capture, tag and promote an idea into a real content project;
- **Operations** — one schedule and measurable goals;
- **Reviews** — result, what worked, problems and next experiment;
- **Settings / Backup** — choose the library root and export Creator operational state;
- **DSH conversation** — the same DSH Runtime is shown beside the Creator workspace.

Creator intentionally does not require Screen Studio, macOS-only tools or automatic social publishing. Those can be added later as optional capabilities without making the Windows core depend on them.

## Mode switching

The selected mode is stored in Desktop `settings.json` as:

```json
{
  "desktopMode": "standard"
}
```

or:

```json
{
  "desktopMode": "creator"
}
```

Switching mode persists the new value and relaunches the Desktop shell. A clean relaunch is intentional: Creator and the native DSH sidebar are not mounted into the same renderer, which avoids cross-mode UI/plugin state conflicts.

The command-line test overrides are:

```text
--standard-mode
--creator-mode
--desktop-mode=standard
--desktop-mode=creator
```

## Shared versus isolated data

Shared between both modes:

- DSH Runtime and managed Runtime updates;
- DSH home / credentials;
- Node.js and Git system toolchain;
- plugin/runtime security infrastructure;
- packaged DSH skin dependencies.

Creator-specific operational state lives under Desktop user data:

```text
creator/
├── state.json
└── creator.log
```

Content itself does **not** live there. The user chooses a normal local folder and each project remains an ordinary directory, for example:

```text
Content/
└── 2026-08-30_Humanoid_Robot_Update/
    ├── topic.md
    ├── script.md
    ├── video.mp4
    ├── video.srt
    └── cover_16x9.png
```

This directory is the content source of truth. Creator does not keep a second copy of the topic or script in its operational JSON state.

## Creator filesystem safety boundary

The v0.10.0 Creator host:

- resolves the selected library to a real local directory;
- rejects traversal-style content IDs;
- refuses symlink content directories;
- only edits allowlisted `topic.md` and `script.md` files;
- refuses symlink/non-file editor targets;
- caps editable text at 2 MiB;
- writes text using temp-file then rename/copy fallback;
- sends renderer operations through a narrow context-isolated preload bridge.

The Creator BrowserWindow uses a dedicated session partition, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and deny-by-default Electron permission handlers.

## Product/reference note

The local-first creator-workbench direction was informed by community DSH projects including the MIT-licensed `Jackywxsz/DSH-Creator`. DSH Desktop v0.10.0 implements its own Windows-oriented Creator shell and does not reuse the Jacky Creator name, logos, character/IP artwork or other separately protected brand assets.

## Release gate

Both modes are checked before a Windows Release:

1. syntax + security regression tests;
2. dual-mode state/path tests;
3. Runtime and plugin red-blue tests;
4. official Node/Git source checks;
5. full Windows installer build;
6. packaged Standard smoke;
7. packaged Creator smoke;
8. installed Runtime / market / Node/Git E2E;
9. three clean-install / cold-start / restart / uninstall rounds;
10. package-size audit;
11. installer SHA-256 generation and Release re-verification.

Unsigned community builds are permitted by the current DSH Desktop release policy; an artifact that carries a malformed/invalid signature must still fail verification. Official embedded Node.js and Git installers continue to require their expected hashes and Authenticode publishers.
