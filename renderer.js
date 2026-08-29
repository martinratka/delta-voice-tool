const $ = (id) => document.getElementById(id);

const chooseFolderButton = $('choose-folder');
const checkUpdatesButton = $('check-updates');
const backgroundImageInput = $('background-image');
const backgroundFitSelect = $('background-fit');
const clearBackgroundButton = $('clear-background');
const recursiveToggle = $('recursive-toggle');
const microphoneSelect = $('microphone');
const themeSelect = $('theme-select');
const folderName = $('folder-name');
const fileCount = $('file-count');
const savedCount = $('saved-count');
const fileSearch = $('file-search');
const fileSort = $('file-sort');
const markModeButton = $('mark-mode');
const clearAllMarksButton = $('clear-all-marks');
const quickModeToggle = $('quick-mode-toggle');
const autoSaveToggle = $('auto-save-toggle');
const autoSaveToggleWrap = $('auto-save-toggle-wrap');
const fileList = $('file-list');
const workspace = document.querySelector('.workspace');
const workspaceSplitter = $('workspace-splitter');
const selectedName = $('selected-name');
const selectedFormat = $('selected-format');
const timelineScroll = $('timeline-scroll');
const timelineContent = $('timeline-content');
const waveform = $('waveform');
const waveformEmpty = $('waveform-empty');
const dropHint = $('drop-hint');
const audioPlayer = $('audio-player');
const playButton = $('play-button');
const recordButton = $('record-button');
const stopButton = $('stop-button');
const redoButton = $('redo-button');
const saveButton = $('save-button');
const undoButton = $('undo-button');
const redoEditButton = $('redo-edit-button');
const splitButton = $('split-button');
const snapButton = $('snap-button');
const zoomOutButton = $('zoom-out');
const zoomFitButton = $('zoom-fit');
const zoomInButton = $('zoom-in');
const zoomLabel = $('zoom-label');
const currentTimeLabel = $('current-time');
const durationLabel = $('duration');
const clipControls = $('clip-controls');
const clipName = $('clip-name');
const clipStartInput = $('clip-start');
const trimStartInput = $('trim-start');
const trimEndInput = $('trim-end');
const clipVolumeInput = $('clip-volume');
const volumeValue = $('volume-value');
const fadeInInput = $('fade-in');
const fadeOutInput = $('fade-out');
const muteClipButton = $('mute-clip');
const soloClipButton = $('solo-clip');
const removeClipButton = $('remove-clip');
const takeHistoryList = $('take-history-list');
const statusText = $('status-text');
const statusDot = $('status-dot');
const message = $('message');
const updateModal = $('update-modal');
const updateMessage = $('update-message');
const updateProgress = $('update-progress');
const updateProgressLabel = $('update-progress-label');
const updateInstallButton = $('update-install');
const updateSkipButton = $('update-skip');
const clearMarksModal = $('clear-marks-modal');
const clearMarksConfirmButton = $('clear-marks-confirm');
const clearMarksCancelButton = $('clear-marks-cancel');
const updateNotes = $('update-notes');

const SUPPORTED_EXTENSIONS = new Set(['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac', 'opus', 'aiff', 'aif', 'wma']);
const stateKey = 'delta-voice-state';
const backgroundStateKey = 'delta-voice-background';
const backgroundFitStateKey = 'delta-voice-background-fit';
const RULER_HEIGHT = 42;
const LANE_HEIGHT = 106;
const BASE_PIXELS_PER_SECOND = 96;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

let activeFolder = null;
let files = [];
let sortMode = 'name';
let markMode = false;
let markDrag = null;
let suppressMarkClick = false;
let markAnchorPath = null;
let selectedFile = null;
const savedFiles = new Set();
let recording = null;
let mediaRecorder = null;
let mediaStream = null;
let recordingChunks = [];
let recordingUrl = null;
let loadedUrl = null;
let previewUrl = null;
let audioContext = null;
let sourceBuffer = null;
let currentTakeBuffer = null;
let renderedBuffer = null;
let clips = [];
let selectedClipId = null;
let sourceClip = null;
let takeClip = null;
let undoStack = [];
let redoStack = [];
let clipId = 0;
let takeId = 0;
let takeHistory = [];
let zoom = 1;
let snapEnabled = true;
let playheadTime = 0;
let playheadFrame = null;
let analyser = null;
let recordingFrame = null;
let liveSamples = [];
let pointerEdit = null;
let sourceMuted = false;
let sourceSolo = false;
let recordingStartTime = 0;
let recordingStartedAt = 0;
let recordingElapsed = 0;
let quickKeyHeld = false;

function readState() {
  const raw = localStorage.getItem(stateKey);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('Could not restore editor state:', error);
    return {};
  }
}

function writeState(changes) {
  localStorage.setItem(stateKey, JSON.stringify({ ...readState(), ...changes }));
}

function projectState() {
  return readState().projectsByFile?.[selectedFile?.path] || {};
}

function persistProject() {
  if (!selectedFile) return;
  const state = readState();
  const projectsByFile = { ...(state.projectsByFile || {}) };
  projectsByFile[selectedFile.path] = {
    zoom,
    scrollLeft: timelineScroll.scrollLeft,
    snapEnabled,
    source: sourceClip ? {
      start: sourceClip.start, trimStart: sourceClip.trimStart, trimEnd: sourceClip.trimEnd,
      volume: sourceClip.volume, fadeIn: sourceClip.fadeIn, fadeOut: sourceClip.fadeOut,
      muted: Boolean(sourceClip.muted), solo: Boolean(sourceClip.solo)
    } : null,
    selectedClipId,
    clips: clips.map((clip) => ({
      id: clip.id, name: clip.name, filePath: clip.filePath || '', start: clip.start,
      trimStart: clip.trimStart, trimEnd: clip.trimEnd, volume: clip.volume,
      fadeIn: clip.fadeIn, fadeOut: clip.fadeOut, muted: Boolean(clip.muted), solo: Boolean(clip.solo)
    })),
    takeHistory: takeHistory.map((take) => ({ id: take.id, label: take.label, duration: take.duration }))
  };
  writeState({ projectsByFile, selectedFile: selectedFile.path });
}

function restoreSavedFiles(folder) {
  savedFiles.clear();
  const savedByFolder = readState().savedFilesByFolder?.[folder];
  if (Array.isArray(savedByFolder)) savedByFolder.forEach((filePath) => savedFiles.add(filePath));
}

function persistSavedFiles() {
  const state = readState();
  const savedFilesByFolder = { ...(state.savedFilesByFolder || {}) };
  if (activeFolder) savedFilesByFolder[activeFolder] = [...savedFiles];
  writeState({ savedFilesByFolder });
}

function applyTheme(theme) {
  const allowedThemes = new Set(['midnight', 'ocean', 'plum', 'forest', 'sunset', 'synthwave', 'rose', 'slate', 'amber', 'terminal', 'lavender', 'copper', 'arctic', 'candy', 'high-contrast', 'light']);
  const selectedTheme = allowedThemes.has(theme) ? theme : 'midnight';
  document.documentElement.dataset.theme = selectedTheme;
  themeSelect.value = selectedTheme;
  localStorage.setItem('delta-voice-theme', selectedTheme);
}

function applyBackgroundImage(dataUrl, fit = backgroundFitSelect.value) {
  const selectedFit = ['stretch', 'tile', 'fit'].includes(fit) ? fit : 'stretch';
  backgroundFitSelect.value = selectedFit;
  if (dataUrl) {
    document.body.style.backgroundColor = 'var(--bg)';
    document.body.style.backgroundImage = `linear-gradient(#0008, #0008), url("${dataUrl}")`;
    document.body.style.backgroundSize = selectedFit === 'stretch' ? '100% 100%' : selectedFit === 'fit' ? 'contain' : 'auto';
    document.body.style.backgroundRepeat = selectedFit === 'tile' ? 'repeat' : 'no-repeat';
    document.body.style.backgroundPosition = 'center';
    clearBackgroundButton.hidden = false;
  } else {
    document.body.style.backgroundImage = '';
    document.body.style.backgroundColor = '';
    document.body.style.backgroundSize = '';
    document.body.style.backgroundRepeat = '';
    document.body.style.backgroundPosition = '';
    clearBackgroundButton.hidden = true;
  }
}

function showMessage(text, type = '') {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const remainder = (safe % 60).toFixed(2).padStart(5, '0');
  return `${minutes}:${remainder}`;
}

function setStatus(text, live = false) {
  statusText.textContent = text;
  statusDot.classList.toggle('live', live);
}

function bufferDuration(buffer) {
  return buffer?.duration || 0;
}

