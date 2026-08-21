# Third-Party Notices

DSH Desktop bundles selected third-party components so the desktop application can work without asking users to separately download those components after installation.

## Node.js

- Project: Node.js
- Bundled installer: official Windows x64 MSI
- Bundled version: `24.19.0` (LTS)
- Upstream: `https://nodejs.org/`
- Source/release archive: `https://nodejs.org/download/release/v24.19.0/`
- License: Node.js is distributed under the MIT license; bundled dependencies retain their respective upstream licenses.
- Purpose in DSH Desktop: install a normal system Node.js/npm environment for users who do not already have a usable Node.js command on `PATH`.

The Node.js MSI is not modified by DSH Desktop. The v0.9.0 build downloads it from the pinned official Node.js HTTPS release location and verifies the published SHA-256 plus a valid Authenticode signature before embedding it into the DSH Desktop installer.

## Git for Windows

- Project: Git for Windows
- Bundled installer: official full Windows x64 installer (not MinGit and not PortableGit)
- Bundled version: `2.55.0(5)` / upstream tag `v2.55.0.windows.5`
- Upstream: `https://gitforwindows.org/`
- Source/release: `https://github.com/git-for-windows/git/releases/tag/v2.55.0.windows.5`
- License: Git is GPL-2.0; Git for Windows also distributes Bash, OpenSSL, OpenSSH, Git LFS, Git Credential Manager and other components under their respective upstream licenses.
- Purpose in DSH Desktop: install the complete normal Git for Windows experience, including Git Bash/GUI and standard command-line integration, for users who do not already have a usable Git command on `PATH`.

The Git for Windows installer is not modified by DSH Desktop. The v0.9.0 build downloads it from the pinned official GitHub release URL and verifies the upstream SHA-256 plus a valid Authenticode signature before embedding it. The upstream installer retains its own license/notice material and installs Git as an independent Windows product.

DSH Desktop uninstall does not uninstall Node.js or Git for Windows and does not remove environment entries owned by those independent installers.

## dsh-web-ui / dsh-skins

- Project: `zhu1090093659/dsh-web-ui`
- Bundled package: `@linxin666/dsh-skins`
- Bundled version: `0.1.18`
- License: Apache License 2.0
- Purpose in DSH Desktop: in-GUI skin center and the skin assets shipped by the aggregate package.

DSH Desktop does not claim authorship or ownership of dsh-web-ui. Copyright and attribution remain with the upstream authors and contributors. The upstream package license and package metadata remain present inside the packaged `node_modules/@linxin666/dsh-skins` tree.

The bundled package is pinned to a tested version and is linked into DSH Desktop's private `web` profile from the local installation. DSH Desktop does not automatically fetch `@latest` at user startup.
