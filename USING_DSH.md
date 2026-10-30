# Using dsh directly in Exam Studio

Exam Studio can invoke the `dsh` (DeepSeek Harness) command‑line tool from within the running app. This allows you to inspect the current environment, check version information, or run custom inspections without leaving the UI.

## How it works

1. **Prerequisites**  
   - The `dsh` binary must be installed and on your `PATH` (or available via `which dsh`).  
   - The app must be running (either the desktop desktop or the web version served by the local server).

2. **Using the built‑in command**  
   - Open the **Settings** page (click the gear icon in the top‑right).  
   - Press the **“Run dsh”** button.  
   - A small modal will appear showing the output of `dsh --version` (or `dsh info` if you prefer).  
   - The output is also written to the browser console for debugging.

3. **Custom commands**  
   - If you need a custom `dsh` invocation, edit the `dshCommand` constant in `client/src/settings.js` (or ask an administrator to do so).  
   - The default command is `dsh --version`; you can replace it with any valid `dsh` sub‑command.

4. **Disabling the feature**  
   - To disable the button, set the environment variable `EXAM_DSH_ENABLED` to `false` before starting the app.

## Example

```bash
# From the app UI:
# 1. Open Settings
# 2. Click “Run dsh”
# 3. You should see something like:
#
#   dsh version: 0.2.1
#   Active provider: OpenCode (terminal)
#   Model: opencode/beam-free
```

## Development

If you are a developer and want to add a new `dsh` sub‑command:

1. Open `client/src/settings.js`.  
2. Locate the `dshCommand` constant (near the top).  
3. Change the command string to your desired `dsh` sub‑command.  
4. Re‑run `npm run build` to rebuild the client.

---

**Note:** The feature is opt‑in; if the environment variable `EXAM_DSH_ENABLED` is not set, the button will not appear.