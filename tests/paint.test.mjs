// Code-level tests: a small DOM/canvas adapter runs app logic without a browser.
// This does not validate real canvas rasterization, browser layout, or downloads.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const w = 1200, h = 800;
let pixels;
const elements = new Map();
const registrations = new Map();
let download;
let encodedType;
let encodedSize;
function element() {
  const classes = new Set();
  return {
    listeners: {}, dataset: {}, style: { setProperty() {} }, value: '', disabled: false,
    classList: { add: key => classes.add(key), remove: key => classes.delete(key), toggle: (key, value) => value ? classes.add(key) : classes.delete(key) },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    setAttribute(name, value) { this[name] = value; }, removeAttribute(name) { delete this[name]; },
    append() {}, remove() {}, focus() {}, click() { if (this.download) download = { name: this.download, href: this.href }; },
    getBoundingClientRect() { return { left: 0, top: 0, width: w, height: h }; }
  };
}
const select = key => { if (!elements.has(key)) elements.set(key, element()); return elements.get(key); };
function createCanvas(onResize = () => {}) {
  let canvasWidth = w, canvasHeight = h;
  const surface = Object.assign(element(), { data: new Uint8ClampedArray(w * h * 4), clientWidth: w });
  const resize = () => { surface.data = new Uint8ClampedArray(canvasWidth * canvasHeight * 4); onResize(surface.data); };
  Object.defineProperties(surface, {
    width: { get: () => canvasWidth, set: value => { canvasWidth = value; resize(); } },
    height: { get: () => canvasHeight, set: value => { canvasHeight = value; resize(); } }
  });
  const context = {
    getImageData() { return { data: surface.data.slice(), width: canvasWidth, height: canvasHeight }; },
    putImageData(image) { assert.equal(image.width, canvasWidth); assert.equal(image.height, canvasHeight); surface.data.set(image.data); },
    fillRect() { const c = this.fillStyle === '#ffffff' ? 255 : 0; for (let i = 0; i < surface.data.length; i += 4) surface.data.set([c, c, c, 255], i); },
    // Nearest-neighbor test adapter; production uses the browser's drawImage resampling.
    drawImage(source, left, top, drawnWidth, drawnHeight) {
      for (let y = Math.ceil(top); y < top + drawnHeight; y++) {
        for (let x = Math.ceil(left); x < left + drawnWidth; x++) {
          const fromX = Math.min(source.width - 1, Math.floor((x - left) * source.width / drawnWidth));
          const fromY = Math.min(source.height - 1, Math.floor((y - top) * source.height / drawnHeight));
          const from = (fromY * source.width + fromX) * 4;
          surface.data.set(source.data.subarray(from, from + 4), (y * canvasWidth + x) * 4);
        }
      }
    },
    beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {}, rect() {}, ellipse() {}
  };
  Object.assign(surface, {
    getContext: () => context,
    setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {},
    toBlob(callback, type) { encodedType = type; encodedSize = [canvasWidth, canvasHeight]; callback({ type }); }
  });
  onResize(surface.data);
  return surface;
}
elements.set('#canvas', createCanvas(data => { pixels = data; }));
select('#canvas-stage').clientHeight = 600;
const document = {
  querySelector: select, querySelectorAll: () => [], createElement: tag => tag === 'canvas' ? createCanvas() : element(),
  addEventListener() {}, body: element(), modelContext: { registerTool(tool) { registrations.set(tool.name, tool); } }
};
const sandbox = vm.createContext({ document, window: { addEventListener() {} }, Uint8ClampedArray, AbortController,
  ResizeObserver: class { observe() {} }, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
  setTimeout: () => 0, clearTimeout() {} });
