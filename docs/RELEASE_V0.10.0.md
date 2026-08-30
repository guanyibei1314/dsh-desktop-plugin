# DSH Desktop v0.10.0 Release Marker

This file records the release-trigger PR for DSH Desktop v0.10.0.

## Validated candidate

- Feature PR: #27 (`feat: v0.10.0 dual Standard and Creator modes`)
- Feature merge commit: `082bdae735b63367b2cca3c96bacffa6484575b3`
- Windows candidate workflow: run #156
- Candidate result: full Windows build gates passed
- Standard packaged smoke: passed
- Creator packaged smoke: passed
- Node.js / npm / Git / Machine PATH E2E: passed
- Installed DSH Runtime update chain: passed
- Installed live marketplace/security preflight: passed
- Three-round clean-install / cold-start / restart / uninstall E2E: passed
- Package audit and installer SHA-256 generation: passed

## Release policy

The merge commit for this PR must start with `release:` so `.github/workflows/windows-build.yml` performs the complete Windows build again on `main`, re-verifies the generated artifact, and only then creates or updates the versioned GitHub Release.

The GitHub Release page and its uploaded assets remain the authoritative evidence that v0.10.0 is formally published.
