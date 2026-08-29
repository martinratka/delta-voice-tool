const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const bundledFfmpeg = require('ffmpeg-static');
const { autoUpdater } = require('electron-updater');

const SUPPORTED_EXTENSIONS = new Set([
  '.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.aiff', '.aif', '.wma'
]);
const MIME_TYPES = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.opus': 'audio/ogg; codecs=opus',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.wma': 'audio/x-ms-wma'
};

let mainWindow;
let activeFolder = null;
let temporaryDirectory;
let updatePromptOpen = false;
let updateAvailableVersion = null;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function checkForUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch((error) => {
    console.warn('Could not check for updates:', error.message);
  });
}

autoUpdater.on('update-available', async (info) => {
  updateAvailableVersion = info.version;
  if (updatePromptOpen) return;
  updatePromptOpen = true;
  try {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Install update', 'Skip'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update found',
      message: 'Update found',
      detail: `Delta Voice Tool ${info.version} is available. Install it now?`
    });
    if (result.response === 0) {
      await autoUpdater.downloadUpdate();
      const installResult = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['Restart and install', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update ready',
        message: 'Update downloaded',
        detail: 'Restart Delta Voice Tool to finish installing the update.'
      });
      if (installResult.response === 0) autoUpdater.quitAndInstall();
    }
  } catch (error) {
    console.warn('Could not install update:', error.message);
  } finally {
    updatePromptOpen = false;
  }
});

autoUpdater.on('error', (error) => {
  console.warn('Update check failed:', error.message);
});

function isWithin(child, parent) {
  const childPath = path.resolve(child);
  const parentPath = path.resolve(parent);
  return childPath === parentPath || childPath.startsWith(`${parentPath}${path.sep}`);
}

function assertSupportedAudio(filePath) {
  if (!SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    throw new Error('That file type is not supported.');
  }
}

async function listAudioFiles(folder, recursive = false) {
  const files = [];
  async function visit(directory) {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory() && recursive) {
        await visit(entryPath);
      } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const stats = await fsp.stat(entryPath);
        files.push({
          name: entry.name,
          format: path.extname(entry.name).slice(1).toUpperCase(),
          path: entryPath,
          relativePath: path.relative(folder, entryPath),
          modifiedAt: stats.mtimeMs
        });
      }
    }
  }
  await visit(folder);
  return files;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const packagedWindowsFfmpeg = path.join(process.resourcesPath, 'ffmpeg.exe');
    const ffmpegPath = process.platform === 'win32' && fs.existsSync(packagedWindowsFfmpeg)
      ? packagedWindowsFfmpeg
      : bundledFfmpeg
        ? bundledFfmpeg.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
        : 'ffmpeg';
    const childProcess = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...args], {
      windowsHide: true
    });
    let stderr = '';
    childProcess.stderr.on('data', (data) => { stderr += data.toString(); });
    childProcess.on('error', (error) => {
      if (error.code === 'ENOENT' || error.code === 'EACCES') {
        reject(new Error(`The bundled audio converter could not be started (${error.code}). Reinstall Delta Voice Tool and try again.`));
      } else {
        reject(error);
      }
    });
    childProcess.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

