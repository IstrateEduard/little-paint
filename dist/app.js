'use strict';

const canvas = document.querySelector('#canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const $ = (selector) => document.querySelector(selector);
let width = canvas.width;
let height = canvas.height;
const RESOLUTIONS = ['600x800', '1200x800', '1920x1200'];
const colors = [
  ['#292a32', 'Charcoal'], ['#717583', 'Slate'], ['#b9bdc9', 'Silver'], ['#e0e3eb', 'Cloud'], ['#f2f3f7', 'Mist'], ['#ffffff', 'White'],
  ['#ef6464', 'Red'], ['#f29c50', 'Orange'], ['#f3cb55', 'Yellow'], ['#87bb71', 'Lime'], ['#4da889', 'Green'], ['#55b5bd', 'Teal'],
  ['#558de8', 'Blue'], ['#5b66d8', 'Indigo'], ['#7655e8', 'Violet'], ['#b17bda', 'Lilac'], ['#e083ae', 'Pink'], ['#bc826b', 'Clay']
];
let tool = 'brush';
let color = '#7655e8';
let size = 8;
let drawing = false;
let pointerId = null;
let start = null;
let previous = null;
let history = [];
let historyIndex = -1;
let savedSnapshot = null;
let toastTimer;
const MAX_HISTORY = 20;
const toolNames = { brush: 'Brush', eraser: 'Eraser', fill: 'Fill', line: 'Line', rectangle: 'Rectangle', ellipse: 'Ellipse' };

function notify(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2800);
}

function updateHistoryButtons() {
  $('#undo').disabled = historyIndex <= 0;
  $('#redo').disabled = historyIndex >= history.length - 1;
}

function remember() {
  history.splice(historyIndex + 1);
  history.push(ctx.getImageData(0, 0, width, height));
  if (history.length > MAX_HISTORY) history.shift();
  historyIndex = history.length - 1;
  updateHistoryButtons();
}

function hideHint() { $('#canvas-hint').classList.add('hidden'); }

function fitCanvas() {
  const stage = $('#canvas-stage');
  const availableHeight = Math.max(200, stage.clientHeight - 60);
  $('#canvas-frame').style.maxWidth = `${Math.min(width, availableHeight * width / height)}px`;
  $('#canvas-scale').textContent = `${Math.round(canvas.clientWidth / width * 100)}% · Fit`;
}

function setCanvasDimensions(nextWidth, nextHeight) {
  width = canvas.width = nextWidth;
  height = canvas.height = nextHeight;
  canvas.style.aspectRatio = `${width} / ${height}`;
  $('#canvas-resolution').value = `${width}x${height}`;
  $('#brush-cursor').style.display = 'none';
  fitCanvas();
}

function restoreSnapshot(snapshot) {
  if (width !== snapshot.width || height !== snapshot.height) setCanvasDimensions(snapshot.width, snapshot.height);
  ctx.putImageData(snapshot, 0, 0);
}

function resizeCanvas(nextWidth, nextHeight) {
  if (!RESOLUTIONS.includes(`${nextWidth}x${nextHeight}`)) throw new Error('Choose a supported canvas resolution.');
  if (width === nextWidth && height === nextHeight) return;
  cancelStroke();
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  source.getContext('2d').putImageData(history[historyIndex], 0, 0);
  const scale = Math.min(nextWidth / width, nextHeight / height);
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  setCanvasDimensions(nextWidth, nextHeight);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight);
  remember();
  notify(`Canvas resized to ${width} × ${height}. Undo restores the previous size.`);
}

$('#canvas-resolution').addEventListener('change', event => {
  const [nextWidth, nextHeight] = event.target.value.split('x').map(Number);
  resizeCanvas(nextWidth, nextHeight);
});

function undo() {
  if (drawing) cancelStroke();
  if (historyIndex <= 0) return;
  restoreSnapshot(history[--historyIndex]);
  hideHint();
  updateHistoryButtons();
}

function redo() {
  if (drawing) cancelStroke();
  if (historyIndex >= history.length - 1) return;
  restoreSnapshot(history[++historyIndex]);
  hideHint();
  updateHistoryButtons();
}