function clipDuration(clip) {
  if (clip?.live) return Math.max(0.01, clip.duration || 0);
  return Math.max(0.01, bufferDuration(clip?.buffer) - (clip?.trimStart || 0) - (clip?.trimEnd || 0));
}

function timelineLayers() {
  return [sourceClip, takeClip, ...clips].filter(Boolean);
}

function layerAtIndex(index) {
  if (index === 0) return sourceClip;
  if (index === 1) return takeClip || (recording ? {
    id: 'recording-live', type: 'take', name: 'Recording…', start: recordingStartTime,
    duration: recordingElapsed, trimStart: 0, trimEnd: 0, volume: 1, fadeIn: 0, fadeOut: 0,
    muted: false, solo: false, live: true, liveSamples
  } : null);
  return clips[index - 2] || null;
}

function layerIndex(layer) {
  if (layer === sourceClip) return 0;
  if (layer === takeClip || layer?.id === 'recording-live') return 1;
  return clips.indexOf(layer) + 2;
}

function timelineDuration() {
  return Math.max(...timelineLayers().map((clip) => clip.start + clipDuration(clip)), recording ? recordingStartTime + recordingElapsed : 0, 0.01);
}

function pixelsPerSecond() {
  return BASE_PIXELS_PER_SECOND * zoom;
}

function contentWidth() {
  return Math.max(timelineScroll.clientWidth - 2, Math.ceil(120 + timelineDuration() * pixelsPerSecond()) + 24);
}

function laneCount() {
  return 2 + clips.length;
}

function laneY(index) {
  return RULER_HEIGHT + index * LANE_HEIGHT;
}

function resizeCanvas() {
  const width = contentWidth();
  const height = laneY(laneCount());
  timelineScroll.style.height = `${Math.max(210, Math.min(620, height + 2))}px`;
  timelineContent.style.width = `${width}px`;
  timelineContent.style.height = `${height}px`;
  waveform.style.width = `${width}px`;
  waveform.style.height = `${height}px`;
  const scale = window.devicePixelRatio || 1;
  waveform.width = Math.max(1, Math.floor(width * scale));
  waveform.height = Math.max(1, Math.floor(height * scale));
}

function drawWaveform(context, buffer, x, width, y, height, color, sourceStart = 0, sourceLength = buffer?.duration || 0) {
  if (!buffer || width <= 0 || sourceLength <= 0) return;
  const samples = buffer.getChannelData(0);
  const sourceDuration = Math.max(buffer.duration, 0.000001);
  const first = Math.max(0, Math.floor((sourceStart / sourceDuration) * samples.length));
  const last = Math.min(samples.length, Math.ceil(((sourceStart + sourceLength) / sourceDuration) * samples.length));
  const pixelCount = Math.max(1, Math.ceil(width));
  const sampleSpan = Math.max(1, last - first);
  const mid = y + height / 2;
  context.strokeStyle = color;
  context.globalAlpha = 0.9;
  context.lineWidth = 1;
  context.beginPath();
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const start = first + Math.floor(pixel * sampleSpan / pixelCount);
    const end = Math.min(last, first + Math.max(1, Math.floor((pixel + 1) * sampleSpan / pixelCount)));
    let min = 1;
    let max = -1;
    for (let index = start; index < end; index += 1) {
      min = Math.min(min, samples[index]);
      max = Math.max(max, samples[index]);
    }
    const px = x + pixel;
    context.moveTo(px, mid + min * height * 0.42);
    context.lineTo(px, mid + max * height * 0.42);
  }
  context.stroke();
  context.globalAlpha = 1;
}

function drawRuler(context, width, duration) {
  context.fillStyle = '#0d151f';
  context.fillRect(0, 0, width, RULER_HEIGHT);
  context.strokeStyle = '#26384d';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, RULER_HEIGHT - 0.5);
  context.lineTo(width, RULER_HEIGHT - 0.5);
  context.stroke();
  const secondsPerTick = zoom >= 4 ? 0.25 : zoom >= 2 ? 0.5 : zoom >= 0.8 ? 1 : 2;
  const minor = secondsPerTick / 4;
  context.font = '10px system-ui, sans-serif';
  context.fillStyle = '#8ea0b5';
  for (let time = 0; time <= duration + secondsPerTick; time += minor) {
    const x = 120 + time * pixelsPerSecond();
    if (x > width) break;
    const major = Math.abs((time / secondsPerTick) - Math.round(time / secondsPerTick)) < 0.001;
    context.strokeStyle = major ? '#49627e' : '#2b3c50';
    context.beginPath();
    context.moveTo(x, RULER_HEIGHT - (major ? 14 : 7));
    context.lineTo(x, RULER_HEIGHT);
    context.stroke();
    if (major) context.fillText(formatTime(time).slice(0, 5), x + 4, 13);
  }
}

function drawLaneHeader(context, y, title, subtitle, color) {
  context.fillStyle = '#111a25';
  context.fillRect(0, y, 116, LANE_HEIGHT);
  context.strokeStyle = '#26384d';
  context.strokeRect(0.5, y + 0.5, 115, LANE_HEIGHT - 1);
  context.fillStyle = color;
  context.fillRect(10, y + 13, 5, 42);
  context.fillStyle = '#e5edf7';
  context.font = '600 11px system-ui, sans-serif';
  context.fillText(title, 24, y + 27);
  context.fillStyle = '#8192a7';
  context.font = '10px system-ui, sans-serif';
  context.fillText(subtitle, 24, y + 42);
}