vm.runInContext(fs.readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8'), sandbox);
const run = code => vm.runInContext(code, sandbox);
const pixel = (x, y) => { const i = (y * select('#canvas').width + x) * 4; return Array.from(pixels.slice(i, i + 4)); };
const reset = () => run("setCanvasDimensions(1200,800); ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,width,height); history=[]; historyIndex=-1; remember(); savedSnapshot=history[0]; drawing=false;");

test('full-area fill reaches all corners and same-color fill is a no-op', () => {
  reset(); run("setColor('#ef6464'); floodFill(600,400)");
  for (const [x, y] of [[0, 0], [1199, 0], [0, 799], [1199, 799]]) assert.deepEqual(pixel(x, y), [239, 100, 100, 255]);
  assert.equal(run('floodFill(600,400)'), false);
});

test('fill respects a solid boundary and leaves a disconnected region unchanged', () => {
  reset(); for (let y = 0; y < h; y++) pixels.set([0, 0, 0, 255], (y * w + 600) * 4);
  run("setColor('#558de8'); floodFill(100,100)");
  assert.deepEqual(pixel(0, 799), [85, 141, 232, 255]);
  assert.deepEqual(pixel(600, 400), [0, 0, 0, 255]);
  assert.deepEqual(pixel(601, 400), [255, 255, 255, 255]);
});

test('undo and redo restore pixels; editing after undo discards the redo branch', () => {
  reset(); run("setColor('#ef6464'); floodFill(0,0); remember(); undo();");
  assert.deepEqual(pixel(300, 300), [255, 255, 255, 255]);
  run('redo()'); assert.deepEqual(pixel(300, 300), [239, 100, 100, 255]);
  run("undo(); setColor('#558de8'); floodFill(0,0); remember();");
  assert.equal(select('#redo').disabled, true);
  run('redo()'); assert.deepEqual(pixel(300, 300), [85, 141, 232, 255]);
});

test('history remains bounded to 20 snapshots', () => {
  reset(); run('for (let i=0;i<25;i++) remember()');
  assert.equal(run('history.length'), 20); assert.equal(run('historyIndex'), 19);
  run('for (let i=0;i<30;i++) undo()'); assert.equal(run('historyIndex'), 0);
});

test('canceling an in-progress stroke restores the last completed image', () => {
  reset(); run("drawing=true; setColor('#ef6464'); drawing=true; floodFill(0,0); cancelStroke()");
  assert.deepEqual(pixel(50, 50), [255, 255, 255, 255]);
  assert.equal(run('drawing'), false); assert.equal(run('history.length'), 1);
});

test('hex input expands short values and rejects invalid values without changing color', () => {
  const field = select('#hex-color');
  field.value = 'F90'; field.listeners.change({ target: field });
  assert.equal(run('color'), '#ff9900');
  field.value = 'oops'; field.listeners.change({ target: field });
  assert.equal(field['aria-invalid'], 'true'); assert.equal(run('color'), '#ff9900');
});

test('export requests PNG encoding and sanitizes a drawing filename', () => {
  select('#drawing-name').value = 'My / painting:*'; run('exportImage()');
  assert.equal(encodedType, 'image/png'); assert.equal(download.name, 'My - painting--.png');
  assert.equal(run('savedSnapshot === history[historyIndex]'), true);
});

test('optional tools register and valid drawing batches share app settings and undo history', () => {
  reset(); assert.deepEqual([...registrations.keys()], ['get_paint_state', 'draw_paint_paths']);
  const read = registrations.get('get_paint_state'); const draw = registrations.get('draw_paint_paths');
  assert.equal(read.annotations.readOnlyHint, true); assert.equal(draw.annotations.readOnlyHint, false);
  assert.equal(draw.inputSchema.additionalProperties, false);
  const result = draw.execute({ color: '#558DE8', size: 20, paths: [[{ x: 10, y: 20 }, { x: 40, y: 50 }]] });
  assert.equal(result.drawnPaths, 1);
  const state = read.execute({});
  assert.equal(state.color, '#558de8'); assert.equal(state.size, 20); assert.equal(state.tool, 'brush'); assert.equal(state.canUndo, true);
  assert.equal(run('history.length'), 2);
});

test('invalid optional drawing input fails before modifying settings or history', () => {
  const draw = registrations.get('draw_paint_paths');
  const previousState = run('JSON.stringify({color,size,historyIndex})');
  for (const input of [null, { color: '#7655e8', size: 100, paths: [] }, { color: '#7655e8', size: 8, paths: [[{ x: -1, y: 20 }]] }, { color: '#7655e8', size: 8, paths: [[{ x: 10, y: 20 }], []] }]) {
    assert.throws(() => draw.execute(input));
    assert.equal(run('JSON.stringify({color,size,historyIndex})'), previousState);
  }
  assert.throws(() => registrations.get('get_paint_state').execute({ unexpected: true }));
});

test('static entrypoint references only existing local CSS/JS and valid SVG symbols', () => {
  const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"#][^"]*\.(?:css|js))"/g)) assert.ok(fs.existsSync(new URL(`../dist/${match[1]}`, import.meta.url)), match[1]);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  for (const match of html.matchAll(/<use href="#([^"]+)"/g)) assert.ok(ids.has(match[1]), match[1]);
  assert.match(html, /<canvas[^>]*width="1200"[^>]*height="800"/);
});

