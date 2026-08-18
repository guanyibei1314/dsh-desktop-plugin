# Third-Party Notices

DSH Desktop bundles selected third-party components so the desktop application can work without asking users to separately download those components after installation.

## Node.js

- Project: Node.js
- Bundled installer: official Windows x64 MSI
- Bundled version in DSH Desktop v0.9.0: `24.19.0` LTS
- Upstream: `nodejs/node` / `nodejs.org`
- Primary license: MIT License
- Purpose in DSH Desktop: provide a normal, system-installed Node.js/npm development environment for users who do not already have a working Node.js on `PATH`.

DSH Desktop redistributes the unmodified official Node.js installer. The build pipeline pins the official source URL and SHA-256 and requires a valid Authenticode signature before the installer may be embedded. Node.js contains externally maintained libraries with their own licenses; the authoritative license notices are distributed by the Node.js project and remain applicable to the installed product.

DSH Desktop does not automatically select Node.js' optional native-module build-tools flow. In particular, it does not intentionally install Python or Visual Studio Build Tools as a side effect of installing Node.js.

## Git for Windows

- Project: Git for Windows / Git
- Bundled installer: official full Windows x64 installer (not MinGit and not PortableGit)
- Bundled version in DSH Desktop v0.9.0: `2.55.0.windows.3`
- Upstream: `git-for-windows/git` / `gitforwindows.org`
- Git license: GNU General Public License version 2
- Purpose in DSH Desktop: provide a normal, system-installed Git environment, including the full Git for Windows distribution, for users who do not already have a working Git on `PATH`.

Git for Windows also distributes components such as Bash, curl, OpenSSH, MSYS2 and other tools that are governed by their respective licenses. Their upstream license files and notices remain authoritative. DSH Desktop does not claim authorship or ownership of Git, Git for Windows, or those bundled components.

The DSH build pipeline pins the official Git for Windows release URL and SHA-256 and requires a valid Authenticode signature before embedding the installer. Installation uses Git for Windows' `Cmd` PATH mode so `git` is available to Windows shells without intentionally placing the full Unix utility set ahead of Windows system commands.

Node.js and Git for Windows are installed as independent products. Uninstalling DSH Desktop does not uninstall them or intentionally remove the PATH entries owned by their official installers.

## dsh-web-ui / dsh-skins

- Project: `zhu1090093659/dsh-web-ui`
- Bundled package: `@linxin666/dsh-skins`
- Bundled version: `0.1.18`
- License: Apache License 2.0
- Purpose in DSH Desktop: in-GUI skin center and the skin assets shipped by the aggregate package.

DSH Desktop does not claim authorship or ownership of dsh-web-ui. Copyright and attribution remain with the upstream authors and contributors. The upstream package license and package metadata remain present inside the packaged `node_modules/@linxin666/dsh-skins` tree.

The bundled package is pinned to a tested version and is linked into DSH Desktop's private `web` profile from the local installation. DSH Desktop does not automatically fetch `@latest` at user startup.
