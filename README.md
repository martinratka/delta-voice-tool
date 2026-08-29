# Delta Voice Tool

Delta Voice Tool is a desktop voice-take editor for quickly recording, reviewing, editing, and replacing audio files without changing their filenames or formats.

## Download and run

### Windows

1. Open the [Releases page](https://github.com/martinratka/delta-voice-tool/releases).
2. Download the file ending in `-x64.exe`.
3. Run the installer and follow the prompts.
4. Launch Delta Voice Tool from the desktop shortcut or Start Menu.

The Windows installer includes FFmpeg and does not require Node.js or any other separate dependency. Installed copies check for new releases whenever they start and offer to install updates when available.

**The installer is recommended.** The portable executable does not install desktop shortcuts and cannot update itself as reliably, so portable users should download and replace it manually when a new release is published.

### Linux / Omarchy

Clone the repository once:

```bash
git clone https://github.com/martinratka/delta-voice-tool.git
cd delta-voice-tool
npm install
npm start
```

For later updates:

```bash
cd delta-voice-tool
git pull
npm start
```

You can also download the Linux AppImage from Releases, mark it executable, and run it directly.

## Basic workflow

Choose an audio folder, select a file, and record or drop audio into the timeline. Clips can be moved, trimmed, faded, split, and adjusted for volume. Save overwrites the selected file while preserving its original extension.

Quick Mode starts recording while `R` is held and stops when it is released. Auto Save can be enabled inside Quick Mode to save each completed take and advance to the next file automatically.

## Build

```bash
npm install
npm run smoke
npm run dist:win
```

The Windows builds are written to `dist/`. The installer is recommended because it creates shortcuts and supports automatic updates; the portable executable is intended for manual or temporary use.

## Supported audio

WAV, MP3, OGG, FLAC, M4A, AAC, Opus, AIFF, and WMA.
