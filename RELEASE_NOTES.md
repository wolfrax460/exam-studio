# Exam Studio 0.2.1

## Summary
This release fixes desktop startup and makes update tracking automatic for the desktop app.

## Bug fixes
- Fixed `waitForServer is not defined` during Electron startup.
- Rebuilt the packaged desktop launch flow so it waits for the embedded server before opening the window.

## New features
- Version tracking is enabled by default for the desktop app using this repository's GitHub Releases (`wolfrax460/exam-studio`).
- Incremental app changes continue across the notes library, handout/manual-note, exam editing, export, theme/sidebar UI, cancellation, and diagnostics.

## Verification
- Server tests: 177 passing.
- Client tests: 15 passing.
- Client build and server syntax checks passed during development.

## Notes
Download the Windows installer/portable executable or Linux AppImage/.deb from this release rather than repeatedly installing unrelated packages.