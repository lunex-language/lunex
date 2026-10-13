import CodeMirror from './vendor/codemirror/src/codemirror.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'lunex.playground.workspace.v3';
const EXAMPLE_FILES = {
  'main.lx': `val io = @import("std.io")

fn main() {
  io.log("Hello, World!")
}`,
  'examples/functions.lx': `val io = @import("std.io")

fn add(a, b) {
  a + b
}

val square = fn(x) { x * x }

fn main() {
  io.log(add(2, 3))
  io.log(square(5))
}`,
  'examples/control-flow.lx': `val io = @import("std.io")

fn main() {
  val status = "pending"
  val label = match status {
    "ok" => "success"
    "pending" => "waiting"
    "fail" => "error"
    _ => "unknown"
  }
  io.log(label)
}`,
  'examples/loops.lx': `val io = @import("std.io")

fn main() {
  var i = 0
  while i < 3 {
    io.log(i)
    i = i + 1
  }
  each name in ["Alice", "Bob", "Carol"] {
    io.log("Hello, " + name + "!")
  }
}`,
  'examples/structs.lx': `val io = @import("std.io")

fn Animal(name, sound) {
  val self = struct {
    name = name
    sound = sound

    fn speak() {
      self.name + " says " + self.sound
    }
  }
  self
}

fn main() {
  val cat = Animal("Cat", "Meow")
  io.log(cat.speak())
}`,
  'README.md': `# Lunex project

This workspace contains examples based on the official Lunex documentation.

- Select a file in Explorer to edit it.
- Create files or open files and folders from your device.
- Download a file or export the workspace as a ZIP archive.
- Run the active source file with the embedded Lunex WebAssembly runtime.

The browser runner executes source text through the bundled runtime. It does not provide the native Lunex CLI or a project filesystem for resolving @fimport. Multi-file editing and export are available, but running files that import other workspace files requires the native Lunex CLI.

Official language and CLI documentation: https://github.com/Megamexlevi2/lunex-language` 
};
const FALLBACK_DATA = {
  keywords: ['val', 'var', 'fn', 'struct', 'if', 'else', 'guard', 'unless', 'watch', 'while', 'each', 'in', 'match', 'defer', 'spawn'],
  builtins: ['str', 'num', 'typeof', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'len', 'channel'],
  modules: ['std.io', 'std.fs', 'std.http', 'std.http.router', 'std.http.static', 'std.crypto', 'std.db', 'std.ws', 'std.jwt', 'std.json', 'std.math', 'std.datetime', 'std.os', 'std.regex', 'std.env', 'std.ffi', 'std.testing', 'std.utils'],
  members: { 'std.io': ['log', 'err', 'warn'] },
  moduleDescriptions: {
    'std.io': 'Console input and output',
    'std.fs': 'File system access',
    'std.http': 'HTTP client and server primitives',
    'std.http.router': 'HTTP request routing',
    'std.http.static': 'Static file handling',
    'std.crypto': 'Cryptography and encoding',
    'std.db': 'SQLite-backed document database',
    'std.ws': 'WebSocket client and server',
    'std.jwt': 'JSON Web Token operations',
    'std.json': 'JSON parsing and serialization',
    'std.math': 'Math functions and constants',
    'std.datetime': 'Date and time operations',
    'std.os': 'Operating system utilities',
    'std.regex': 'Regular expression operations',
    'std.env': 'Environment configuration',
    'std.ffi': 'Foreign-function interface',
    'std.testing': 'Tests and assertions',
    'std.utils': 'Array, object, string, and functional helpers'
  },
  globalDocs: {
    str: ['str(value)', 'Convert a value to its Lunex string representation.'],
    num: ['num(value)', 'Convert a value to a number.'],
    typeof: ['typeof(value)', 'Return the runtime type name as a string.'],
    parseInt: ['parseInt(text)', 'Parse an integer from a string.'],
    parseFloat: ['parseFloat(text)', 'Parse a floating-point value from a string.'],
    isNaN: ['isNaN(value)', 'Check whether a value is NaN.'],
    isFinite: ['isFinite(value)', 'Check whether a number is finite.'],
    len: ['len(value)', 'Return the length of an array, string, or object.'],
    channel: ['channel()', 'Create a Lunex channel.']
  },
  snippets: {
    'Main program': { prefix: 'main', body: ['val io = @import("std.io")', '', 'fn main() {', '  io.log("${1:Hello, World!}")', '}'], description: 'Create a Lunex entry point' },
    'Function': { prefix: 'fn', body: ['fn ${1:add}(${2:a}, ${3:b}) {', '  ${4:a + b}', '}'], description: 'Declare a function; the final expression is its result' },
    'Immutable binding': { prefix: 'val', body: 'val ${1:name} = ${2:value}', description: 'Declare an immutable binding' },
    'Mutable binding': { prefix: 'var', body: 'var ${1:count} = ${2:0}', description: 'Declare a mutable binding' },
    'If else': { prefix: 'if', body: ['if ${1:condition} {', '  ${2:expression}', '} else {', '  ${3:expression}', '}'], description: 'Create an if and else expression' },
    'Each loop': { prefix: 'each', body: ['each ${1:item} in ${2:items} {', '  ${3:io.log(item)}', '}'], description: 'Iterate over a collection' },
    'While loop': { prefix: 'while', body: ['while ${1:condition} {', '  ${2:expression}', '}'], description: 'Create a while loop' },
    'Struct value': { prefix: 'struct', body: ['val ${1:animal} = struct {', '  name = ${2:"Cat"}', '  sound = ${3:"Meow"}', '}'], description: 'Create a struct value' },
    'Standard library import': { prefix: 'import', body: 'val ${1:io} = @import("std.${2:io}")', description: 'Import a Lunex standard library module' },
    'Local file import': { prefix: 'fimport', body: 'val ${1:lib} = @fimport("./${2:src/utils}.lx")', description: 'Import a local Lunex source file' },
    'Match expression': { prefix: 'match', body: ['match ${1:status} {', '  "ok" => ${2:"success"}', '  "pending" => ${3:"waiting"}', '  _ => ${4:"unknown"}', '}'], description: 'Match values using expression arms and a fallback pattern' }
  },
  extensionVersion: '0.2.1'
};
let languageData = FALLBACK_DATA;
let editor = null;
let files = new Map(Object.entries(EXAMPLE_FILES));
let activePath = 'main.lx';
let originalFiles = new Map(Object.entries(EXAMPLE_FILES));
let commandSelection = 0;
let runtimePromise = null;
let toastTimer = null;