test('resolution dropdown exposes exactly the requested sizes and keeps the original default', () => {
  const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  const dropdown = html.match(/<select id="canvas-resolution"[^>]*>(.*?)<\/select>/s)[1];
  assert.deepEqual([...dropdown.matchAll(/value="([^"]+)"/g)].map(match => match[1]), ['600x800', '1200x800', '1920x1200']);
  assert.match(dropdown, /value="1200x800" selected/);
});

test('portrait resize preserves and centers the drawing, and undo/redo restore size and pixels', () => {
  reset(); run("setColor('#ef6464'); floodFill(0,0); remember()");
  const dropdown = select('#canvas-resolution');
  dropdown.value = '600x800'; dropdown.listeners.change({ target: dropdown });
  assert.deepEqual([select('#canvas').width, select('#canvas').height], [600, 800]);
  assert.equal(select('#canvas').style.aspectRatio, '600 / 800');
  assert.equal(select('#canvas-frame').style.maxWidth, '405px');
  assert.deepEqual(pixel(300, 100), [255, 255, 255, 255]);
  assert.deepEqual(pixel(300, 400), [239, 100, 100, 255]);
  assert.deepEqual(pixel(300, 700), [255, 255, 255, 255]);
  run('undo()');
  assert.equal(dropdown.value, '1200x800');
  assert.deepEqual([select('#canvas').width, select('#canvas').height], [1200, 800]);
  assert.deepEqual(pixel(1199, 799), [239, 100, 100, 255]);
  run('redo()'); assert.equal(dropdown.value, '600x800');
  assert.deepEqual(pixel(300, 400), [239, 100, 100, 255]);
});

test('large resize updates fill bounds, export resolution, pointer mapping, and agent validation', () => {
  reset(); run('resizeCanvas(1920,1200)');
  assert.equal(select('#canvas-resolution').value, '1920x1200');
  run("setColor('#558de8'); floodFill(1919,1199); remember()");
  assert.deepEqual(pixel(1919, 1199), [85, 141, 232, 255]);
  assert.deepEqual(pixel(0, 0), [85, 141, 232, 255]);
  assert.equal(run('point({clientX:600,clientY:400}).x'), 960);
  assert.equal(run('point({clientX:600,clientY:400}).y'), 600);
  run('exportImage()'); assert.deepEqual(encodedSize, [1920, 1200]);
  const state = registrations.get('get_paint_state').execute({});
  assert.equal(state.width, 1920); assert.equal(state.height, 1200);
  const draw = registrations.get('draw_paint_paths');
  assert.equal(draw.inputSchema.properties.paths.items.items.properties.x.maximum, 1920);
  assert.equal(draw.execute({ color: '#7655e8', size: 8, paths: [[{ x: 1800, y: 1000 }]] }).drawnPaths, 1);
  run('resizeCanvas(600,800)');
  assert.throws(() => draw.execute({ color: '#7655e8', size: 8, paths: [[{ x: 601, y: 700 }]] }));
});

test('resizing to the current size is a no-op and unsupported sizes cannot alter artwork', () => {
  reset(); run('resizeCanvas(1200,800)');
  assert.equal(run('history.length'), 1);
  assert.throws(() => run('resizeCanvas(999,999)'));
  assert.equal(select('#canvas-resolution').value, '1200x800');
  assert.equal(run('history.length'), 1);
  run('resizeCanvas(600,800); undo(); resizeCanvas(1920,1200)');
  assert.equal(select('#redo').disabled, true);
  run('undo()'); assert.equal(select('#canvas-resolution').value, '1200x800');
});