function drawClip(context, clip, index) {
  const y = laneY(index);
  const x = 120 + clip.start * pixelsPerSecond();
  const width = Math.max(12, clipDuration(clip) * pixelsPerSecond());
  const selected = clip.id === selectedClipId;
  const color = selected ? '#f1b467' : clip.type === 'source' ? '#6ea2ff' : clip.type === 'take' ? '#f06b76' : '#6ea2ff';
  context.fillStyle = clip.muted ? '#1b2633' : selected ? '#624926' : '#1d3658';
  context.fillRect(x, y + 12, width, LANE_HEIGHT - 24);
  context.strokeStyle = color;
  context.lineWidth = selected ? 2 : 1;
  context.strokeRect(x + 0.5, y + 12.5, width - 1, LANE_HEIGHT - 25);
  if (clip.live) drawLiveWaveform(context, clip.liveSamples, x + 2, width - 4, y + 25, LANE_HEIGHT - 48, '#ff9aa4');
  else drawWaveform(context, clip.buffer, x + 2, width - 4, y + 25, LANE_HEIGHT - 48, selected ? '#ffe1a8' : color === '#f06b76' ? '#ffb0b7' : '#a9c5f7', clip.trimStart, clipDuration(clip));
  context.fillStyle = selected ? '#fff0cd' : '#d6e4fb';
  context.font = '600 10px system-ui, sans-serif';
  context.fillText(`${clip.name}${clip.muted ? ' · muted' : ''}`, x + 7, y + 26);
  const end = x + width;
  const fadeInX = x + Math.min(width, clip.fadeIn * pixelsPerSecond());
  const fadeOutX = end - Math.min(width, clip.fadeOut * pixelsPerSecond());
  if (clip.fadeIn > 0) {
    context.fillStyle = 'rgba(255, 255, 255, .12)';
    context.beginPath();
    context.moveTo(x, y + 12);
    context.lineTo(fadeInX, y + 12);
    context.lineTo(fadeInX, y + LANE_HEIGHT - 12);
    context.closePath();
    context.fill();
  }
  if (clip.fadeOut > 0) {
    context.fillStyle = 'rgba(0, 0, 0, .22)';
    context.beginPath();
    context.moveTo(fadeOutX, y + 12);
    context.lineTo(end, y + 12);
    context.lineTo(end, y + LANE_HEIGHT - 12);
    context.closePath();
    context.fill();
  }
  const volumeY = y + 51 - ((clip.volume - 1) / 2) * 24;
  context.strokeStyle = selected ? '#fff0cd' : '#aac3e8';
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(x + 3, volumeY);
  context.lineTo(end - 3, volumeY);
  context.stroke();
  if (selected) {
    context.fillStyle = '#fff0cd';
    for (const handleX of [fadeInX, fadeOutX]) {
      context.beginPath();
      context.arc(handleX, y + LANE_HEIGHT - 17, 9, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function drawLiveWaveform(context, samples, x, width, y, height, color) {
  if (!samples?.length || width <= 0) return;
  const mid = y + height / 2;
  const step = Math.max(1, Math.floor(samples.length / Math.max(1, width)));
  context.strokeStyle = color;
  context.globalAlpha = 0.9;
  context.beginPath();
  for (let pixel = 0; pixel < width; pixel += 1) {
    const start = pixel * step;
    let min = 1;
    let max = -1;
    for (let index = start; index < Math.min(samples.length, start + step); index += 1) {
      min = Math.min(min, samples[index]);
      max = Math.max(max, samples[index]);
    }
    context.moveTo(x + pixel, mid + min * height * 0.42);
    context.lineTo(x + pixel, mid + max * height * 0.42);
  }
  context.stroke();
  context.globalAlpha = 1;
}

function drawTimeline() {
  resizeCanvas();
  const context = waveform.getContext('2d');
  const scale = window.devicePixelRatio || 1;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  const width = contentWidth();
  const height = laneY(laneCount());
  const duration = timelineDuration();
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#0a1018';
  context.fillRect(0, 0, width, height);
  drawRuler(context, width, duration);
  const source = sourceClip;
  drawLaneHeader(context, laneY(0), 'SOURCE', source ? 'Original audio' : 'No source', '#6ea2ff');
  if (source) drawClip(context, source, 0);
  const take = takeClip || (recording ? layerAtIndex(1) : null);
  drawLaneHeader(context, laneY(1), 'TAKE', take ? (recording ? 'Recording…' : 'Latest recording') : 'Recording lane', '#f06b76');
  if (take) drawClip(context, take, 1);
  clips.forEach((clip, index) => {
    drawLaneHeader(context, laneY(index + 2), `CLIP ${index + 1}`, 'Audio layer', '#f1b467');
    drawClip(context, clip, index + 2);
  });
  const playheadX = 120 + playheadTime * pixelsPerSecond();
  context.strokeStyle = '#ffffff';
  context.globalAlpha = 0.9;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(playheadX, 0);
  context.lineTo(playheadX, height);
  context.stroke();
  context.globalAlpha = 1;
  waveformEmpty.hidden = Boolean(selectedFile || clips.length || sourceClip || takeClip || recording);
  undoButton.disabled = !undoStack.length;
  redoEditButton.disabled = !redoStack.length;
  splitButton.disabled = !timelineLayers().some((clip) => clip.id === selectedClipId);
  updateClipControls();
  currentTimeLabel.textContent = formatTime(playheadTime);
  durationLabel.textContent = formatTime(duration);
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

function ensurePlayheadVisible() {
  const x = 120 + playheadTime * pixelsPerSecond();
  const left = timelineScroll.scrollLeft + 120;
  const right = timelineScroll.scrollLeft + timelineScroll.clientWidth - 24;
  if (x < left) timelineScroll.scrollLeft = Math.max(0, x - 80);
  else if (x > right) timelineScroll.scrollLeft = Math.max(0, x - timelineScroll.clientWidth + 80);
}

function updatePlayhead() {
  if (audioPlayer.paused || audioPlayer.ended) return;
  playheadTime = Math.min(audioPlayer.currentTime, timelineDuration());
  drawTimeline();
  ensurePlayheadVisible();
  playheadFrame = requestAnimationFrame(updatePlayhead);
}

function stopPlayhead() {
  if (playheadFrame) cancelAnimationFrame(playheadFrame);
  playheadFrame = null;
  drawTimeline();
}

function updateRecordingWaveform() {
  if (!analyser) return;
  const values = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(values);
  for (let i = 0; i < values.length; i += 8) liveSamples.push((values[i] - 128) / 128);
  if (liveSamples.length > 10000) liveSamples.splice(0, liveSamples.length - 10000);
  recordingElapsed = Math.max(0, (performance.now() - recordingStartedAt) / 1000);
  drawTimeline();
  recordingFrame = requestAnimationFrame(updateRecordingWaveform);
}

function stopRecordingWaveform() {
  if (recordingFrame) cancelAnimationFrame(recordingFrame);
  recordingFrame = null;
  analyser = null;
  liveSamples = [];
  recordingElapsed = 0;
}

function blobUrlFromBase64(data, mime) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

async function decodeUrl(url) {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const response = await fetch(url);
  return audioContext.decodeAudioData(await response.arrayBuffer());
}

function sortFiles() {
  files.sort((left, right) => {
    if (sortMode === 'modified-desc' || sortMode === 'modified-asc') {
      const difference = (Number(left.modifiedAt) || 0) - (Number(right.modifiedAt) || 0);
      if (difference) return sortMode === 'modified-desc' ? -difference : difference;
    }
    return left.relativePath.localeCompare(right.relativePath);
  });
}

function getVisibleFiles() {
  const query = fileSearch.value.trim().toLocaleLowerCase();
  return query ? files.filter((file) => file.relativePath.toLocaleLowerCase().includes(query)) : files;
}

function formatReleaseNotes(releaseNotes) {
  if (typeof releaseNotes === 'string') return releaseNotes.trim();
  if (!Array.isArray(releaseNotes)) return '';
  return releaseNotes.map((entry) => typeof entry === 'string' ? entry : entry?.note || entry?.title || '').filter(Boolean).join('\n');
}

function updateMarkedItem(button, file, marked) {
  if (marked) savedFiles.add(file.path);
  else savedFiles.delete(file.path);
  button.classList.toggle('saved', marked);
  button.setAttribute('aria-label', `${file.relativePath}, ${marked ? 'saved' : 'not changed'}`);
}

function renderFiles() {
  const query = fileSearch.value.trim().toLocaleLowerCase();
  const visibleFiles = getVisibleFiles();
  const overwrittenCount = files.reduce((count, file) => count + (savedFiles.has(file.path) ? 1 : 0), 0);
  fileCount.textContent = query ? `${visibleFiles.length}/${files.length}` : files.length;
  savedCount.textContent = `${overwrittenCount}/${files.length}`;
  fileList.replaceChildren();
  if (!visibleFiles.length) {
    fileList.className = 'file-list empty-state';
    fileList.textContent = files.length ? 'No files match your search.' : 'No supported audio files were found in this folder.';
    return;
  }
  fileList.className = 'file-list';
  visibleFiles.forEach((file) => {
    const button = document.createElement('button');
    button.className = `file-item${savedFiles.has(file.path) ? ' saved' : ''}${selectedFile?.path === file.path ? ' selected' : ''}`;
    button.dataset.path = file.path;
    button.title = file.relativePath;
    button.setAttribute('aria-label', `${file.relativePath}, ${savedFiles.has(file.path) ? 'saved' : 'not changed'}`);
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = file.relativePath;
    const format = document.createElement('span');
    format.className = 'file-format';
    format.textContent = file.format;
    button.append(name, format);
    button.addEventListener('pointerdown', (event) => {
      if (!markMode || event.button !== 0) return;
      const visibleFiles = getVisibleFiles();
      const anchorIndex = visibleFiles.findIndex((item) => item.path === markAnchorPath);
      const currentIndex = visibleFiles.findIndex((item) => item.path === file.path);
      if (event.shiftKey && anchorIndex >= 0 && currentIndex >= 0) {
        const start = Math.min(anchorIndex, currentIndex);
        const end = Math.max(anchorIndex, currentIndex);
        visibleFiles.slice(start, end + 1).forEach((item) => savedFiles.add(item.path));
        markAnchorPath = file.path;
        persistSavedFiles();
        markDrag = { target: true, moved: true };
        renderFiles();
        return;
      }
      markDrag = { target: !savedFiles.has(file.path), moved: false };
      markAnchorPath = file.path;
      updateMarkedItem(button, file, markDrag.target);
    });
    button.addEventListener('pointerenter', () => {
      if (!markMode || !markDrag) return;
      markDrag.moved = true;
      updateMarkedItem(button, file, markDrag.target);
    });
    button.addEventListener('click', (event) => {
      if (markMode && suppressMarkClick) {
        suppressMarkClick = false;
        return;
      }
      if (markMode) {
        const anchorIndex = getVisibleFiles().findIndex((item) => item.path === markAnchorPath);
        const currentIndex = getVisibleFiles().findIndex((item) => item.path === file.path);
        if (event.shiftKey && anchorIndex >= 0 && currentIndex >= 0) {
          const start = Math.min(anchorIndex, currentIndex);
          const end = Math.max(anchorIndex, currentIndex);
          getVisibleFiles().slice(start, end + 1).forEach((item) => savedFiles.add(item.path));
        } else {
          updateMarkedItem(button, file, !savedFiles.has(file.path));
        }
        markAnchorPath = file.path;
        persistSavedFiles();
        renderFiles();
        return;
      }
      if (markMode) return;
      selectFile(file);
    });
    fileList.append(button);
  });
}

function clearEditor() {
  clips = [];
  selectedClipId = null;
  undoStack = [];
  redoStack = [];
  currentTakeBuffer = null;
  sourceClip = null;
  takeClip = null;
  renderedBuffer = null;
  takeHistory = [];
  sourceMuted = false;
  sourceSolo = false;
  zoom = 1;
  snapEnabled = true;
  snapButton.classList.add('active');
  snapButton.setAttribute('aria-pressed', 'true');
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  renderTakeHistory();
  drawTimeline();
}

async function restoreProject() {
  const saved = projectState();
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(saved.zoom) || 1));
  snapEnabled = saved.snapEnabled !== false;
  const sourceState = saved.source || {};
  sourceClip = sourceBuffer ? {
    id: 'source', type: 'source', name: selectedFile?.name || 'Source', filePath: selectedFile?.path || '',
    buffer: sourceBuffer, start: Math.max(0, Number(sourceState.start) || 0),
    trimStart: Math.max(0, Number(sourceState.trimStart) || 0), trimEnd: Math.max(0, Number(sourceState.trimEnd) || 0),
    volume: Math.max(0, Math.min(2, Number(sourceState.volume) || 1)),
    fadeIn: Math.max(0, Number(sourceState.fadeIn) || 0), fadeOut: Math.max(0, Number(sourceState.fadeOut) || 0),
    muted: sourceState.muted === true || (saved.editorMode === 'replace' && Array.isArray(saved.clips) && saved.clips.length > 0),
    solo: sourceState.solo === true
  } : null;
  sourceMuted = sourceClip?.muted || saved.sourceMuted === true;
  sourceSolo = sourceClip?.solo || saved.sourceSolo === true;
  if (sourceClip) { sourceClip.muted = sourceMuted; sourceClip.solo = sourceSolo; }
  snapButton.classList.toggle('active', snapEnabled);
  snapButton.setAttribute('aria-pressed', String(snapEnabled));
  clips = [];
  let highestId = 0;
  for (const metadata of Array.isArray(saved.clips) ? saved.clips : []) {
    if (!metadata.filePath) continue;
    try {
      const loaded = await window.voiceTakes.loadDroppedAudio(metadata.filePath);
      const url = blobUrlFromBase64(loaded.data, loaded.mime);
      const buffer = await decodeUrl(url);
      URL.revokeObjectURL(url);
      const available = Math.max(0.01, buffer.duration - 0.01);
      clips.push({
        ...metadata, id: Number(metadata.id) || ++clipId, type: 'clip', buffer,
        start: Math.max(0, Number(metadata.start) || 0),
        trimStart: Math.max(0, Math.min(Number(metadata.trimStart) || 0, available)),
        trimEnd: Math.max(0, Math.min(Number(metadata.trimEnd) || 0, available)),
        volume: Math.max(0, Math.min(2, Number(metadata.volume) || 1)),
        fadeIn: Math.max(0, Number(metadata.fadeIn) || 0), fadeOut: Math.max(0, Number(metadata.fadeOut) || 0),
        muted: metadata.muted === true, solo: metadata.solo === true
      });
      highestId = Math.max(highestId, clips.at(-1).id);
    } catch (error) {
      console.warn(`Could not restore clip ${metadata.name}:`, error);
    }
  }
  clipId = Math.max(clipId, highestId);
  selectedClipId = timelineLayers().some((clip) => clip.id === saved.selectedClipId) ? saved.selectedClipId : null;
  takeHistory = Array.isArray(saved.takeHistory) ? saved.takeHistory.map((take) => ({ ...take, buffer: null, tempPath: '' })) : [];
  renderTakeHistory();
  drawTimeline();
  requestAnimationFrame(() => { timelineScroll.scrollLeft = Math.max(0, Number(saved.scrollLeft) || 0); drawTimeline(); });
}

async function selectFile(file) {
  try {
    selectedFile = file;
    writeState({ selectedFile: file.path });
    renderFiles();
    const loaded = await window.voiceTakes.loadAudio(file.path);
    if (loadedUrl) URL.revokeObjectURL(loadedUrl);
    loadedUrl = blobUrlFromBase64(loaded.data, loaded.mime);
    sourceBuffer = await decodeUrl(loadedUrl);
    audioPlayer.src = loadedUrl;
    selectedName.textContent = loaded.name;
    selectedFormat.textContent = loaded.format;
    clearRecordingUi(true);
    clips = [];
    selectedClipId = null;
    undoStack = [];
    redoStack = [];
    currentTakeBuffer = null;
    sourceClip = null;
    takeClip = null;
    renderedBuffer = null;
    sourceMuted = false;
    sourceSolo = false;
    sourceClip = {
      id: 'source', type: 'source', name: loaded.name, filePath: file.path, buffer: sourceBuffer,
      start: 0, trimStart: 0, trimEnd: 0, volume: 1, fadeIn: 0, fadeOut: 0, muted: false, solo: false
    };
    drawTimeline();
    await restoreProject();
    playButton.disabled = false;
    recordButton.disabled = false;
    setStatus('Ready');
    showMessage('Ready. Drop clips, record a take, or press Space to preview.', '');
  } catch (error) {
    showMessage(error.message || 'Could not load that audio file.', 'error');
  }
}

function clearRecordingUi(discardTemp = false) {
  const oldTempPath = recording?.tempPath;
  if (discardTemp && oldTempPath) window.voiceTakes.discardRecordingTemp(oldTempPath).catch((error) => console.warn('Could not discard temporary take:', error));
  recording = null;
  currentTakeBuffer = null;
  takeClip = null;
  recordingElapsed = 0;
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  recordingUrl = null;
  redoButton.disabled = true;
  saveButton.disabled = !renderedBuffer;
}

async function refreshFiles() {
  if (!activeFolder) return;
  try {
    files = await window.voiceTakes.listFiles(activeFolder, recursiveToggle.checked);
    sortFiles();
    renderFiles();
    if (selectedFile && !files.some((file) => file.path === selectedFile.path)) {
      selectedFile = null;
      sourceBuffer = null;
      clearEditor();
      selectedName.textContent = 'Nothing selected';
      selectedFormat.textContent = '—';
      playButton.disabled = true;
      recordButton.disabled = true;
    }
  } catch (error) {
    showMessage(error.message || 'Could not read this folder.', 'error');
  }
}

async function chooseFolder() {
  try {
    const result = await window.voiceTakes.selectFolder();
    if (!result) return;
    activeFolder = result.folder;
    folderName.textContent = result.folder;
    files = result.files;
    sortFiles();
    restoreSavedFiles(activeFolder);
    writeState({ folder: activeFolder, recursive: recursiveToggle.checked, search: fileSearch.value });
    selectedFile = null;
    sourceBuffer = null;
    clearRecordingUi(true);
    clearEditor();
    selectedName.textContent = 'Nothing selected';
    selectedFormat.textContent = '—';
    playButton.disabled = true;
    recordButton.disabled = true;
    renderFiles();
    showMessage(`${files.length} supported file${files.length === 1 ? '' : 's'} found.`, 'success');
  } catch (error) {
    showMessage(error.message || 'Could not choose a folder.', 'error');
  }
}

async function populateMicrophones() {
  try {
    const permissionStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
    permissionStream.getTracks().forEach((track) => track.stop());
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audioinput');
    microphoneSelect.replaceChildren();
    if (!devices.length) {
      microphoneSelect.add(new Option('No microphone found', ''));
      recordButton.disabled = true;
      return;
    }
    devices.forEach((device, index) => microphoneSelect.add(new Option(device.label || `Microphone ${index + 1}`, device.deviceId)));
  } catch (error) {
    microphoneSelect.replaceChildren(new Option('Microphone permission denied', ''));
    showMessage('Microphone access is needed to record. Check OS privacy settings and reload the app.', 'error');
    console.warn('Microphone setup failed:', error);
  }
}

function preferredMimeType() {
  return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/ogg'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

async function startRecording() {
  if (!selectedFile || mediaRecorder?.state === 'recording') return;
  try {
    audioPlayer.pause();
    if (quickModeToggle.checked && sourceClip) {
      sourceClip.muted = true;
      sourceMuted = true;
      sourceClip.solo = false;
      sourceSolo = false;
    }
    selectedClipId = null;
    undoStack = [];
    redoStack = [];
    renderedBuffer = null;
    drawTimeline();
    const audioConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    };
    if (microphoneSelect.value) audioConstraints.deviceId = { exact: microphoneSelect.value };
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    audioContext.createMediaStreamSource(mediaStream).connect(analyser);
    liveSamples = [];
    recordingStartTime = snapTime(playheadTime);
    recordingStartedAt = performance.now();
    recordingElapsed = 0;
    recording = { start: recordingStartTime, tempPath: null, blob: null };
    takeClip = null;
    const mimeType = preferredMimeType();
    mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
    recordingChunks = [];
    mediaRecorder.addEventListener('dataavailable', (event) => { if (event.data.size) recordingChunks.push(event.data); });
    mediaRecorder.addEventListener('stop', finishRecording, { once: true });
    mediaRecorder.start();
    updateRecordingWaveform();
    recordButton.classList.add('recording');
    recordButton.querySelector('span').textContent = 'Recording…';
    stopButton.disabled = false;
    playButton.disabled = true;
    redoButton.disabled = true;
    saveButton.disabled = true;
    setStatus('Recording', true);
    showMessage('Recording in progress. Stop when you are happy with the take.', '');
  } catch (error) {
    showMessage(error.message || 'Could not start recording. Check the selected microphone.', 'error');
  }
}

function bytesToBase64(data) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < data.length; offset += chunkSize) binary += String.fromCharCode(...data.subarray(offset, offset + chunkSize));
  return btoa(binary);
}

function findAudioContentBounds(buffer) {
  const sampleRate = buffer.sampleRate;
  const windowSize = Math.max(1, Math.floor(sampleRate * 0.01));
  const threshold = 0.012;
  let firstActiveWindow = -1;
  let lastActiveWindow = -1;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));

  for (let start = 0; start < buffer.length; start += windowSize) {
    const end = Math.min(buffer.length, start + windowSize);
    let energy = 0;
    let sampleCount = 0;
    for (let index = start; index < end; index += 1) {
      for (const channel of channels) {
        energy += channel[index] ** 2;
        sampleCount += 1;
      }
    }
    const rms = Math.sqrt(energy / Math.max(1, sampleCount));
    if (rms >= threshold) {
      if (firstActiveWindow < 0) firstActiveWindow = start;
      lastActiveWindow = end;
    }
  }

  if (firstActiveWindow < 0) return { start: 0, end: buffer.length };
  const padding = Math.floor(sampleRate * 0.01);
  return {
    start: Math.max(0, firstActiveWindow - padding),
    end: Math.min(buffer.length, lastActiveWindow + padding)
  };
}