function safePath(value) {
  const raw = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  const parts = raw.split('/').filter((part) => part && part !== '.');
  if (!parts.length || parts.some((part) => part === '..' || part.includes('\0'))) return '';
  return parts.join('/');
}

function modeForPath(path) {
  const extension = extOf(path);
  if (extension === 'lx') return 'lunex';
  if (['js','mjs','cjs','json','jsonc'].includes(extension)) return 'javascript';
  return 'text/plain';
}

function parentPath(path) {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

function basename(path) {
  return path.split('/').pop() || path;
}

function extOf(path) {
  const name = basename(path);
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index + 1).toLowerCase();
}

function glyphFor(path) {
  const extension = extOf(path);
  if (extension === 'lx') return 'lx';
  if (extension === 'json' || extension === 'jsonc') return 'json';
  if (extension === 'md') return 'md';
  if (['js', 'mjs', 'cjs', 'ts'].includes(extension)) return 'JS';
  if (['html', 'htm'].includes(extension)) return '◇';
  if (['css', 'scss'].includes(extension)) return '#';
  return '·';
}

function setSaveStatus(value, error = false) {
  $('saveStatus').textContent = value;
  $('saveStatus').style.color = error ? '#f08a84' : '';
}

function showToast(message, error = false) {
  const node = document.createElement('div');
  node.className = `ide-toast${error ? ' error' : ''}`;
  node.textContent = message;
  $('toastRegion').append(node);
  setTimeout(() => node.remove(), 3400);
}

function persistWorkspace() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ files: [...files.entries()], activePath, workspaceName: $('workspaceName').textContent }));
    setSaveStatus('Saved in this browser');
  } catch (error) {
    setSaveStatus('Browser storage is full', true);
  }
}

function loadWorkspace() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (stored && Array.isArray(stored.files) && stored.files.length) {
      const restored = stored.files.filter((entry) => Array.isArray(entry) && entry.length === 2 && safePath(entry[0])).map(([path, content]) => [safePath(path), String(content)]);
      if (restored.length) {
        files = new Map(restored);
        activePath = files.has(safePath(stored.activePath)) ? safePath(stored.activePath) : files.keys().next().value;
        if (stored.workspaceName) $('workspaceName').textContent = String(stored.workspaceName).slice(0, 60);
        originalFiles = new Map(restored);
        return;
      }
    }
  } catch (error) {
    try { localStorage.removeItem(STORAGE_KEY); } catch (storageError) {}
  }
  files = new Map(Object.entries(EXAMPLE_FILES));
  originalFiles = new Map(files);
  activePath = 'main.lx';
}

function renderExplorer() {
  const list = $('fileList');
  list.replaceChildren();
  const sorted = [...files.keys()].sort((a, b) => a.localeCompare(b));
  const directories = new Set();
  sorted.forEach((path) => {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join('/'));
  });
  const allPaths = [...new Set([...directories, ...sorted])].sort((a, b) => {
    const aDir = directories.has(a);
    const bDir = directories.has(b);
    if (aDir !== bDir && parentPath(a) === parentPath(b)) return aDir ? -1 : 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });
  if (!allPaths.length) {
    const empty = document.createElement('div');
    empty.className = 'ide-empty';
    empty.textContent = 'This workspace is empty. Create a file or open files from your device.';
    list.append(empty);
  }
  allPaths.forEach((path) => {
    const isDirectory = directories.has(path);
    const row = document.createElement('div');
    row.className = `file-tree-row${path === activePath ? ' is-active' : ''}${isDirectory ? ' is-directory' : ''}`;
    row.style.setProperty('--depth', String(path.split('/').length - 1));
    row.setAttribute('role', isDirectory ? 'presentation' : 'button');
    if (!isDirectory) row.tabIndex = 0;
    const glyph = document.createElement('span');
    glyph.className = `file-glyph ${glyphFor(path)}`;
    glyph.textContent = isDirectory ? '▸' : glyphFor(path);
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = basename(path);
    if (isDirectory) {
      glyph.textContent = '▾';
      row.append(glyph, name);
    } else {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'file-delete';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Delete ${path}`);
      remove.title = 'Remove file from workspace';
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        removeFile(path);
      });
      row.append(glyph, name, remove);
      row.addEventListener('click', () => openFile(path));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openFile(path);
        }
      });
    }
    list.append(row);
  });
  $('fileCount').textContent = `${files.size} file${files.size === 1 ? '' : 's'}`;
  $('projectTitle').textContent = ($('workspaceName').textContent || 'LUNEX PROJECT').toUpperCase();
  renderTabs();
}

function renderTabs() {
  const tabs = $('tabStrip');
  tabs.replaceChildren();
  const paths = [...files.keys()].sort((a, b) => a === activePath ? -1 : b === activePath ? 1 : a.localeCompare(b));
  paths.forEach((path) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `file-tab${path === activePath ? ' is-active' : ''}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(path === activePath));
    const glyph = document.createElement('span');
    glyph.className = `file-glyph ${glyphFor(path)}`;
    glyph.textContent = glyphFor(path);
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = basename(path);
    tab.append(glyph, name);
    if (files.get(path) !== originalFiles.get(path)) {
      const dot = document.createElement('span');
      dot.className = 'tab-unsaved';
      dot.title = 'Changed since the last download';
      tab.append(dot);
    }
    tab.addEventListener('click', () => openFile(path));
    tabs.append(tab);
  });
  updateBreadcrumbs();
}