function updateSettings() {
  $('#tool-status').textContent = tool === 'fill' ? 'Fill · click an area' : `${toolNames[tool]} · ${size} px`;
  $('#size-label').textContent = tool === 'eraser' ? 'Eraser size' : ['line', 'rectangle', 'ellipse'].includes(tool) ? 'Stroke size' : 'Brush size';
  $('#size-output').innerHTML = `${size} <span>px</span>`;
  $('#brush-size').value = size;
  $('#brush-size').disabled = tool === 'fill';
  $('#preview-dot').style.cssText = `width:${size}px;height:${size}px;background:${tool === 'eraser' ? '#fff' : color};${tool === 'eraser' ? 'box-shadow:0 0 0 1px #d8d9e3' : ''}`;
  document.querySelectorAll('[data-size]').forEach(button => {
    button.classList.toggle('active', Number(button.dataset.size) === size);
    button.setAttribute('aria-pressed', String(Number(button.dataset.size) === size));
    button.disabled = tool === 'fill';
  });
  $('#brush-cursor').style.display = 'none';
}

function selectTool(nextTool) {
  if (drawing) cancelStroke();
  tool = nextTool;
  document.querySelectorAll('[data-tool]').forEach(button => {
    button.classList.toggle('active', button.dataset.tool === tool);
    button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
  });
  updateSettings();
}

function setColor(nextColor) {
  if (drawing) cancelStroke();
  color = nextColor.toLowerCase();
  $('#color-picker').value = color;
  $('#hex-color').value = color.slice(1).toUpperCase();
  $('#hex-color').removeAttribute('aria-invalid');
  $('#color-preview').style.background = color;
  document.querySelectorAll('[data-color]').forEach(button => {
    button.classList.toggle('active', button.dataset.color === color);
    button.setAttribute('aria-pressed', String(button.dataset.color === color));
  });
  updateSettings();
}

colors.forEach(([value, name]) => {
  const button = document.createElement('button');
  button.className = 'swatch';
  button.dataset.color = value;
  button.style.setProperty('--swatch', value);
  button.title = `${name} (${value.toUpperCase()})`;
  button.setAttribute('aria-label', name);
  button.addEventListener('click', () => setColor(value));
  $('#palette').append(button);
});

document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => selectTool(button.dataset.tool)));
document.querySelectorAll('[data-size]').forEach(button => button.addEventListener('click', () => { size = Number(button.dataset.size); updateSettings(); }));
$('#brush-size').addEventListener('input', event => { size = Number(event.target.value); updateSettings(); });
$('#color-picker').addEventListener('input', event => setColor(event.target.value));
$('#hex-color').addEventListener('change', event => {
  let hex = event.target.value.trim().replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(hex)) hex = [...hex].map(char => char + char).join('');
  if (/^[\da-f]{6}$/i.test(hex)) setColor(`#${hex}`);
  else { event.target.setAttribute('aria-invalid', 'true'); notify('Use a hex color like 7655E8 or F90.'); }
});
$('#hex-color').addEventListener('keydown', event => { if (event.key === 'Enter') event.target.blur(); });

function point(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: (event.clientX - bounds.left) * width / bounds.width, y: (event.clientY - bounds.top) * height / bounds.height };
}

function showCursor(event) {
  const cursor = $('#brush-cursor');
  if (!['brush', 'eraser'].includes(tool) || event.pointerType === 'touch') { cursor.style.display = 'none'; return; }
  const bounds = canvas.getBoundingClientRect();
  const diameter = Math.max(3, size * bounds.width / width);
  cursor.style.cssText = `display:block;left:${event.clientX - bounds.left}px;top:${event.clientY - bounds.top}px;width:${diameter}px;height:${diameter}px`;
}