async function finishRecording() {
  const mimeType = mediaRecorder?.mimeType || 'audio/webm';
  const blob = new Blob(recordingChunks, { type: mimeType });
  stopRecordingWaveform();
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  mediaRecorder = null;
  recordingChunks = [];
  try {
    const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
    const tempPath = await window.voiceTakes.saveRecordingTemp(bytesToBase64(new Uint8Array(await blob.arrayBuffer())), extension);
    recording = { ...recording, tempPath, blob };
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    recordingUrl = URL.createObjectURL(blob);
    currentTakeBuffer = await decodeUrl(recordingUrl);
    const contentBounds = findAudioContentBounds(currentTakeBuffer);
    takeClip = {
      id: 'take', type: 'take', name: `Take ${takeId + 1}`, filePath: '', buffer: currentTakeBuffer,
      start: 0,
      trimStart: contentBounds.start / currentTakeBuffer.sampleRate,
      trimEnd: (currentTakeBuffer.length - contentBounds.end) / currentTakeBuffer.sampleRate,
      volume: 1, fadeIn: 0, fadeOut: 0, muted: false, solo: false
    };
    const take = { id: ++takeId, label: `Take ${takeId}`, duration: currentTakeBuffer.duration, tempPath, buffer: currentTakeBuffer };
    takeHistory = [...takeHistory, take];
    recordingElapsed = currentTakeBuffer.duration;
    playheadTime = 0;
    renderTakeHistory();
    await renderEditedPreview();
    recordButton.classList.remove('recording');
    recordButton.querySelector('span').textContent = 'Record';
    stopButton.disabled = true;
    playButton.disabled = false;
    redoButton.disabled = false;
    saveButton.disabled = false;
    setStatus('Take ready');
    persistProject();
    showMessage('Take ready for review.', 'success');
    if (quickModeToggle.checked && autoSaveToggle.checked) await saveTake();
  } catch (error) {
    showMessage(error.message || 'Could not store the recording.', 'error');
    resetTransport();
  }
}