function updateBreadcrumbs() {
  const crumbs = $('breadcrumbs');
  crumbs.replaceChildren();
  const parts = ['workspace', ...activePath.split('/')];
  parts.forEach((part, index) => {
    if (index) {
      const divider = document.createElement('span');
      divider.className = 'crumb-divider';
      divider.textContent = '›';
      crumbs.append(divider);
    }
    const item = document.createElement('span');
    item.textContent = part;
    if (index < parts.length - 1) item.className = 'crumb-muted';
    crumbs.append(item);
  });
  $('editorFileStatus').textContent = activePath;
}

function openFile(path) {
  if (!files.has(path)) return;
  if (editor && files.has(activePath)) files.set(activePath, editor.getValue());
  activePath = path;
  if (editor) {
    editor.setValue(files.get(path));
    editor.setOption('mode', modeForPath(path));
  }
  renderExplorer();
  if (window.matchMedia('(max-width: 760px)').matches) $('ideWorkbench').classList.remove('sidebar-open');
  if (editor) editor.focus();
  persistWorkspace();
}

function addFile(path, content = '') {
  const clean = safePath(path);
  if (!clean) {
    showToast('Enter a valid file path.', true);
    return false;
  }
  if (files.has(clean)) {
    showToast('A file with that name already exists.', true);
    return false;
  }
  files.set(clean, String(content));
  openFile(clean);
  renderExplorer();
  persistWorkspace();
  showToast(`${clean} added to the workspace.`);
  return true;
}

function removeFile(path) {
  if (!files.has(path)) return;
  if (files.size === 1) {
    showToast('Keep at least one file in the workspace.', true);
    return;
  }
  if (!confirm(`Remove ${path} from this workspace?`)) return;
  files.delete(path);
  if (activePath === path) activePath = files.keys().next().value;
  editor.setValue(files.get(activePath) || '');
  renderExplorer();
  persistWorkspace();
  showToast(`${path} removed.`);
}

function openFilePicker() {
  $('filePicker').click();
}

async function importDeviceFiles(fileList, useRelativePaths = false) {
  const selected = [...fileList];
  if (!selected.length) return;
  let imported = 0;
  for (const file of selected) {
    const path = safePath(useRelativePaths && file.webkitRelativePath ? file.webkitRelativePath : file.name);
    if (!path) continue;
    const text = await file.text();
    files.set(path, text);
    imported++;
  }
  if (imported) {
    const first = selected[0];
    const firstPath = safePath(useRelativePaths && first.webkitRelativePath ? first.webkitRelativePath : first.name);
    if (files.has(firstPath)) {
      activePath = firstPath;
      editor.setValue(files.get(activePath));
    }
    renderExplorer();
    persistWorkspace();
    showToast(`${imported} file${imported === 1 ? '' : 's'} opened.`);
  }
  $('filePicker').value = '';
  $('folderPicker').value = '';
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadCurrentFile() {
  const content = editor.getValue();
  files.set(activePath, content);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, basename(activePath));
  originalFiles.set(activePath, content);
  renderExplorer();
  persistWorkspace();
  showToast(`${activePath} downloaded.`);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const put16 = (view, at, value) => view.setUint16(at, value, true);
  const put32 = (view, at, value) => view.setUint32(at, value >>> 0, true);
  entries.forEach(([path, content]) => {
    const cleanName = safePath(path);
    if (!cleanName) return;
    const name = encoder.encode(cleanName);
    const data = encoder.encode(String(content));
    const crc = crc32(data);
    const localHeader = new Uint8Array(30);
    const lv = new DataView(localHeader.buffer);
    put32(lv, 0, 0x04034b50); put16(lv, 4, 20); put16(lv, 6, 0x0800); put16(lv, 8, 0);
    put16(lv, 10, dosTime); put16(lv, 12, dosDate); put32(lv, 14, crc); put32(lv, 18, data.length); put32(lv, 22, data.length); put16(lv, 26, name.length); put16(lv, 28, 0);
    locals.push(localHeader, name, data);
    const centralHeader = new Uint8Array(46);
    const cv = new DataView(centralHeader.buffer);
    put32(cv, 0, 0x02014b50); put16(cv, 4, 20); put16(cv, 6, 20); put16(cv, 8, 0x0800); put16(cv, 10, 0);
    put16(cv, 12, dosTime); put16(cv, 14, dosDate); put32(cv, 16, crc); put32(cv, 20, data.length); put32(cv, 24, data.length);
    put16(cv, 28, name.length); put16(cv, 30, 0); put16(cv, 32, 0); put16(cv, 34, 0); put16(cv, 36, 0); put32(cv, 38, 0); put32(cv, 42, offset);
    centrals.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  });
  const centralSize = centrals.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  put32(ev, 0, 0x06054b50); put16(ev, 4, 0); put16(ev, 6, 0); put16(ev, 8, entries.length); put16(ev, 10, entries.length); put32(ev, 12, centralSize); put32(ev, 16, offset); put16(ev, 20, 0);
  return new Blob([...locals, ...centrals, end], { type: 'application/zip' });
}

function exportWorkspace() {
  if (files.has(activePath)) files.set(activePath, editor.getValue());
  const entries = [...files.entries()].sort(([a], [b]) => a.localeCompare(b));
  const blob = makeZip(entries);
  const name = ($('workspaceName').textContent.trim() || 'lunex-project').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  downloadBlob(blob, `${name}.zip`);
  originalFiles = new Map(files);
  renderExplorer();
  persistWorkspace();
  showToast(`Project exported with ${files.size} files.`);
}

