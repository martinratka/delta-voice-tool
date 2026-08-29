const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
const listen = (channel, callback) => ipcRenderer.on(channel, (_event, payload) => callback(payload));

contextBridge.exposeInMainWorld('voiceTakes', Object.freeze({
  selectFolder: () => invoke('select-folder'),
  listFiles: (folder, recursive) => invoke('list-files', { folder, recursive }),
  loadAudio: (filePath) => invoke('load-audio', { filePath }),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  loadDroppedAudio: (filePath) => invoke('load-dropped-audio', { filePath }),
  saveRecordingTemp: (data, extension) => invoke('save-recording-temp', { data, extension }),
  discardRecordingTemp: (tempPath) => invoke('discard-recording-temp', { tempPath }),
  saveTake: (sourcePath, tempPath) => invoke('save-take', { sourcePath, tempPath }),
  checkForUpdates: () => invoke('check-for-updates'),
  downloadUpdate: () => invoke('download-update'),
  installUpdate: () => invoke('install-update'),
  onUpdateAvailable: (callback) => listen('update-available', callback),
  onUpdateProgress: (callback) => listen('update-progress', callback),
  onUpdateDownloaded: (callback) => listen('update-downloaded', callback),
  onUpdateError: (callback) => listen('update-error', callback)
}));