function stopRecording() {
  if (mediaRecorder?.state === 'recording') {
    mediaRecorder.stop();
    setStatus('Finishing take…');
    stopButton.disabled = true;
  } else {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    playheadTime = 0;
    drawTimeline();
  }
}

function resetTransport() {
  stopRecordingWaveform();
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  mediaRecorder = null;
  recordButton.classList.remove('recording');
  recordButton.querySelector('span').textContent = 'Record';
  stopButton.disabled = true;
  playButton.disabled = !selectedFile;
  setStatus('Ready');
}

function redoRecording() {
  if (!selectedFile) return;
  audioPlayer.pause();
  clearRecordingUi(true);
  playheadTime = 0;
  startRecording();
}

function snapshot() {
  return {
    clips: clips.map((clip) => ({ ...clip })),
    sourceClip: sourceClip ? { ...sourceClip } : null,
    takeClip: takeClip ? { ...takeClip } : null,
    sourceMuted, sourceSolo, selectedClipId
  };
}

function restoreSnapshot(previous) {
  clips = previous.clips.map((clip) => ({ ...clip }));
  sourceClip = previous.sourceClip ? { ...previous.sourceClip } : null;
  takeClip = previous.takeClip ? { ...previous.takeClip } : null;
  currentTakeBuffer = takeClip?.buffer || null;
  sourceMuted = previous.sourceMuted;
  sourceSolo = previous.sourceSolo;
  selectedClipId = previous.selectedClipId;
  renderEditedPreview().catch((error) => showMessage(error.message || 'Could not render this edit.', 'error'));
}

function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > 40) undoStack.shift();
  redoStack = [];
}

function undoEdit() {
  const previous = undoStack.pop();
  if (!previous) return;
  redoStack.push(snapshot());
  restoreSnapshot(previous);
  persistProject();
  showMessage('Edit undone.', 'success');
}

function removeSelectedClip() {
  const selected = timelineLayers().find((clip) => clip.id === selectedClipId);
  if (!selected || selected.type === 'source') return;
  pushUndo();
  if (selected === takeClip) clearRecordingUi(true);
  else clips = clips.filter((clip) => clip.id !== selectedClipId);
  selectedClipId = null;
  renderEditedPreview().catch((error) => showMessage(error.message || 'Could not remove the clip.', 'error'));
}

function redoEdit() {
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(snapshot());
  restoreSnapshot(next);
  persistProject();
  showMessage('Edit redone.', 'success');
}

function updateClipControls() {
  if (!clipControls) return;
  const clip = timelineLayers().find((item) => item.id === selectedClipId);
  clipControls.hidden = !clip;
  if (!clip) return;
  clipName.textContent = clip.name;
  clipStartInput.value = clip.start.toFixed(2);
  trimStartInput.value = clip.trimStart.toFixed(2);
  trimEndInput.value = clip.trimEnd.toFixed(2);
  clipVolumeInput.value = clip.volume;
  volumeValue.textContent = `${Math.round(clip.volume * 100)}%`;
  fadeInInput.value = clip.fadeIn.toFixed(2);
  fadeOutInput.value = clip.fadeOut.toFixed(2);
  muteClipButton.classList.toggle('active', Boolean(clip.muted));
  soloClipButton.classList.toggle('active', Boolean(clip.solo));
}

function editSelectedClip(change) {
  const clip = timelineLayers().find((item) => item.id === selectedClipId);
  if (!clip) return;
  pushUndo();
  change(clip);
  const available = Math.max(0.01, bufferDuration(clip.buffer) - 0.01);
  clip.trimStart = Math.max(0, Math.min(clip.trimStart, available - clip.trimEnd - 0.01));
  clip.trimEnd = Math.max(0, Math.min(clip.trimEnd, available - clip.trimStart - 0.01));
  clip.fadeIn = Math.min(Math.max(0, clip.fadeIn), clipDuration(clip));
  clip.fadeOut = Math.min(Math.max(0, clip.fadeOut), clipDuration(clip));
  renderEditedPreview().catch((error) => showMessage(error.message || 'Could not render this edit.', 'error'));
}

function snapTime(value) {
  if (!snapEnabled) return value;
  return Math.max(0, Math.round(value / 0.05) * 0.05);
}

function eventPosition(event) {
  const rect = waveform.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  return { x, y, time: Math.max(0, (x - 120) / pixelsPerSecond()) };
}

function clipAtPosition(position) {
  if (position.y < RULER_HEIGHT) return null;
  const index = Math.floor((position.y - RULER_HEIGHT) / LANE_HEIGHT);
  const clip = layerAtIndex(index);
  if (!clip) return null;
  const start = 120 + clip.start * pixelsPerSecond();
  const end = start + clipDuration(clip) * pixelsPerSecond();
  return position.x >= start && position.x <= end ? clip : null;
}

