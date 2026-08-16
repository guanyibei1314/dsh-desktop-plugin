# DSH Desktop 0.5.0

- Bundles `@linxin666/dsh-skins@0.1.18` with Skin Center and 10 skin assets.
- Registers bundled skins from the packaged local path into the private DSH `web` Profile with pnpm offline mode; no runtime skin download or automatic `@latest` fetch.
- Keeps SSH, Remote Web, task execution, image understanding, Liangshen mode and other higher-privilege `dsh-web-ui` extensions optional through Plugin Manager.
- Preserves Terminal, Plugin Manager, Browser, Sites and bundled DSH.
- Adds third-party attribution and license notice.
- CI verifies packaged runtime closure, final EXE smoke, bundled pnpm, offline skin Profile reconciliation, physical link target, and installer size.
- PR candidate installer: 127,377,120 bytes (121.48 MiB), +878,118 bytes (~0.84 MiB) vs v0.4.0.
