# Third-Party Notices

DSH Desktop bundles selected third-party components so the desktop application can work without asking users to separately download those components after installation.

## dsh-web-ui / dsh-skins

- Project: `zhu1090093659/dsh-web-ui`
- Bundled package: `@linxin666/dsh-skins`
- Bundled version: `0.1.18`
- License: Apache License 2.0
- Purpose in DSH Desktop: in-GUI skin center and the skin assets shipped by the aggregate package.

DSH Desktop does not claim authorship or ownership of dsh-web-ui. Copyright and attribution remain with the upstream authors and contributors. The upstream package license and package metadata remain present inside the packaged `node_modules/@linxin666/dsh-skins` tree.

The bundled package is pinned to a tested version and is linked into DSH Desktop's private `web` profile from the local installation. DSH Desktop does not automatically fetch `@latest` at user startup.