function editHandleAtPosition(position, clip) {
  const x = position.x;
  const start = 120 + clip.start * pixelsPerSecond();
  const width = clipDuration(clip) * pixelsPerSecond();
  const end = start + width;
  const fadeInX = start + Math.min(width, clip.fadeIn * pixelsPerSecond());
  const fadeOutX = end - Math.min(width, clip.fadeOut * pixelsPerSecond());
  const y = position.y - laneY(layerIndex(clip));
  if (y > LANE_HEIGHT - 36 && Math.abs(x - fadeInX) < 18) return 'fade-in';
  if (y > LANE_HEIGHT - 36 && Math.abs(x - fadeOutX) < 18) return 'fade-out';
  if (Math.abs(x - start) < 13) return 'trim-start';
  if (Math.abs(x - end) < 13) return 'trim-end';
  const volumeY = laneY(layerIndex(clip)) + 51 - ((clip.volume - 1) / 2) * 24;
  if (Math.abs(position.y - volumeY) < 12) return 'volume';
  return 'move';
}

function updateTimelineCursor(event) {
  const position = eventPosition(event);
  const clip = clipAtPosition(position);
  if (!clip) {
    waveform.style.cursor = 'default';
    return;
  }
  const mode = editHandleAtPosition(position, clip);
  waveform.style.cursor = mode === 'trim-start' || mode === 'trim-end' ? 'ew-resize' : mode === 'fade-in' || mode === 'fade-out' ? 'pointer' : 'grab';
}

function splitAtPlayhead() {
  const clip = timelineLayers().find((item) => item.id === selectedClipId);
  if (!clip) return;
  const end = clip.start + clipDuration(clip);
  if (playheadTime <= clip.start + 0.01 || playheadTime >= end - 0.01) {
    showMessage('Place the playhead inside the selected clip to split it.', 'error');
    return;
  }
  pushUndo();
  const firstLength = playheadTime - clip.start;
  const second = {
    ...clip,
    id: ++clipId,
    type: 'clip',
    name: `${clip.name} (split)`,
    start: playheadTime,
    trimStart: clip.trimStart + firstLength,
    trimEnd: clip.trimEnd
  };
  clip.trimEnd = Math.max(0, bufferDuration(clip.buffer) - clip.trimStart - firstLength - 0.01);
  const clipIndex = clips.indexOf(clip);
  if (clipIndex >= 0) clips.splice(clipIndex + 1, 0, second);
  else clips.push(second);
  selectedClipId = second.id;
  renderEditedPreview().catch((error) => showMessage(error.message || 'Could not split the clip.', 'error'));
}

async function readDroppedFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error(`${file.name} is not a supported audio format.`);
  let filePath = '';
  try { filePath = window.voiceTakes.getPathForFile(file); } catch (error) { console.warn('Could not resolve dropped path:', error); }
  if (filePath) return window.voiceTakes.loadDroppedAudio(filePath);
  const data = new Uint8Array(await file.arrayBuffer());
  return { name: file.name, format: extension.toUpperCase(), mime: file.type || 'application/octet-stream', data: bytesToBase64(data) };
}

async function addDroppedFiles(fileList, startTime) {
  if (!selectedFile) {
    showMessage('Select a source before dropping another audio file.', 'error');
    return;
  }
  const audioFiles = [...fileList].filter((file) => file.type.startsWith('audio/') || SUPPORTED_EXTENSIONS.has(file.name.split('.').pop()?.toLowerCase()));
  if (!audioFiles.length) {
    showMessage('Drop supported audio such as MP3, WAV, OGG, FLAC, M4A, or AAC.', 'error');
    return;
  }
  audioPlayer.pause();
  pushUndo();
  let position = snapTime(startTime);
  const added = [];
  try {
    for (const file of audioFiles) {
      const loaded = await readDroppedFile(file);
      const url = blobUrlFromBase64(loaded.data, loaded.mime);
      const buffer = await decodeUrl(url);
      URL.revokeObjectURL(url);
      const clip = { id: ++clipId, name: loaded.name, filePath: loaded.filePath || '', buffer, start: position, trimStart: 0, trimEnd: 0, volume: 1, fadeIn: 0, fadeOut: 0, muted: false, solo: false };
      clips.push(clip);
      added.push(clip);
      position += buffer.duration;
    }
    selectedClipId = added.at(-1).id;
    await renderEditedPreview();
    persistProject();
    showMessage(`${added.length} clip${added.length === 1 ? '' : 's'} added to the timeline.`, 'success');
  } catch (error) {
    showMessage(error.message || 'Could not read the dropped audio.', 'error');
  }
}

async function renderOffline() {
  const layers = timelineLayers().filter((clip) => !clip.live && clip.buffer);
  if (!layers.length) return null;
  const duration = timelineDuration();
  const sampleRate = layers[0].buffer.sampleRate || 44100;
  const offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
  const anySolo = layers.some((clip) => clip.solo);
  for (const clip of layers) {
    if (clip.muted || (anySolo && !clip.solo)) continue;
    const length = clipDuration(clip);
    const start = Math.max(0, clip.start);
    const end = Math.min(duration, start + length);
    if (end <= start) continue;
    const source = offline.createBufferSource();
    source.buffer = clip.buffer;
    const gain = offline.createGain();
    const volume = Math.max(0, clip.volume);
    gain.gain.setValueAtTime(0, start);
    if (clip.fadeIn > 0) gain.gain.linearRampToValueAtTime(volume, Math.min(end, start + clip.fadeIn));
    else gain.gain.setValueAtTime(volume, start);
    if (clip.fadeOut > 0 && end - clip.fadeOut > start) {
      gain.gain.setValueAtTime(volume, end - clip.fadeOut);
      gain.gain.linearRampToValueAtTime(0, end);
    }
    source.connect(gain).connect(offline.destination);
    source.start(start, clip.trimStart, Math.max(0.01, end - start));
  }
  return offline.startRendering();
}