function applyStrokeStyle() {
  ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function renderStroke(end) {
  applyStrokeStyle();
  if (tool === 'brush' || tool === 'eraser') {
    ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    previous = end;
    return;
  }
  ctx.putImageData(history[historyIndex], 0, 0);
  ctx.beginPath();
  if (tool === 'line') { ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); }
  if (tool === 'rectangle') ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
  if (tool === 'ellipse') ctx.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2, Math.abs(end.x - start.x) / 2, Math.abs(end.y - start.y) / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function floodFill(x, y) {
  x = Math.max(0, Math.min(width - 1, Math.floor(x)));
  y = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const image = ctx.getImageData(0, 0, width, height);
  const pixels = image.data;
  const position = (y * width + x) * 4;
  const target = Array.from(pixels.slice(position, position + 4));
  const replacement = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16), 255];
  if (target.every((channel, i) => channel === replacement[i])) return false;
  const matches = (index) => pixels[index] === target[0] && pixels[index + 1] === target[1] && pixels[index + 2] === target[2] && pixels[index + 3] === target[3];
  const stack = [y * width + x];
  while (stack.length) {
    const seed = stack.pop();
    const row = Math.floor(seed / width);
    let column = seed % width;
    if (!matches((row * width + column) * 4)) continue;
    while (column > 0 && matches((row * width + column - 1) * 4)) column--;
    let above = false;
    let below = false;
    while (column < width) {
      const index = (row * width + column) * 4;
      if (!matches(index)) break;
      pixels.set(replacement, index);
      if (row > 0) {
        const matching = matches(index - width * 4);
        if (matching && !above) stack.push((row - 1) * width + column);
        above = matching;
      }
      if (row < height - 1) {
        const matching = matches(index + width * 4);
        if (matching && !below) stack.push((row + 1) * width + column);
        below = matching;
      }
      column++;
    }
  }
  ctx.putImageData(image, 0, 0);
  return true;
}

canvas.addEventListener('pointerdown', event => {
  if (drawing || event.button !== 0 || !event.isPrimary) return;
  event.preventDefault();
  canvas.focus({ preventScroll: true });
  hideHint();
  start = previous = point(event);
  if (tool === 'fill') { if (floodFill(start.x, start.y)) remember(); return; }
  drawing = true;
  pointerId = event.pointerId;
  canvas.setPointerCapture(pointerId);
  applyStrokeStyle();
  if (tool === 'brush' || tool === 'eraser') {
    ctx.beginPath(); ctx.arc(start.x, start.y, size / 2, 0, Math.PI * 2); ctx.fill();
  }
  showCursor(event);
});

canvas.addEventListener('pointermove', event => {
  showCursor(event);
  if (!drawing || event.pointerId !== pointerId) return;
  const samples = ['brush', 'eraser'].includes(tool) && event.getCoalescedEvents ? event.getCoalescedEvents() : [];
  (samples.length ? samples : [event]).forEach(sample => renderStroke(point(sample)));
});

canvas.addEventListener('pointerup', event => {
  if (!drawing || event.pointerId !== pointerId) return;
  renderStroke(point(event));
  drawing = false;
  if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  pointerId = null;
  remember();
});

function cancelStroke() {
  if (!drawing) return;
  drawing = false;
  ctx.putImageData(history[historyIndex], 0, 0);
  if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  pointerId = null;
}

canvas.addEventListener('pointercancel', cancelStroke);
canvas.addEventListener('lostpointercapture', cancelStroke);
canvas.addEventListener('pointerleave', () => { $('#brush-cursor').style.display = 'none'; });
window.addEventListener('blur', cancelStroke);
$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);
$('#clear').addEventListener('click', () => {
  cancelStroke();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
  hideHint(); remember(); notify('Canvas cleared. Undo brings it back.');
});

