---
name: exam-studio-release
description: Release Exam Studio desktop builds to GitHub Releases, including version bumps, tests, app builds, release notes, tag push, asset upload, and version-tracking checks.
---

# Exam Studio Release

Use this skill when asked to release, publish, tag, build, or upload a new version of Exam Studio (`https://github.com/wolfrax460/exam-studio`).

## Tool Availability

Prefer the repository scripts already provided by Exam Studio:
- `npm test`
- `npm run build`
- `npm run dist:win`
- `npm run dist:linux`

Use GitHub REST APIs with the `gho_` token from the local git credential manager when GitHub Actions cannot complete Linux/Windows packaging. Do not expose tokens in committed files.

## Release Workflow

1. Verify repository cleanliness:
   ```bash
   git status --short
   ```
2. Bump `version` in:
   - `package.json`
   - `server/package.json`
   - `client/package.json`
3. Run:
   ```bash
   npm test
   npm run build
   ```
4. Type-test desktop build:
   ```bash
   npm run dist:win
   ```
   or `npm run dist:linux` when the Linux build tooling is available.
5. Edit `RELEASE_NOTES.md` for the exact version.
6. Commit and push `main`:
   ```bash
   git add -A
   git commit -m "Release Exam Studio <version>"
   git push origin HEAD:main
   ```
7. Create and push tag:
   ```bash
   git tag -a v<version> -m "Exam Studio <version> ..."
   git push origin v<version>
   ```

## GitHub Release Assets

- Ensure the GitHub Release uses tag `v<version>`.
- Upload produced installers and portable archives.
- Upload a zipped `release/win-unpacked` portable bundle if MSI/NSIS installation fails locally.
- Source/legacy `.env` handling:
   - default desktop update repository is `wolfrax460/exam-studio`
   - web dev servers still require `UPDATE_REPO` or settings configured when testing update checks

## Version Tracking

Exam Studio tracks updates using GitHub Releases for `wolfrax460/exam-studio` (desktop default), with optional env/settings override. Do not configure a release GitHub without confirming the tag exists.

## Verification Checklist

- server tests pass
- client tests pass
- app build succeeds
- packaged artifacts exist
- tag exists remotely
- release body points to the correct release notes
- all uploaded release assets are completed, not partials
- desktop update check sees the new tag when comparing older versions

## Failure Handling

- If NSIS builds hang, cancel the process and produce a zipped portable bundle from `release/win-unpacked`.
- If Linux AppImage downloads fail due timeout, publish Linux artifacts only after successful rerun; do not mark them complete prematurely.
- If GitHub Actions fails, use the local manual release flow instead of leaving the tag unattached.