function audioBufferToWav(buffer) {
  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleCount = buffer.length;
  const blockAlign = channels * 2;
  const array = new ArrayBuffer(44 + sampleCount * blockAlign);
  const view = new DataView(array);
  const writeString = (offset, text) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  writeString(0, 'RIFF'); view.setUint32(4, 36 + sampleCount * blockAlign, true); writeString(8, 'WAVE');
  writeString(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
  writeString(36, 'data'); view.setUint32(40, sampleCount * blockAlign, true);
  let offset = 44;
  for (let index = 0; index < sampleCount; index += 1) for (let channel = 0; channel < channels; channel += 1) {
    const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(array);
}

async function renderEditedPreview() {
  if (!selectedFile || !timelineLayers().length) return;
  renderedBuffer = await renderOffline();
  if (!renderedBuffer) return;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(new Blob([audioBufferToWav(renderedBuffer)], { type: 'audio/wav' }));
  audioPlayer.src = previewUrl;
  playButton.disabled = false;
  saveButton.disabled = false;
  drawTimeline();
  setStatus('Edit ready');
  persistProject();
}

async function saveTake() {
  if (!selectedFile || (!recording && !renderedBuffer)) return;
  const savedFile = selectedFile;
  const savedIndex = files.findIndex((file) => file.path === savedFile.path);
  const nextFile = savedIndex >= 0 ? files[savedIndex + 1] : null;
  saveButton.disabled = true;
  let tempPath = recording?.tempPath;
  try {
    const canUseOriginalTake = Boolean(tempPath && takeClip && renderedBuffer === currentTakeBuffer &&
      !clips.length && sourceClip?.muted && takeClip.start === 0 && takeClip.trimStart === 0 &&
      takeClip.trimEnd === 0 && takeClip.volume === 1 && !takeClip.fadeIn && !takeClip.fadeOut);
    if (!canUseOriginalTake && renderedBuffer) {
      tempPath = await window.voiceTakes.saveRecordingTemp(bytesToBase64(audioBufferToWav(renderedBuffer)), 'wav');
    }
    await window.voiceTakes.saveTake(selectedFile.path, tempPath);
    savedFiles.add(savedFile.path);
    persistSavedFiles();
    renderFiles();
    showMessage(`Saved and replaced ${savedFile.name} as ${savedFile.format}.`, 'success');
    clearRecordingUi();
    await selectFile(nextFile || savedFile);
  } catch (error) {
    saveButton.disabled = false;
    showMessage(error.message || 'Save failed. The original file was left unchanged.', 'error');
  }
}

function renderTakeHistory() {
  if (!takeHistoryList) return;
  takeHistoryList.replaceChildren();
  if (!takeHistory.length) {
    const empty = document.createElement('span');
    empty.className = 'muted';
    empty.textContent = 'No takes yet. Record a take to build history.';
    takeHistoryList.append(empty);
    return;
  }
  takeHistory.forEach((take) => {
    const item = document.createElement('div');
    item.className = `history-item${take.buffer === currentTakeBuffer ? ' active' : ''}`;
    const details = document.createElement('div');
    details.innerHTML = `<strong></strong><div class="history-meta"></div>`;
    details.querySelector('strong').textContent = take.label;
    details.querySelector('.history-meta').textContent = formatTime(take.duration);
    const load = document.createElement('button');
    load.type = 'button';
    load.textContent = 'Load';
    load.disabled = !take.buffer;
    load.addEventListener('click', () => loadTake(take));
    item.append(details, load);
    takeHistoryList.append(item);
  });
}

function loadTake(take) {
  if (!take.buffer) {
    showMessage('This take is from an earlier session and its temporary audio is no longer available.', 'error');
    return;
  }
  audioPlayer.pause();
  currentTakeBuffer = take.buffer;
  recording = { tempPath: take.tempPath, blob: null };
  takeClip = {
    id: 'take', type: 'take', name: take.label, filePath: '', buffer: currentTakeBuffer,
    start: 0, trimStart: 0, trimEnd: 0, volume: 1, fadeIn: 0, fadeOut: 0, muted: false, solo: false
  };
  renderedBuffer = currentTakeBuffer;
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  recordingUrl = null;
  redoButton.disabled = false;
  saveButton.disabled = false;
  renderTakeHistory();
  renderEditedPreview().catch((error) => showMessage(error.message || 'Could not render this take.', 'error'));
  setStatus('Take ready');
  showMessage(`${take.label} loaded for review.`, 'success');
}

playButton.addEventListener('click', () => {
  if (audioPlayer.paused) audioPlayer.play().catch((error) => showMessage(error.message || 'Playback could not start.', 'error'));
  else audioPlayer.pause();
});
recordButton.addEventListener('click', startRecording);
stopButton.addEventListener('click', stopRecording);
redoButton.addEventListener('click', redoRecording);
saveButton.addEventListener('click', saveTake);
undoButton.addEventListener('click', undoEdit);
redoEditButton.addEventListener('click', redoEdit);
splitButton.addEventListener('click', splitAtPlayhead);
snapButton.addEventListener('click', () => { snapEnabled = !snapEnabled; snapButton.classList.toggle('active', snapEnabled); snapButton.setAttribute('aria-pressed', String(snapEnabled)); persistProject(); });
quickModeToggle.addEventListener('change', () => {
  writeState({ quickMode: quickModeToggle.checked });
  autoSaveToggleWrap.hidden = !quickModeToggle.checked;
  if (!quickModeToggle.checked) {
    quickKeyHeld = false;
    if (mediaRecorder?.state === 'recording') stopRecording();
  }
});
autoSaveToggle.addEventListener('change', () => writeState({ autoSave: autoSaveToggle.checked }));
zoomOutButton.addEventListener('click', () => { zoom = Math.max(MIN_ZOOM, zoom / 1.25); drawTimeline(); persistProject(); });
zoomInButton.addEventListener('click', () => { zoom = Math.min(MAX_ZOOM, zoom * 1.25); drawTimeline(); persistProject(); });
zoomFitButton.addEventListener('click', () => { zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (timelineScroll.clientWidth - 140) / Math.max(1, timelineDuration() * BASE_PIXELS_PER_SECOND))); drawTimeline(); persistProject(); });
chooseFolderButton.addEventListener('click', chooseFolder);
checkUpdatesButton.addEventListener('click', async () => {
  checkUpdatesButton.disabled = true;
  showMessage('Checking for updates…');
  try {
    const result = await window.voiceTakes.checkForUpdates();
    if (!result.available) showMessage('You are running the latest version.', 'success');
  } catch (error) {
    showMessage(error.message || 'Could not check for updates.', 'error');
  } finally {
    checkUpdatesButton.disabled = false;
  }
});
window.voiceTakes.onUpdateAvailable(({ version, releaseNotes }) => {
  updateMessage.textContent = `Version ${version} is available. Install it now?`;
  const notes = formatReleaseNotes(releaseNotes);
  updateNotes.textContent = notes ? `What's included:\n${notes}` : '';
  updateNotes.hidden = !notes;
  updateProgress.style.width = '0%';
  updateProgressLabel.textContent = 'Ready to download';
  updateInstallButton.hidden = false;
  updateSkipButton.hidden = false;
  updateInstallButton.disabled = false;
  updateModal.hidden = false;
});
updateInstallButton.addEventListener('click', async () => {
  updateInstallButton.disabled = true;
  updateSkipButton.hidden = true;
  updateMessage.textContent = 'Downloading update…';
  updateProgressLabel.textContent = 'Starting download…';
  try {
    await window.voiceTakes.downloadUpdate();
  } catch (error) {
    updateInstallButton.disabled = false;
    updateSkipButton.hidden = false;
    updateMessage.textContent = error.message || 'The update could not be downloaded.';
  }
});
updateSkipButton.addEventListener('click', () => { updateModal.hidden = true; });
window.voiceTakes.onUpdateProgress(({ percent }) => {
  updateProgress.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  updateProgressLabel.textContent = `Downloading… ${Math.round(percent)}%`;
});
window.voiceTakes.onUpdateDownloaded(() => {
  updateProgress.style.width = '100%';
  updateProgressLabel.textContent = 'Download complete';
  updateMessage.textContent = 'Successfully updated. Restarting…';
  updateInstallButton.hidden = true;
  setTimeout(() => window.voiceTakes.installUpdate(), 900);
});
window.voiceTakes.onUpdateError(({ message: errorMessage }) => {
  updateMessage.textContent = errorMessage || 'The update could not be completed.';
  updateInstallButton.disabled = false;
  updateSkipButton.hidden = false;
});
recursiveToggle.addEventListener('change', () => { writeState({ recursive: recursiveToggle.checked }); refreshFiles(); });
fileSearch.addEventListener('input', () => { renderFiles(); writeState({ search: fileSearch.value }); });
fileSort.addEventListener('change', () => {
  sortMode = fileSort.value;
  sortFiles();
  writeState({ sortMode });
  renderFiles();
});
markModeButton.addEventListener('click', () => {
  markMode = !markMode;
  markModeButton.classList.toggle('active', markMode);
  markModeButton.setAttribute('aria-pressed', String(markMode));
  clearAllMarksButton.hidden = !markMode;
  if (!markMode) {
    markDrag = null;
    markAnchorPath = null;
  }
});
clearAllMarksButton.addEventListener('click', () => { clearMarksModal.hidden = false; });
clearMarksCancelButton.addEventListener('click', () => { clearMarksModal.hidden = true; });
clearMarksConfirmButton.addEventListener('click', () => {
  savedFiles.clear();
  persistSavedFiles();
  clearMarksModal.hidden = true;
  renderFiles();
  showMessage('All markers in the current folder were cleared.', 'success');
});
document.addEventListener('pointerup', () => {
  if (!markDrag) return;
  suppressMarkClick = markDrag.moved;
  persistSavedFiles();
  markDrag = null;
  renderFiles();
  if (suppressMarkClick) setTimeout(() => { suppressMarkClick = false; }, 0);
});
timelineScroll.addEventListener('scroll', () => { persistProject(); });
audioPlayer.addEventListener('play', () => { playButton.querySelector('span').textContent = 'Pause'; updatePlayhead(); });
audioPlayer.addEventListener('pause', () => { playButton.querySelector('span').textContent = 'Play'; stopPlayhead(); });
audioPlayer.addEventListener('ended', () => { playheadTime = 0; stopPlayhead(); });
audioPlayer.addEventListener('timeupdate', () => { playheadTime = audioPlayer.currentTime; currentTimeLabel.textContent = formatTime(playheadTime); });
audioPlayer.addEventListener('loadedmetadata', () => { durationLabel.textContent = formatTime(timelineDuration()); });
themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
backgroundImageInput.addEventListener('change', () => {
  const [file] = backgroundImageInput.files;
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    if (typeof reader.result !== 'string') {
      showMessage('Could not load that background image.', 'error');
      return;
    }
    try {
      localStorage.setItem(backgroundStateKey, reader.result);
      applyBackgroundImage(reader.result, backgroundFitSelect.value);
      showMessage('Background image applied.', 'success');
    } catch (error) {
      showMessage('That image is too large to save as a background. Choose a smaller image.', 'error');
      console.warn('Could not persist background image:', error);
    }
  }, { once: true });
  reader.addEventListener('error', () => showMessage('Could not load that background image.', 'error'), { once: true });
  reader.readAsDataURL(file);
});
backgroundFitSelect.addEventListener('change', () => {
  localStorage.setItem(backgroundFitStateKey, backgroundFitSelect.value);
  applyBackgroundImage(localStorage.getItem(backgroundStateKey) || '', backgroundFitSelect.value);
});
clearBackgroundButton.addEventListener('click', () => {
  localStorage.removeItem(backgroundStateKey);
  backgroundImageInput.value = '';
  applyBackgroundImage('');
  showMessage('Custom background removed.', 'success');
});
workspaceSplitter.addEventListener('pointerdown', (event) => {
  if (window.matchMedia('(max-width: 980px)').matches) return;
  workspaceSplitter.setPointerCapture(event.pointerId);
  workspaceSplitter.classList.add('dragging');
});
workspaceSplitter.addEventListener('pointermove', (event) => {
  if (!workspaceSplitter.hasPointerCapture(event.pointerId)) return;
  const bounds = workspace.getBoundingClientRect();
  const width = Math.max(240, Math.min(560, event.clientX - bounds.left));
  workspace.style.setProperty('--file-panel-width', `${width}px`);
});
workspaceSplitter.addEventListener('pointerup', (event) => {
  if (!workspaceSplitter.hasPointerCapture(event.pointerId)) return;
  workspace.releasePointerCapture(event.pointerId);
  workspaceSplitter.classList.remove('dragging');
  writeState({ filePanelWidth: parseFloat(getComputedStyle(workspace).getPropertyValue('--file-panel-width')) });
});
workspaceSplitter.addEventListener('pointercancel', () => workspaceSplitter.classList.remove('dragging'));