function maskSource(source) {
  const result = source.split('');
  const blank = (start, end) => {
    for (let index = start; index < end; index++) if (result[index] !== '\n' && result[index] !== '\r') result[index] = ' ';
  };
  let index = 0;
  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];
    if (current === '/' && next === '/') {
      const start = index;
      while (index < source.length && source[index] !== '\n') index++;
      blank(start, index);
      continue;
    }
    if (current === '/' && next === '*') {
      const start = index;
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index++;
      if (index < source.length) index += 2;
      blank(start, index);
      continue;
    }
    if (current === '"' || current === "'" || current === '`') {
      const start = index;
      const quote = current;
      index++;
      while (index < source.length) {
        if (source[index] === '\\') { index = Math.min(source.length, index + 2); continue; }
        if (source[index] === quote) { index++; break; }
        index++;
      }
      blank(start, index);
      continue;
    }
    index++;
  }
  return result.join('');
}

function addOutputLine(text, type = '') {
  const target = $('outputView');
  const empty = target.querySelector('.output-placeholder');
  if (empty) empty.remove();
  const line = document.createElement('div');
  line.className = `output-line${type ? ` ${type}` : ''}`;
  line.textContent = String(text);
  target.append(line);
  target.scrollTop = target.scrollHeight;
}

function setOutput(lines, type = '') {
  $('outputView').replaceChildren();
  if (!lines.length) {
    const empty = document.createElement('div');
    empty.className = 'output-placeholder';
    empty.textContent = 'Run a Lunex file to see its output here.';
    $('outputView').append(empty);
  } else {
    lines.forEach((line) => addOutputLine(line, type));
  }
}

function switchPanel(name = 'output') {
  document.querySelectorAll('.bottom-tab').forEach((tab) => {
    const active = tab.dataset.panel === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.panel-view').forEach((panel) => {
    const active = panel.id === `${name}View`;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  });
  $('bottomPanel').hidden = false;
  $('showBottomPanel').hidden = true;
}

async function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = import('./wasm/lunex-browser.js').then(async (module) => {
      const oldLog = console.log;
      const oldError = console.error;
      console.log = () => {};
      console.error = () => {};
      try {
        const runtime = await module.loadLunex();
        if (!runtime || typeof runtime.run !== 'function') throw new Error('The browser runtime does not expose Lunex.run(source).');
        return runtime;
      } finally {
        console.log = oldLog;
        console.error = oldError;
      }
    }).catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

function safeOutputValue(value) {
  try {
    if (value === null || value === undefined) return String(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  } catch (error) {
    return String(value);
  }
}

async function runFile(path = activePath) {
  if (!files.has(path)) {
    setOutput([`File not found: ${path}`], 'error');
    return false;
  }
  const source = path === activePath ? editor.getValue() : files.get(path);
  files.set(path, source);
  if (!source.trim()) {
    setOutput(['No source code to run.'], 'error');
    return false;
  }
  if (/@fimport\s*\(/.test(source)) {
    setOutput([
      'This file uses @fimport, which requires the native Lunex CLI.',
      'The browser runtime does not expose a project filesystem for resolving imported files.'
    ], 'warning');
    return false;
  }
  $('runCode').disabled = true;
  $('runCode').innerHTML = '<span class="play-triangle">◌</span><span>Running</span>';
  switchPanel('output');
  setOutput(['Starting Lunex WebAssembly…'], 'system');
  const started = performance.now();
  const captured = [];
  try {
    const runtime = await loadRuntime();
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...values) => captured.push(values.map((value) => typeof value === 'string' ? value : safeOutputValue(value)).join(' '));
    console.error = (...values) => captured.push(values.map((value) => typeof value === 'string' ? value : safeOutputValue(value)).join(' '));
    let result;
    try {
      result = runtime.run(source);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
    const elapsed = `${Math.max(1, Math.round(performance.now() - started))} ms`;
    const isError = result && result.ok === false;
    const lines = captured.slice();
    if (isError) lines.push(result.error || 'The program returned an error.');
    if (!lines.length) lines.push(isError ? 'Program failed without an error message.' : 'Program finished successfully with no output.');
    setOutput(lines, isError ? 'error' : captured.length ? '' : 'system');
    addOutputLine(`Finished in ${elapsed}`, 'system');
    setSaveStatus(isError ? 'Execution returned an error' : 'Execution finished');
    return !isError;
  } catch (error) {
    const detail = error?.message || String(error);
    setOutput([`Could not start Lunex WebAssembly: ${detail}`, 'Open this site through HTTP or HTTPS and keep the wasm folder beside the page.'], 'error');
    setSaveStatus('Runtime failed to load', true);
    return false;
  } finally {
    $('runCode').disabled = false;
    $('runCode').innerHTML = '<span class="play-triangle">▶</span><span>Run</span><kbd>Ctrl ↵</kbd>';
  }
}

function snippetsFor(data) {
  return Object.entries(data.snippets || {}).map(([name, item]) => ({ name, ...item }));
}

function resolveModule(source, alias) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b(?:val|var)\\s+${escaped}\\s*=\\s*@import\\s*\\(\\s*['"](std\\.[A-Za-z0-9_.-]+)['"]\\s*\\)`);
  const match = source.match(pattern);
  return match ? match[1] : '';
}

function snippetText(body) {
  const source = Array.isArray(body) ? body.join('\n') : String(body || '');
  let output = '';
  let first = -1;
  let final = -1;
  const pattern = /\$\{(\d+):([^}]+)\}|\$(\d+)/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(source))) {
    output += source.slice(last, match.index);
    const index = Number(match[1] || match[3]);
    const value = match[2] || '';
    if (index === 1 && first < 0) first = output.length;
    if (index === 0) final = output.length;
    output += value;
    last = pattern.lastIndex;
  }
  output += source.slice(last);
  return { text: output, cursor: first >= 0 ? first : final >= 0 ? final : output.length };
}

