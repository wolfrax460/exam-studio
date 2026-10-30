# Skill: Exam Studio Release

## Purpose
Use this runbook to release Exam Studio after upgrade work.

## Inputs
- Repository: https://github.com/wolfrax460/exam-studio
- Target version bump in `package.json`, `server/package.json`, and `client/package.json`
- Tag prefix: `v` (example: `v0.2.1`)

## Steps
1. Run all tests:
   - `npm --prefix server test`
   - `npm --prefix client test`
2. Run the app build:
   - `npm run build`
3. Optionally build desktop packages for local verification:
   - `npm run dist:win`
   - `npm run dist:linux`
4. Commit and push to `main`.
5. Create and push an annotated tag:
   - `git tag -a vX.Y.Z -m "Exam Studio X.Y.Z ..."`
   - `git push origin vX.Y.Z`
6. The GitHub Actions release workflow will:
   - run tests
   - build web/server assets
   - build Windows and Linux desktop packages
   - create/publish the GitHub Release with release notes from `RELEASE_NOTES.md`
7. Update `RELEASE_NOTES.md` before the tag for the release.
8. Desktop apps track GitHub Releases from `wolfrax460/exam-studio` through `server/lib/version.js` and Electron startup defaults.

## Verification Checklist
- Version reaches GitHub through the tag.
- Release workflow succeeds (`Actions` tab).
- `release/*` assets are attached to the release.
- Desktop app shows the update from the older local version.