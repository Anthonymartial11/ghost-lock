# Lock Watch

Tells you the moment anything uses your microphone or camera — and names the app.

## Why this exists
On iPhone, no third-party app can detect another app using the mic. Apple's
sandbox forbids it; the OS itself (orange dot, App Privacy Report) is the only
honest source. **On a Mac, it's different** — macOS exposes, per running process,
whether that process is taking audio input, and whether each camera is in use.
Lock Watch reads exactly that.

## Build & install
```bash
~/ghost-lock/mac/LockWatch/build.sh
open "/Applications/Lock Watch.app"
```
No dependencies. Nothing is downloaded. It compiles from the single source file
next to this README.

Then: click the padlock in the menu bar → **Start at login**.

## Test it in 5 seconds
Open **Voice Memos** and press record. The alarm should fire immediately and name
the app. Stop the recording and the menu bar goes quiet again.

## What it does
- Polls once a second: which processes hold microphone input, which cameras are on
- Alerts with a floating panel + sound the instant something starts
- Menu bar icon shows live state (padlock = quiet, mic/camera = in use)
- Keeps a history at `~/Library/Application Support/LockWatch/history.json`

## Honest limits
- It reports **use, not intent**. A video call lights it up exactly like spyware.
  Its value is catching use *you did not start*.
- It runs as a normal app, so it cannot see below the operating system. A
  compromised OS or firmware could hide from it.
- It needs **no special permissions** and has **no network code whatsoever** —
  nothing it observes ever leaves your Mac.