function buildHintData(cm) {
  const cursor = cm.getCursor();
  const source = cm.getValue();
  const line = cm.getLine(cursor.line);
  const before = line.slice(0, cursor.ch);
  const memberMatch = /([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)?$/.exec(before);
  const token = cm.getTokenAt(cursor);
  let start = token.start;
  let prefix = line.slice(start, cursor.ch);
  const candidates = [];
  const add = (label, text, detail = '', kind = 'text', matcher = label.toLowerCase()) => candidates.push({ label, text, detail, kind, matcher: matcher.toLowerCase() });
  if (memberMatch) {
    const alias = memberMatch[1];
    prefix = memberMatch[2] || '';
    start = cursor.ch - prefix.length;
    const moduleName = resolveModule(source, alias);
    const names = moduleName && languageData.members[moduleName] ? languageData.members[moduleName] : [];
    names.forEach((name) => add(name, /^[a-z]/.test(name) && !['width','height','length','port','host','name','path','secure'].includes(name) ? `${name}($0)` : name, `${moduleName || 'Lunex'} member`, 'member'));
  } else {
    languageData.keywords.forEach((name) => add(name, name, 'Lunex keyword', 'keyword'));
    languageData.builtins.forEach((name) => add(name, ['str','num','typeof','parseInt','parseFloat','len','isNaN','isFinite','channel'].includes(name) ? `${name}($0)` : name, languageData.globalDocs?.[name]?.[1] || 'Lunex built-in', 'builtin'));
    languageData.modules.forEach((name) => add(name, name, languageData.moduleDescriptions[name] || 'Standard library module', 'module'));
    const localNames = new Set();
    const declarationPattern = /\bfn\s+([A-Za-z_$][\w$]*)\s*(?=\()|\b(?:val|var)\s+([A-Za-z_$][\w$]*)/g;
    let declaration;
    while ((declaration = declarationPattern.exec(maskSource(source)))) {
      const name = declaration[1] || declaration[2] || declaration[3];
      if (name) localNames.add(name);
    }
    localNames.forEach((name) => add(name, name, 'Workspace symbol', 'local'));
    snippetsFor(languageData).forEach((snippet) => add(snippet.prefix, snippet.prefix, snippet.description || snippet.name, 'snippet', snippet.prefix));
  }
  const unique = new Map();
  candidates.forEach((candidate) => {
    const key = `${candidate.label}:${candidate.kind}`;
    if (!unique.has(key)) unique.set(key, candidate);
  });
  const filtered = [...unique.values()].filter((item) => !prefix || item.matcher.startsWith(prefix.toLowerCase()) || item.label.toLowerCase().startsWith(prefix.toLowerCase()));
  filtered.sort((a, b) => {
    const aExact = a.label.toLowerCase() === prefix.toLowerCase() ? 0 : 1;
    const bExact = b.label.toLowerCase() === prefix.toLowerCase() ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const aSnippet = a.kind === 'snippet' ? 0 : 1;
    const bSnippet = b.kind === 'snippet' ? 0 : 1;
    return aSnippet - bSnippet || a.label.localeCompare(b.label);
  });
  return { list: filtered.slice(0, 100), from: CodeMirror.Pos(cursor.line, start), to: cursor };
}

function registerAutocomplete() {
  CodeMirror.registerHelper('hint', 'lunex', (cm) => {
    const hintData = buildHintData(cm);
    hintData.list = hintData.list.map((item) => {
      const suggestion = { text: item.text, displayText: item.label, className: `hint-${item.kind}` };
      suggestion.render = (element) => {
        const label = document.createElement('span');
        label.textContent = item.label;
        const detail = document.createElement('span');
        detail.className = 'hint-detail';
        detail.textContent = item.detail;
        element.append(label, detail);
      };
      suggestion.hint = (instance, data, cursor) => {
        if (item.kind === 'snippet') {
          const snippet = languageData.snippets && Object.values(languageData.snippets).find((entry) => entry.prefix === item.label);
          const parsed = snippetText(snippet ? snippet.body : item.text);
          const offset = instance.indexFromPos(data.from);
          instance.replaceRange(parsed.text, data.from, data.to, '+input');
          instance.setCursor(instance.posFromIndex(offset + parsed.cursor));
        } else if (item.text.includes('$0')) {
          const clean = item.text.replace(/\$0/g, '');
          const offset = instance.indexFromPos(data.from);
          const selection = clean.length;
          instance.replaceRange(clean, data.from, data.to, '+input');
          const cursorAt = Math.max(0, offset + item.text.indexOf('$0'));
          instance.setCursor(instance.posFromIndex(cursorAt));
        } else {
          instance.replaceRange(item.text, data.from, data.to, '+input');
          instance.setCursor(instance.posFromIndex(instance.indexFromPos(data.from) + item.text.length));
        }
      };
      return suggestion;
    });
    return hintData;
  });
}

function defineLunexMode() {
  const keywordSet = new Set(languageData.keywords);
  const builtinSet = new Set(languageData.builtins);
  const moduleSet = new Set(languageData.modules);
  CodeMirror.defineMode('lunex', () => ({
    startState: () => ({ blockComment: false, string: '' }),
    token(stream, state) {
      if (state.blockComment) {
        if (stream.skipTo('*/')) { stream.match('*/'); state.blockComment = false; }
        else stream.skipToEnd();
        return 'comment';
      }
      if (stream.eatSpace()) return null;
      if (stream.match('//')) { stream.skipToEnd(); return 'comment'; }
      if (stream.match('/*')) {
        if (stream.skipTo('*/')) stream.match('*/');
        else { stream.skipToEnd(); state.blockComment = true; }
        return 'comment';
      }
      if (stream.match(/@(?:import|fimport)\b/)) return 'meta';
      const ch = stream.peek();
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = stream.next();
        let escaped = false;
        while (!stream.eol()) {
          const value = stream.next();
          if (escaped) escaped = false;
          else if (value === '\\') escaped = true;
          else if (value === quote) break;
        }
        return 'string';
      }
      if (stream.match(/^(?:0[xX][\da-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/)) return 'number';
      if (stream.match(/^[A-Za-z_$][\w$]*/)) {
        const word = stream.current();
        if (['true','false','null'].includes(word)) return 'atom';
        if (keywordSet.has(word)) return 'keyword';
        if (builtinSet.has(word)) return 'builtin';
        if (moduleSet.has(word)) return 'meta';
        return null;
      }
      if (stream.match(/^(?:==|!=|<=|>=|=>|[=+*/%&|^~<>!?@-])/)) return 'operator';
      if (stream.match(/[{}()[\],.;:]/)) return 'bracket';
      stream.next();
      return null;
    },
    lineComment: '//',
    blockCommentStart: '/*',
    blockCommentEnd: '*/',
    fold: 'brace'
  }));
  CodeMirror.defineMIME('text/x-lunex', 'lunex');
}

function updateCursorStatus() {
  if (!editor) return;
  const cursor = editor.getCursor();
  $('cursorStatus').textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`;
}

function autoHint(cm, change) {
  if (!change || change.origin === 'setValue' || change.origin === 'undo' || change.origin === 'redo') return;
  const inserted = change.text.join('\n');
  if (inserted.length !== 1 || !/[A-Za-z0-9_$.@]/.test(inserted)) return;
  const token = cm.getTokenAt(cm.getCursor());
  if (token.type && /string|comment/.test(token.type)) return;
  if (cm.state.completionActive) return;
  CodeMirror.showHint(cm, CodeMirror.hint.lunex, { completeSingle: false, closeOnUnfocus: true, alignWithWord: true });
}

function runCurrentFile() {
  if (editor) files.set(activePath, editor.getValue());
  runFile(activePath);
}

const COMMANDS = [
  { title: 'Run current file', detail: 'Run with the Lunex WebAssembly runtime', key: 'Ctrl Enter', action: runCurrentFile, icon: '▶' },
  { title: 'Create new file', detail: 'Add a file to the workspace', key: '', action: () => promptNewFile(), icon: '+' },
  { title: 'Open files from device', detail: 'Import multiple files', key: '', action: openFilePicker, icon: '↥' },
  { title: 'Open folder from device', detail: 'Import a project folder', key: '', action: () => $('folderPicker').click(), icon: '▱' },
  { title: 'Download current file', detail: 'Save the active file to your device', key: 'Ctrl S', action: downloadCurrentFile, icon: '↓' },
  { title: 'Export project as ZIP', detail: 'Download every workspace file', key: 'Ctrl Shift S', action: exportWorkspace, icon: '▣' },
  { title: 'Reset example project', detail: 'Replace the workspace with the starter files', key: '', action: resetWorkspace, icon: '↺' },
  { title: 'Download VS Code extension', detail: 'Lunex Language Support for VS Code Web', key: '', action: () => downloadExtension(), icon: '↗' },
  { title: 'Open repository in VS Code Web', detail: 'Open the Lunex repository in VS Code Web', key: '', action: () => window.open('https://vscode.dev/github/Megamexlevi2/lunex-language', '_blank', 'noopener'), icon: '↗' }
];

function renderCommandList(filter = '') {
  const list = $('commandList');
  list.replaceChildren();
  const items = COMMANDS.filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(filter.toLowerCase()));
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'ide-empty';
    empty.textContent = 'No actions match your search.';
    list.append(empty);
    return;
  }
  commandSelection = Math.min(commandSelection, items.length - 1);
  items.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `command-option${index === commandSelection ? ' is-selected' : ''}`;
    const icon = document.createElement('span'); icon.textContent = item.icon;
    const title = document.createElement('span'); title.textContent = item.title;
    const key = document.createElement('span'); key.textContent = item.key || item.detail;
    button.append(icon, title, key);
    button.addEventListener('click', () => { closeCommandPalette(); item.action(); });
    list.append(button);
  });
}

function openCommandPalette() {
  $('commandOverlay').hidden = false;
  $('commandSearch').value = '';
  commandSelection = 0;
  renderCommandList();
  $('commandSearch').focus();
}

function closeCommandPalette() {
  $('commandOverlay').hidden = true;
  if (editor) editor.focus();
}

function promptNewFile() {
  const path = prompt('New file path', 'src/new-file.lx');
  if (path === null) return;
  addFile(path, '');
}

function downloadExtension() {
  const anchor = document.createElement('a');
  anchor.href = 'downloads/lunex-language.vsix';
  anchor.download = 'lunex-language.vsix';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  showToast('Downloading the Lunex VS Code Web extension.');
}

function resetWorkspace() {
  if (!confirm('Replace the current workspace with the Lunex starter project? Download your files first if you want to keep them.')) return;
  files = new Map(Object.entries(EXAMPLE_FILES));
  originalFiles = new Map(files);
  activePath = 'main.lx';
  $('workspaceName').textContent = 'Lunex Project';
  editor.setValue(files.get(activePath));
  renderExplorer();
  setOutput([]);
  persistWorkspace();
  showToast('Starter project restored.');
}

function setupDragAndDrop() {
  const target = $('fileExplorer');
  target.addEventListener('dragover', (event) => { event.preventDefault(); target.classList.add('is-drop-target'); });
  target.addEventListener('dragleave', (event) => { if (!target.contains(event.relatedTarget)) target.classList.remove('is-drop-target'); });
  target.addEventListener('drop', async (event) => {
    event.preventDefault();
    target.classList.remove('is-drop-target');
    const dropped = [...(event.dataTransfer?.files || [])];
    if (dropped.length) await importDeviceFiles(dropped, false);
  });
}

function readExtensionCache() {
  try {
    const cached = JSON.parse(localStorage.getItem('lunex.playground.extension-cache.v4') || 'null');
    if (cached && cached.data && Date.now() - cached.checkedAt < 3600000) return cached.data;
  } catch (error) {
    try { localStorage.removeItem('lunex.playground.extension-cache.v4'); } catch (storageError) {}
  }
  return null;
}

function writeExtensionCache(data) {
  try {
    localStorage.setItem('lunex.playground.extension-cache.v4', JSON.stringify({ checkedAt: Date.now(), data }));
  } catch (error) {
    return;
  }
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('Raw DEFLATE is unavailable in this browser.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readVsixEntries(buffer, requiredNames) {
  const bytes = buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer)
    : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let endOffset = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index--) {
    if (view.getUint32(index, true) === 0x06054b50) { endOffset = index; break; }
  }
  if (endOffset < 0) throw new Error('The VSIX archive has no ZIP directory.');
  const count = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  const entries = new Map();
  for (let index = 0; index < count; index++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('The VSIX ZIP directory is invalid.');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (requiredNames.has(name)) {
      if (uncompressedSize > 4000000) throw new Error('The extension file is larger than expected.');
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('A VSIX file entry is invalid.');
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
      let data;
      if (method === 0) data = compressed;
      else if (method === 8) data = await inflateRaw(compressed);
      else throw new Error(`Unsupported VSIX compression method: ${method}`);
      if (data.length !== uncompressedSize) throw new Error(`The VSIX entry ${name} has an unexpected size.`);
      entries.set(name, decoder.decode(data));
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function parseExtensionData(source, packageJson, snippets) {
  const readTemplate = (name) => {
    const match = source.match(new RegExp('const\\s+' + name + '\\s*=\\s*`([^`]*)`'));
    return match ? match[1].split(/\s+/).filter(Boolean) : [];
  };
  const keywords = readTemplate('KEYWORDS');
  const builtins = readTemplate('BUILTINS');
  const moduleBody = source.match(/const MODULES\s*=\s*\[([\s\S]*?)\n\]/);
  const modules = moduleBody ? [...moduleBody[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]) : [];
  const readTemplateObject = (name) => {
    const block = source.match(new RegExp('const\\s+' + name + '\\s*=\\s*\{([\\s\\S]*?)\\n\\}'));
    const out = {};
    if (block) for (const match of block[1].matchAll(/\s*"([^"]+)"\s*:\s*`([^`]*)`\s*,?/g)) out[match[1]] = match[2].split(/\s+/).filter(Boolean);
    return out;
  };
  const members = readTemplateObject('MEMBERS');
  const descriptions = {};
  const descriptionBlock = source.match(/const MODULE_DESCRIPTIONS\s*=\s*\{([\s\S]*?)\n\}/);
  if (descriptionBlock) for (const match of descriptionBlock[1].matchAll(/\s*"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?/g)) descriptions[match[1]] = JSON.parse('"' + match[2] + '"');
  const globalDocs = {};
  const docsBlock = source.match(/const GLOBAL_DOCS\s*=\s*\{([\s\S]*?)\n\}/);
  if (docsBlock) {
    const pattern = /^\s*(?:([A-Za-z_$][\w$]*)|"([^"]+)")\s*:\s*\["((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"\]\s*,?/gm;
    for (const match of docsBlock[1].matchAll(pattern)) globalDocs[match[1] || match[2]] = [JSON.parse('"' + match[3] + '"'), JSON.parse('"' + match[4] + '"')];
  }
  if (!keywords.length || !builtins.length || !modules.length) throw new Error('Lunex language data is missing from the VSIX.');
  return { keywords, builtins, modules, members, moduleDescriptions: descriptions, globalDocs, snippets, extensionVersion: packageJson.version || 'unknown' };
}

async function parseVsix(buffer) {
  const required = new Set(['extension/package.json', 'extension/extension.web.js', 'extension/snippets/lunex.json']);
  const entries = await readVsixEntries(buffer, required);
  if (![...required].every((name) => entries.has(name))) throw new Error('The VSIX is missing Lunex language files.');
  return parseExtensionData(entries.get('extension/extension.web.js'), JSON.parse(entries.get('extension/package.json')), JSON.parse(entries.get('extension/snippets/lunex.json')));
}

async function loadBundledExtensionData() {
  const cached = readExtensionCache();
  if (cached) return { ...FALLBACK_DATA, ...cached };
  try {
    const response = await fetch('./downloads/lunex-language.vsix', { cache: 'no-cache' });
    if (response.ok) {
      const data = await parseVsix(await response.arrayBuffer());
      return { ...FALLBACK_DATA, ...data };
    }
  } catch (error) {
    setSaveStatus('Using built-in language data');
  }
  try {
    const response = await fetch('./lunex-extension-data.json', { cache: 'no-cache' });
    if (response.ok) return { ...FALLBACK_DATA, ...(await response.json()) };
  } catch (error) {
    return FALLBACK_DATA;
  }
  return FALLBACK_DATA;
}

function compareVersions(left, right) {
  const parse = (value) => String(value || '0').replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

async function refreshLatestExtensionData() {
  const cached = readExtensionCache();
  if (cached) return;
  const lastChecked = Number(localStorage.getItem('lunex.playground.extension-checked.v4') || 0);
  if (Date.now() - lastChecked < 3600000) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://api.github.com/repos/Megamexlevi2/lunex-language/releases?per_page=20', { headers: { Accept: 'application/vnd.github+json' }, signal: controller.signal });
    if (!response.ok) return;
    const releases = await response.json();
    let asset = null;
    for (const release of releases) {
      asset = (release.assets || []).find((item) => /\.vsix$/i.test(item.name || '')) || null;
      if (asset) break;
    }
    if (!asset || !asset.browser_download_url) return;
    const download = await fetch(asset.browser_download_url, { signal: controller.signal });
    if (!download.ok) return;
    const data = await parseVsix(await download.arrayBuffer());
    if (compareVersions(data.extensionVersion, languageData.extensionVersion) > 0) {
      writeExtensionCache(data);
      if (String(data.extensionVersion) !== String(languageData.extensionVersion)) {
        languageData = { ...FALLBACK_DATA, ...data };
        defineLunexMode();
        registerAutocomplete();
        editor.setOption('mode', modeForPath(activePath));
        showToast(`Lunex language tools updated to ${data.extensionVersion}.`);
      }
    }
  } catch (error) {
    return;
  } finally {
    clearTimeout(timer);
    try { localStorage.setItem('lunex.playground.extension-checked.v4', String(Date.now())); } catch (error) {}
  }
}

async function init() {
  languageData = await loadBundledExtensionData();
  loadWorkspace();
  window.CodeMirror = CodeMirror;
  await Promise.all([
    loadClassicScript('./vendor/codemirror/addon/edit/closebrackets.js'),
    loadClassicScript('./vendor/codemirror/addon/edit/matchbrackets.js'),
    loadClassicScript('./vendor/codemirror/addon/selection/active-line.js'),
    loadClassicScript('./vendor/codemirror/addon/hint/show-hint.js'),
    loadClassicScript('./vendor/codemirror/mode/javascript/javascript.js')
  ]);
  defineLunexMode();
  registerAutocomplete();
  editor = CodeMirror($('editorMount'), {
    value: files.get(activePath) || '',
    mode: modeForPath(activePath),
    theme: 'material-darker',
    lineNumbers: true,
    styleActiveLine: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    tabSize: 2,
    indentUnit: 2,
    indentWithTabs: false,
    lineWrapping: false,
    autofocus: true,
    inputStyle: 'textarea',
    gutters: ['CodeMirror-linenumbers'],
    extraKeys: {
      'Ctrl-Space': (cm) => CodeMirror.showHint(cm, CodeMirror.hint.lunex, { completeSingle: false }),
      'Cmd-Space': (cm) => CodeMirror.showHint(cm, CodeMirror.hint.lunex, { completeSingle: false }),
      'Ctrl-Enter': runCurrentFile,
      'Cmd-Enter': runCurrentFile,
      'Ctrl-S': downloadCurrentFile,
      'Cmd-S': downloadCurrentFile,
      'Ctrl-Shift-S': exportWorkspace,
      'Cmd-Shift-S': exportWorkspace,
      'Ctrl-Shift-P': openCommandPalette,
      'Cmd-Shift-P': openCommandPalette,
      'F1': openCommandPalette,
      Tab: (cm) => cm.somethingSelected() ? cm.indentSelection('add') : cm.replaceSelection('  ', 'end')
    }
  });
  editor.on('change', (cm, change) => {
    files.set(activePath, cm.getValue());
    persistWorkspace();
    renderTabs();
    autoHint(cm, change);
  });
  editor.on('cursorActivity', updateCursorStatus);
  editor.setOption('mode', modeForPath(activePath));
  $('runCode').addEventListener('click', runCurrentFile);
  $('newFile').addEventListener('click', promptNewFile);
  $('explorerNewFile').addEventListener('click', promptNewFile);
  $('openFiles').addEventListener('click', openFilePicker);
  $('openFolder').addEventListener('click', () => $('folderPicker').click());
  $('downloadFile').addEventListener('click', downloadCurrentFile);
  $('exportProject').addEventListener('click', exportWorkspace);
  $('filePicker').addEventListener('change', (event) => importDeviceFiles(event.target.files, false));
  $('folderPicker').addEventListener('change', (event) => importDeviceFiles(event.target.files, true));
  $('clearWorkspace').addEventListener('click', () => {
    if (!confirm('Clear all files from the workspace?')) return;
    files.clear();
    addFile('main.lx', '');
    showToast('Workspace cleared.');
  });
  $('refreshFiles').addEventListener('click', renderExplorer);
  $('projectHeading').addEventListener('click', () => $('fileList').hidden = !$('fileList').hidden);
  $('toggleSidebar').addEventListener('click', () => $('ideWorkbench').classList.toggle('sidebar-open'));
  $('commandPalette').addEventListener('click', openCommandPalette);
  $('closeCommandPalette').addEventListener('click', closeCommandPalette);
  $('commandOverlay').addEventListener('click', (event) => { if (event.target === $('commandOverlay')) closeCommandPalette(); });
  $('commandSearch').addEventListener('input', () => { commandSelection = 0; renderCommandList($('commandSearch').value); });
  $('commandSearch').addEventListener('keydown', (event) => {
    const count = $('commandList').querySelectorAll('.command-option').length;
    if (event.key === 'ArrowDown') { event.preventDefault(); commandSelection = Math.min(count - 1, commandSelection + 1); renderCommandList($('commandSearch').value); }
    if (event.key === 'ArrowUp') { event.preventDefault(); commandSelection = Math.max(0, commandSelection - 1); renderCommandList($('commandSearch').value); }
    if (event.key === 'Enter') { event.preventDefault(); $('commandList').querySelectorAll('.command-option')[commandSelection]?.click(); }
    if (event.key === 'Escape') closeCommandPalette();
  });
  document.querySelectorAll('.bottom-tab').forEach((tab) => tab.addEventListener('click', () => switchPanel(tab.dataset.panel)));
  $('clearPanel').addEventListener('click', () => setOutput([]));
  $('hideBottomPanel').addEventListener('click', () => { $('bottomPanel').hidden = true; $('showBottomPanel').hidden = false; });
  $('showBottomPanel').addEventListener('click', () => { $('bottomPanel').hidden = false; $('showBottomPanel').hidden = true; });
  $('toggleFullscreen').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) { showToast('Fullscreen is not available in this browser.', true); }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('commandOverlay').hidden) closeCommandPalette();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p' && event.shiftKey) { event.preventDefault(); openCommandPalette(); }
  });
  setupDragAndDrop();
  renderExplorer();
  updateCursorStatus();
  refreshLatestExtensionData();
}

function loadClassicScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find((script) => script.src && script.src.endsWith(src.replace('./', '/')));
    if (existing) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load local editor component: ${src}`));
    document.head.append(script);
  });
}

init().catch((error) => {
  const host = $('editorHost');
  host.replaceChildren();
  const message = document.createElement('div');
  message.className = 'ide-empty workspace-error';
  message.textContent = `The local editor could not start: ${error?.message || String(error)}. Serve the site over HTTP or HTTPS and keep the vendor folder intact.`;
  host.append(message);
  showToast('The local editor could not start.', true);
});