function outputArguments(extension) {
  switch (extension.toLowerCase()) {
    case '.wav': return ['-c:a', 'pcm_s16le'];
    case '.mp3': return ['-c:a', 'libmp3lame', '-q:a', '2'];
    case '.ogg': return ['-c:a', 'libvorbis', '-q:a', '5'];
    case '.flac': return ['-c:a', 'flac'];
    case '.m4a': return ['-c:a', 'aac', '-b:a', '192k'];
    case '.aac': return ['-c:a', 'aac', '-b:a', '192k', '-f', 'adts'];
    case '.opus': return ['-c:a', 'libopus', '-b:a', '128k'];
    case '.aiff':
    case '.aif': return ['-c:a', 'pcm_s16be'];
    case '.wma': return ['-c:a', 'wmav2', '-b:a', '192k'];
    default: throw new Error(`Unsupported output format: ${extension}`);
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1640,
    height: 1040,
    minWidth: 1100,
    minHeight: 800,
    backgroundColor: '#11151b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  await mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function registerIpc() {
  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) return { available: false, development: true };
    updateAvailableVersion = null;
    await autoUpdater.checkForUpdates();
    return { available: Boolean(updateAvailableVersion), version: updateAvailableVersion };
  });

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose an audio folder',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return null;
    activeFolder = path.resolve(result.filePaths[0]);
    return {
      folder: activeFolder,
      files: await listAudioFiles(activeFolder, false)
    };
  });

  ipcMain.handle('list-files', async (_event, { folder, recursive = false } = {}) => {
    if (!folder || !fs.existsSync(folder)) throw new Error('That folder no longer exists.');
    activeFolder = path.resolve(folder);
    return listAudioFiles(activeFolder, Boolean(recursive));
  });

  ipcMain.handle('load-audio', async (_event, { filePath } = {}) => {
    if (!activeFolder || !filePath || !isWithin(filePath, activeFolder)) {
      throw new Error('The selected audio file is outside the chosen folder.');
    }
    assertSupportedAudio(filePath);
    const stats = await fsp.stat(filePath);
    if (!stats.isFile()) throw new Error('The selected path is not a file.');
    const buffer = await fsp.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    return {
      filePath,
      name: path.basename(filePath),
      format: extension.slice(1).toUpperCase(),
      mime: MIME_TYPES[extension] || 'application/octet-stream',
      data: buffer.toString('base64')
    };
  });

  ipcMain.handle('load-dropped-audio', async (_event, { filePath } = {}) => {
    if (!filePath || !path.isAbsolute(filePath)) {
      throw new Error('Drop an audio file from your computer.');
    }
    assertSupportedAudio(filePath);
    const stats = await fsp.stat(filePath).catch(() => null);
    if (!stats?.isFile()) throw new Error('The dropped path is not a file.');
    if (stats.size > 250 * 1024 * 1024) throw new Error('Dropped audio files must be smaller than 250 MB.');
    const buffer = await fsp.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    return {
      filePath,
      name: path.basename(filePath),
      format: extension.slice(1).toUpperCase(),
      mime: MIME_TYPES[extension] || 'application/octet-stream',
      data: buffer.toString('base64')
    };
  });

  ipcMain.handle('save-recording-temp', async (_event, { data, extension = 'webm' } = {}) => {
    if (typeof data !== 'string' || !data) throw new Error('No recording data was received.');
    const safeExtension = String(extension).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'webm';
    const filePath = path.join(temporaryDirectory, `take-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${safeExtension}`);
    await fsp.writeFile(filePath, Buffer.from(data, 'base64'));
    return filePath;
  });

  ipcMain.handle('discard-recording-temp', async (_event, { tempPath } = {}) => {
    if (tempPath && isWithin(tempPath, temporaryDirectory)) {
      await fsp.rm(tempPath, { force: true });
    }
  });

  ipcMain.handle('save-take', async (_event, { sourcePath, tempPath } = {}) => {
    if (!activeFolder || !sourcePath || !isWithin(sourcePath, activeFolder)) {
      throw new Error('The original file is outside the chosen folder.');
    }
    if (!tempPath || !isWithin(tempPath, temporaryDirectory)) {
      throw new Error('The temporary recording is invalid or has expired.');
    }
    assertSupportedAudio(sourcePath);
    const sourceStats = await fsp.stat(sourcePath).catch(() => null);
    if (!sourceStats?.isFile()) throw new Error('The original audio file no longer exists.');
    const tempStats = await fsp.stat(tempPath).catch(() => null);
    if (!tempStats?.isFile()) throw new Error('The temporary recording no longer exists.');

    const extension = path.extname(sourcePath).toLowerCase();
    const stagingPath = path.join(temporaryDirectory, `export-${crypto.randomBytes(8).toString('hex')}${extension}`);
    try {
      await runFfmpeg(['-y', '-i', tempPath, '-map_metadata', '0', ...outputArguments(extension), stagingPath]);
      await fsp.copyFile(stagingPath, sourcePath);
      return { name: path.basename(sourcePath), format: extension.slice(1).toUpperCase() };
    } finally {
      await fsp.rm(stagingPath, { force: true }).catch(() => {});
      await fsp.rm(tempPath, { force: true }).catch(() => {});
    }
  });
}

app.whenReady().then(async () => {
  temporaryDirectory = path.join(app.getPath('userData'), 'temporary-takes');
  await fsp.mkdir(temporaryDirectory, { recursive: true });
  registerIpc();
  await createWindow();
  setTimeout(checkForUpdates, 1500);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
