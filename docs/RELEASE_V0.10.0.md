# DSH Desktop v0.10.0 Release Evidence

DSH Desktop v0.10.0 has been formally published.

## Release identity

- Feature PR: #27 (`feat: v0.10.0 dual Standard and Creator modes`)
- Feature merge commit: `082bdae735b63367b2cca3c96bacffa6484575b3`
- Release PR: #28 (`release: v0.10.0`)
- Release commit: `db298476c9164f1e47e6b1001b31416dcabcd489`
- Formal Windows release workflow: run #160
- Build result: `success`
- Publish result: `success`
- Tag: `v0.10.0`
- Release: `DSH Desktop 0.10.0`
- Published: 2026-08-30

Release page:

```text
https://github.com/guanyibei1314/dsh-desktop-plugin/releases/tag/v0.10.0
```

## Published assets

```text
DSH-Desktop-Setup-0.10.0.exe
DSH-Desktop-Setup-0.10.0.exe.sha256
DSH-Desktop-Setup-0.10.0.exe.blockmap
latest.yml
```

Windows installer size reported by GitHub Release: `221925769` bytes.

Windows installer SHA-256:

```text
7d406533c4e1427f8b9a9056b4c0b07e9a533ad7332676b980180bfabb57a729
```

## Verified release gates

The formal main-branch release run rebuilt and re-verified the release candidate before publishing. It passed:

- dependency install from committed lock;
- toolchain manifest checks;
- live official Node/Git latest gates;
- static syntax and Dual Mode security hardening tests;
- DSH Runtime functional/red-blue/maintenance tests;
- official DSH identity verification;
- source Runtime provenance + activation probe;
- plugin market functional + red-blue tests;
- Node/Git binary download, SHA-256 and Authenticode verification;
- Windows NSIS installer build;
- packaged Standard smoke;
- packaged Creator smoke;
- packaged plugin/skin checks;
- installed Node/npm/Git/Machine PATH and PATH-hijack regression;
- installed official Runtime update chain;
- installed live plugin market/security preflight;
- three clean-install / cold-start / restart / uninstall cycles;
- package size audit;
- installer SHA-256 generation;
- artifact upload;
- publish-stage artifact download and SHA-256 re-verification;
- versioned GitHub Release creation.

The GitHub Release page and uploaded `.sha256` asset are the authoritative distribution evidence for v0.10.0.