function exportImage() {
  if (drawing) { drawing = false; if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId); pointerId = null; remember(); }
  const snapshot = history[historyIndex];
  const name = $('#drawing-name').value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').slice(0, 60) || 'Untitled';
  canvas.toBlob(blob => {
    if (!blob) { notify('Could not save the image. Please try again.'); return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${name}.png`;
    document.body.append(link); link.click(); link.remove();
    savedSnapshot = snapshot;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    notify('Your PNG is ready to download.');
  }, 'image/png');
}

$('#export').addEventListener('click', exportImage);
const dialog = $('#shortcut-dialog');
$('#shortcuts').addEventListener('click', () => dialog.showModal());
$('#close-shortcuts').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
});

document.addEventListener('keydown', event => {
  if (event.target.closest('input, select, textarea, [contenteditable="true"]') || dialog.open) return;
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) {
    if (key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    if (key === 'y') { event.preventDefault(); redo(); }
    if (key === 's') { event.preventDefault(); exportImage(); }
    return;
  }
  if (event.altKey) return;
  const shortcuts = { b: 'brush', e: 'eraser', g: 'fill', l: 'line', r: 'rectangle', o: 'ellipse' };
  if (shortcuts[key]) { event.preventDefault(); selectTool(shortcuts[key]); }
  if (key === '[' || key === ']') { event.preventDefault(); size = Math.max(1, Math.min(80, size + (key === ']' ? 1 : -1))); updateSettings(); }
  if (key === 'escape') cancelStroke();
  if (key === '?') { event.preventDefault(); dialog.showModal(); }
});

window.addEventListener('beforeunload', event => {
  if (drawing || history[historyIndex] !== savedSnapshot) { event.preventDefault(); event.returnValue = ''; }
});

ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, width, height);
remember();
savedSnapshot = history[0];
setColor(color);

new ResizeObserver(fitCanvas).observe($('#canvas-stage'));

// Optional agent access uses the same tools, canvas, and undo history as the UI.
const modelContext = document.modelContext;
if (modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const registrations = [
    {
      name: 'get_paint_state',
      title: 'Read paint settings',
      description: 'Read the selected tool, color, brush size, canvas dimensions, and available undo/redo actions. Does not inspect image contents.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object.');
        return { tool, color, size, width, height, canUndo: historyIndex > 0, canRedo: historyIndex < history.length - 1 };
      }
    },
    {
      name: 'draw_paint_paths',
      title: 'Draw on the canvas',
      description: 'Draw a batch of freehand paths in a chosen color and size on the current canvas. Use get_paint_state to read the current width and height; points must be within those bounds. This changes the artwork and can be undone in one step.',
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['color', 'size', 'paths'],
        properties: {
          color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          size: { type: 'integer', minimum: 1, maximum: 80 },
          paths: { type: 'array', minItems: 1, maxItems: 100, items: {
            type: 'array', minItems: 1, maxItems: 1000, items: {
              type: 'object', additionalProperties: false, required: ['x', 'y'],
              properties: { x: { type: 'number', minimum: 0, maximum: 1920 }, y: { type: 'number', minimum: 0, maximum: 1200 } }
            }
          } }
        }
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Object.keys(input).some(key => !['color', 'size', 'paths'].includes(key)) || !/^#[\da-f]{6}$/i.test(input.color) || !Number.isInteger(input.size) || input.size < 1 || input.size > 80) throw new Error('Provide a six-digit hex color and a size from 1 to 80.');
        if (!Array.isArray(input.paths) || !input.paths.length || input.paths.length > 100 || input.paths.some(path => !Array.isArray(path) || !path.length || path.length > 1000 || path.some(p => !p || Object.keys(p).some(key => !['x', 'y'].includes(key)) || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > width || p.y < 0 || p.y > height)) || input.paths.reduce((total, path) => total + path.length, 0) > 5000) throw new Error('Provide 1–100 valid paths, with at most 5000 points in total, within the canvas bounds.');
        if (drawing) throw new Error('Finish the current stroke before drawing more paths.');
        selectTool('brush'); setColor(input.color); size = input.size; updateSettings(); applyStrokeStyle(); hideHint();
        for (const path of input.paths) {
          previous = path[0];
          ctx.beginPath(); ctx.arc(previous.x, previous.y, size / 2, 0, Math.PI * 2); ctx.fill();
          for (const p of path.slice(1)) renderStroke(p);
        }
        remember();
        return { drawnPaths: input.paths.length, color, size, canUndo: historyIndex > 0 };
      }
    }
  ];
  for (const registration of registrations) {
    try { Promise.resolve(modelContext.registerTool(registration, { signal: lifecycle.signal })).catch(() => {}); }
    catch { /* Optional integration must not prevent normal painting. */ }
  }
  window.addEventListener('pagehide', event => { if (!event.persisted) lifecycle.abort(); }, { once: true });
}