timelineScroll.addEventListener('dragover', (event) => { event.preventDefault(); dropHint.classList.add('drag-target'); });
timelineScroll.addEventListener('dragleave', () => dropHint.classList.remove('drag-target'));
timelineScroll.addEventListener('drop', (event) => {
  event.preventDefault();
  dropHint.classList.remove('drag-target');
  const rect = waveform.getBoundingClientRect();
  addDroppedFiles(event.dataTransfer.files, Math.max(0, (event.clientX - rect.left - 120) / pixelsPerSecond()));
});
waveform.addEventListener('pointerdown', (event) => {
  const position = eventPosition(event);
  const laneIndex = position.y >= RULER_HEIGHT ? Math.floor((position.y - RULER_HEIGHT) / LANE_HEIGHT) : -1;
  const laneOffsetY = laneIndex >= 0 ? position.y - laneY(laneIndex) : -1;
  const clip = clipAtPosition(position);
  if (!clip) {
    playheadTime = snapTime(position.time);
    audioPlayer.currentTime = Math.min(playheadTime, audioPlayer.duration || timelineDuration());
    drawTimeline();
    return;
  }
  selectedClipId = clip.id;
  pushUndo();
  pointerEdit = { clip, mode: editHandleAtPosition(position, clip), start: position.time, initialStart: clip.start, initialTrimStart: clip.trimStart, initialTrimEnd: clip.trimEnd, initialFadeIn: clip.fadeIn, initialFadeOut: clip.fadeOut, initialVolume: clip.volume, timelineDuration: timelineDuration() };
  waveform.setPointerCapture(event.pointerId);
  drawTimeline();
});
waveform.addEventListener('pointermove', (event) => {
  if (!pointerEdit) {
    updateTimelineCursor(event);
    return;
  }
  const position = eventPosition(event);
  const delta = position.time - pointerEdit.start;
  const clip = pointerEdit.clip;
  if (clip.live) return;
  const available = Math.max(0.01, bufferDuration(clip.buffer) - 0.01);
  if (pointerEdit.mode === 'move') clip.start = snapTime(Math.max(0, pointerEdit.initialStart + delta));
  else if (pointerEdit.mode === 'trim-start') {
    const nextTrim = Math.max(0, Math.min(pointerEdit.initialTrimStart + delta, available - pointerEdit.initialTrimEnd - 0.01));
    clip.trimStart = nextTrim;
    clip.start = Math.max(0, pointerEdit.initialStart + (nextTrim - pointerEdit.initialTrimStart));
  } else if (pointerEdit.mode === 'trim-end') clip.trimEnd = Math.max(0, Math.min(pointerEdit.initialTrimEnd - delta, available - clip.trimStart - 0.01));
  else if (pointerEdit.mode === 'fade-in') clip.fadeIn = Math.max(0, Math.min(clipDuration(clip), position.time - clip.start));
  else if (pointerEdit.mode === 'fade-out') clip.fadeOut = Math.max(0, Math.min(clipDuration(clip), clip.start + clipDuration(clip) - position.time));
  else if (pointerEdit.mode === 'volume') clip.volume = Math.max(0, Math.min(2, 1 + (laneY(layerIndex(clip)) + 51 - position.y) / 12));
  drawTimeline();
});
waveform.addEventListener('pointerup', () => {
  if (!pointerEdit) return;
  pointerEdit = null;
  renderEditedPreview().catch((error) => showMessage(error.message || 'Could not render this edit.', 'error'));
});
waveform.addEventListener('pointercancel', () => { pointerEdit = null; });
waveform.addEventListener('pointerleave', () => { if (!pointerEdit) waveform.style.cursor = 'default'; });
window.addEventListener('resize', drawTimeline);
window.addEventListener('keydown', (event) => {
  const tag = document.activeElement?.tagName;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
  const modifier = event.ctrlKey || event.metaKey;
  if (quickModeToggle.checked && event.key.toLowerCase() === 'r' && !modifier) {
    event.preventDefault();
    if (!quickKeyHeld) {
      quickKeyHeld = true;
      startRecording().then(() => {
        if (!quickKeyHeld && mediaRecorder?.state === 'recording') stopRecording();
      });
    }
    return;
  }
  if (event.code === 'Space') { event.preventDefault(); playButton.click(); }
  else if (event.key.toLowerCase() === 'r' && !modifier) { event.preventDefault(); recordButton.click(); }
  else if (event.key.toLowerCase() === 's' && !modifier) { event.preventDefault(); stopButton.click(); }
  else if (event.key.toLowerCase() === 'x' && !modifier) { event.preventDefault(); splitButton.click(); }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); playheadTime = Math.max(0, playheadTime - (event.shiftKey ? 1 : 0.1)); drawTimeline(); }
  else if (event.key === 'ArrowRight') { event.preventDefault(); playheadTime = Math.min(timelineDuration(), playheadTime + (event.shiftKey ? 1 : 0.1)); drawTimeline(); }
  else if ((event.key === '+' || event.key === '=') && !modifier) { event.preventDefault(); zoomInButton.click(); }
  else if (event.key === '-' && !modifier) { event.preventDefault(); zoomOutButton.click(); }
  else if (event.key === 'Delete' || event.key === 'Backspace') { if (selectedClipId !== null) removeSelectedClip(); }
  else if (modifier && event.shiftKey && event.key.toLowerCase() === 'r') { event.preventDefault(); redoButton.click(); }
  else if (modifier && event.key.toLowerCase() === 'z' && event.shiftKey) { event.preventDefault(); redoEditButton.click(); }
  else if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); undoButton.click(); }
  else if (modifier && event.key.toLowerCase() === 's') { event.preventDefault(); saveButton.click(); }
});
window.addEventListener('keyup', (event) => {
  const tag = document.activeElement?.tagName;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
  if (event.key.toLowerCase() !== 'r' || !quickModeToggle.checked) return;
  event.preventDefault();
  quickKeyHeld = false;
  if (mediaRecorder?.state === 'recording') stopRecording();
});

drawTimeline();
applyTheme(localStorage.getItem('delta-voice-theme') || 'midnight');
const savedBackgroundFit = localStorage.getItem(backgroundFitStateKey) || 'stretch';
applyBackgroundImage(localStorage.getItem(backgroundStateKey) || '', savedBackgroundFit);
const previousState = readState();
recursiveToggle.checked = previousState.recursive === true;
sortMode = ['name', 'modified-desc', 'modified-asc'].includes(previousState.sortMode) ? previousState.sortMode : 'name';
fileSort.value = sortMode;
quickModeToggle.checked = previousState.quickMode === true;
autoSaveToggle.checked = previousState.autoSave === true;
autoSaveToggleWrap.hidden = !quickModeToggle.checked;
const savedPanelWidth = Number(previousState.filePanelWidth);
if (Number.isFinite(savedPanelWidth)) {
  workspace.style.setProperty('--file-panel-width', `${Math.max(240, Math.min(560, savedPanelWidth))}px`);
}
fileSearch.value = typeof previousState.search === 'string' ? previousState.search : '';
if (previousState.folder) {
  activeFolder = previousState.folder;
  folderName.textContent = activeFolder;
  restoreSavedFiles(activeFolder);
  refreshFiles().then(() => {
    const previousFile = files.find((file) => file.path === previousState.selectedFile);
    if (previousFile) return selectFile(previousFile);
    return undefined;
  }).catch((error) => showMessage(error.message || 'Could not restore the previous folder.', 'error'));
}
populateMicrophones();
