# Delta Voice Tool 1.2.1

Delta Voice Tool is a focused Electron DAW-style editor for replacing voice takes without changing filenames or formats. The original file stays untouched until an explicit **Save take** confirmation.

## Run

```bash
npm install
npm start
```

Choose a folder, select an audio file, choose a microphone, and use the single timeline to arrange clips or record a take. WAV, MP3, OGG, FLAC, M4A, AAC, Opus, AIFF, and WMA are recognized. Folder search, recursive scanning, green saved states, themes, microphone selection, drag/drop, and project persistence are retained.

## Timeline workflow

- The source, latest recorded take, and dropped audio files are all timeline layers. Drop one or more audio files onto the timeline; each becomes its own lane.
- Drag any clip body to move it. Drag either edge to trim. Selected clips expose start, trim, fade, volume, mute, solo, and remove controls.
- Click a lane's **M** or **S** buttons for mute/solo. Mute the source lane when you want a replacement-style export. A selected clip can be split at the playhead with **Split at playhead** or `X`.
- Recording grows as a live Audacity-style clip in the TAKE lane. When stopped, it becomes a normal editable clip with the same controls as every other layer.
- Use **Snap** for 50 ms grid movement, `+`/`−` for waveform zoom, and **Fit** to show the complete arrangement. The timeline scrolls horizontally at higher zoom levels.
- Take history keeps prior recordings available during the session. Older metadata is restored safely, but large audio buffers are never placed in localStorage.

Preview rendering uses `OfflineAudioContext`; exports are converted with the bundled ffmpeg and preserve the selected source extension/format.

## Shortcuts

- `Space`: play/pause
- `R`: record
- `S`: stop
- `X`: split selected clip at playhead
- `Left` / `Right`: move playhead by 100 ms (`Shift` = 1 second)
- `Delete` / `Backspace`: remove selected clip
- `Ctrl/Cmd+Z`: undo
- `Ctrl/Cmd+Shift+Z`: redo
- `Ctrl/Cmd+Shift+R`: record another take
- `Ctrl/Cmd+S`: save (asks before overwriting)

## Build Windows packages

On Windows, or from a machine configured for Windows targets:

```bash
npm install
npm run smoke
npm run dist:win
```

The `dist` folder contains an NSIS installer and portable executable named `Delta Voice Tool-1.2.1-*.exe`. The package includes `resources/ffmpeg.exe`, so users do not need Node.js or ffmpeg installed.

## Notes

Microphone permissions are controlled by the operating system. Folder scanning is top-level unless **Include subfolders** is enabled. Editor metadata is stored per selected source path; audio buffers remain in memory and temporary takes are discarded after they are saved or the app closes.
