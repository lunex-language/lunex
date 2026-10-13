const OWNER = 'Megamexlevi2';
const REPO = 'lunex-language';
const BRANCH = 'main';
const ROOT = `https://github.com/${OWNER}/${REPO}`;
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`;
const CDN = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}`;
const $ = (id) => document.getElementById(id);
let releases = [];
let docs = [];
let activeDocPath = '';

if ($('currentYear')) $('currentYear').textContent = String(new Date().getFullYear());

const menuButton = $('menuButton');
const menuPanel = $('menuPanel');
if (menuButton && menuPanel) {
  menuButton.addEventListener('click', () => {
    const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!isOpen));
    menuButton.setAttribute('aria-label', isOpen ? 'Open navigation menu' : 'Close navigation menu');
    menuPanel.hidden = isOpen;
  });
  menuPanel.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    menuPanel.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation menu');
  }));
  document.addEventListener('click', (event) => {
    if (!menuPanel.hidden && !menuPanel.contains(event.target) && !menuButton.contains(event.target)) {
      menuPanel.hidden = true;
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Open navigation menu');
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menuPanel.hidden) {
      menuPanel.hidden = true;
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.focus();
    }
  });
}

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function fetchResource(url, options = {}, timeout = 4500) {
  const timed = timeoutSignal(timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: timed.signal,
      headers: { Accept: 'application/vnd.github+json, application/json, text/plain, */*', ...(options.headers || {}) }
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response;
  } finally {
    timed.clear();
  }
}

async function fetchJSON(url, timeout = 4500) {
  const response = await fetchResource(url, {}, timeout);
  return response.json();
}

async function trySources(sources, transform = (value) => value) {
  let lastError;
  for (const source of sources) {
    try {
      const value = await source();
      const transformed = transform(value);
      if (transformed !== null && transformed !== undefined) return transformed;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No source returned data');
}

function formatDate(value) {
  if (!value) return 'Date not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date not available';
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function formatBytes(bytes) {
  if (!Number.isFinite(Number(bytes)) || Number(bytes) < 0) return 'Size unavailable';
  const size = Number(bytes);
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = size / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[index]}`;
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function releaseTitle(release) {
  return release.name && release.name.trim() ? release.name : release.tag_name || 'Untitled release';
}

function cleanReleaseBody(body) {
  const plain = String(body || '').replace(/```[\s\S]*?```/g, '[code]').replace(/^\s{0,3}#{1,6}\s*/gm, '').replace(/[`*_>#]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\r/g, '').trim();
  if (!plain) return 'Release notes are available on the official GitHub page.';
  return plain.length > 340 ? `${plain.slice(0, 337).trimEnd()}…` : plain;
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function markReleaseStatus(text, isError = false) {
  const status = $('releaseStatus');
  status.classList.toggle('is-error', isError);
  status.replaceChildren();
  const dot = makeElement('span', 'status-dot');
  status.append(dot, document.createTextNode(` ${text}`));
}

function assetGlyph(asset) {
  const value = `${asset.name || ''} ${asset.content_type || ''}`.toLowerCase();
  if (value.includes('windows') || value.includes('win32') || value.endsWith('.exe') || value.endsWith('.msi')) return 'WIN';
  if (value.includes('android') || value.includes('termux') || value.includes('arm64') || value.includes('aarch64')) return 'ARM';
  if (value.includes('darwin') || value.includes('macos') || value.includes('apple')) return 'MAC';
  if (value.includes('linux') || value.includes('gnu')) return 'LNX';
  if (value.includes('source') || value.endsWith('.zip') || value.endsWith('.tar.gz')) return 'SRC';
  return 'BIN';
}

function renderAssets(release) {
  const target = $('latestAssets');
  target.replaceChildren();
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  $('assetCount').textContent = assets.length ? `${assets.length} FILE${assets.length === 1 ? '' : 'S'}` : 'NO ASSETS LISTED';
  if (!assets.length) {
    const placeholder = makeElement('div', 'asset-placeholder');
    const icon = makeElement('span', 'asset-placeholder-icon', '↗');
    const copy = makeElement('span', '', 'Open GitHub to see downloads for this release.');
    placeholder.append(icon, copy);
    target.append(placeholder);
    return;
  }
  assets.forEach((asset) => {
    const row = makeElement('div', 'asset-row');
    const glyph = makeElement('span', 'asset-symbol', assetGlyph(asset));
    const detail = makeElement('div', 'asset-detail');
    detail.append(makeElement('span', 'asset-name', asset.name || 'Release asset'));
    detail.append(makeElement('span', 'asset-size', `${formatBytes(asset.size)}${Number.isFinite(asset.download_count) ? ` · ${asset.download_count.toLocaleString('en-US')} downloads` : ''}`));
    const anchor = makeElement('a', 'asset-download', '↓');
    anchor.href = asset.browser_download_url || release.html_url || `${ROOT}/releases`;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
    anchor.setAttribute('aria-label', `Download ${asset.name || 'release asset'}`);
    anchor.title = 'Download from GitHub';
    row.append(glyph, detail, anchor);
    target.append(row);
  });
}

function renderLatest(release, fallback = false) {
  $('latestVersion').textContent = release ? releaseTitle(release) : 'Browse the latest build';
  $('latestDescription').textContent = release ? cleanReleaseBody(release.body) : 'GitHub could not be reached from this connection. The official release page has the latest builds and release notes.';
  $('latestReleaseLink').href = release?.html_url || `${ROOT}/releases/latest`;
  $('latestMeta').replaceChildren();
  const date = makeElement('span', '', release?.published_at ? `Published ${formatDate(release.published_at)}` : 'Source: GitHub Releases');
  $('latestMeta').append(date);
  if (release?.tag_name) $('latestMeta').append(makeElement('span', '', `Tag ${release.tag_name}`));
  if (release?.prerelease) $('latestMeta').append(makeElement('span', 'prerelease-label', 'PRE-RELEASE'));
  const top = $('latestRelease').querySelector('.release-feature-top');
  top.replaceChildren();
  const label = makeElement('div', 'loading-line');
  const dot = makeElement('span', 'loading-dot');
  label.append(dot, document.createTextNode(fallback ? 'Official GitHub fallback' : 'Synced with GitHub Releases'));
  top.append(label);
  $('releaseFallback').hidden = !fallback;
  renderAssets(release);
}

function renderReleaseCards(items) {
  const grid = $('releaseGrid');
  grid.replaceChildren();
  const previous = items.slice(1);
  if (!previous.length) {
    grid.append(makeElement('div', 'no-releases', 'No previous releases could be loaded. Open GitHub to browse all versions.'));
    return;
  }
  previous.forEach((release) => {
    const card = makeElement('article', 'release-card');
    const top = makeElement('div', 'release-card-top');
    top.append(makeElement('div', 'release-tag', releaseTitle(release)));
    top.append(makeElement('span', `release-chip${release.prerelease ? ' beta' : ''}`, release.prerelease ? 'PRE-RELEASE' : (release.draft ? 'DRAFT' : 'RELEASE')));
    const description = makeElement('p', '', cleanReleaseBody(release.body));
    const foot = makeElement('div', 'release-card-foot');
    foot.append(makeElement('span', '', `${formatDate(release.published_at)} · ${release.assets?.length || 0} assets`));
    const link = makeElement('a', '', 'Downloads ↗');
    link.href = release.html_url || `${ROOT}/releases`;
    link.target = '_blank';
    link.rel = 'noreferrer';
    foot.append(link);
    card.append(top, description, foot);
    grid.append(card);
  });
}

function parseReleaseFeed(xml) {
  const documentXML = new DOMParser().parseFromString(xml, 'application/xml');
  const entries = Array.from(documentXML.querySelectorAll('entry'));
  if (!entries.length) throw new Error('No release entries');
  return entries.map((entry) => {
    const title = entry.querySelector('title')?.textContent?.trim() || 'Lunex release';
    const href = entry.querySelector('link')?.getAttribute('href') || `${ROOT}/releases`;
    const updated = entry.querySelector('updated')?.textContent || '';
    const tag = href.split('/').pop() || title;
    return { name: title, tag_name: tag, html_url: href, published_at: updated, body: '', assets: [], prerelease: /alpha|beta|rc/i.test(title) };
  });
}

async function getReleaseData() {
  try {
    const releasesURL = `${API}/releases?per_page=100`;
    const feedURL = `${ROOT}/releases.atom`;
    const data = await trySources([
      () => fetchJSON(releasesURL),
      () => fetchJSON(`https://api.allorigins.win/raw?url=${encodeURIComponent(releasesURL)}`),
      () => fetchJSON(`https://proxy.cors.dev/${releasesURL}`),
      () => fetchJSON(`${API}/releases?per_page=30&page=1`),
      () => fetchJSON(`${API}/releases/latest`).then((item) => [item]),
      () => fetchResource(feedURL, {}, 3500).then((response) => response.text()).then(parseReleaseFeed),
      () => fetchResource(`https://api.allorigins.win/raw?url=${encodeURIComponent(feedURL)}`, {}, 3500).then((response) => response.text()).then(parseReleaseFeed),
      () => fetchJSON(`${API}/tags?per_page=30`).then((tags) => {
        if (!Array.isArray(tags) || !tags.length) throw new Error('No tags returned');
        return tags.map((tag) => ({ name: tag.name, tag_name: tag.name, html_url: `${ROOT}/releases/tag/${encodeURIComponent(tag.name)}`, published_at: '', body: 'This version is available as a repository tag. Open GitHub for release notes and downloadable files.', assets: [], prerelease: /alpha|beta|rc/i.test(tag.name) }));
      })
    ], (value) => Array.isArray(value) && value.length ? value : null);
    if (!Array.isArray(data) || !data.length) throw new Error('No published releases found');
    releases = data.filter((item) => !item.draft).sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0));
    if (!releases.length) throw new Error('No published releases found');
    renderLatest(releases[0], !(Array.isArray(releases[0].assets) && releases[0].assets.length));
    renderReleaseCards(releases);
    markReleaseStatus('Live from GitHub');
  } catch (error) {
    releases = [];
    renderLatest(null, true);
    renderReleaseCards([]);
    markReleaseStatus('GitHub unavailable', true);
    $('latestVersion').textContent = 'Open the latest release';
    $('latestDescription').textContent = 'The release API did not respond. Your download links are still available from the official GitHub Releases page.';
    $('latestReleaseLink').href = `${ROOT}/releases/latest`;
    $('latestAssets').replaceChildren();
    const placeholder = makeElement('div', 'asset-placeholder');
    placeholder.append(makeElement('span', 'asset-placeholder-icon', '↗'), makeElement('span', '', 'Use the official GitHub release page for downloads.'));
    $('latestAssets').append(placeholder);
  }
}

function normaliseDocFile(item) {
  if (!item || !item.path || item.type === 'dir') return null;
  if (!/\.(md|mdx|txt)$/i.test(item.path)) return null;
  if (!item.path.startsWith('docs/')) return null;
  return { path: item.path, name: item.name || item.path.split('/').pop(), html_url: item.html_url || `${ROOT}/blob/${BRANCH}/${item.path}`, download_url: item.download_url || `${RAW}/${item.path}`, type: item.type || 'file' };
}

async function recursiveContents(path, depth = 0) {
  if (depth > 4) return [];
  const result = await fetchJSON(`${API}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${BRANCH}`);
  if (!Array.isArray(result)) return [];
  const files = [];
  for (const item of result) {
    if (item.type === 'dir') {
      const nested = await recursiveContents(item.path, depth + 1).catch(() => []);
      files.push(...nested);
    } else {
      const normalized = normaliseDocFile(item);
      if (normalized) files.push(normalized);
    }
  }
  return files;
}

async function getDocsList() {
  const treeURL = `${API}/git/trees/${BRANCH}?recursive=1`;
  const mapTree = (tree) => {
    const files = (tree.tree || []).filter((item) => item.type === 'blob').map((item) => normaliseDocFile({ path: item.path, name: item.path.split('/').pop(), html_url: `${ROOT}/blob/${BRANCH}/${item.path}`, download_url: `${RAW}/${item.path}` })).filter(Boolean);
    if (tree.truncated && !files.length) throw new Error('GitHub tree response was incomplete');
    return files;
  };
  return trySources([
    () => fetchJSON(treeURL).then(mapTree),
    () => fetchJSON(`https://api.allorigins.win/raw?url=${encodeURIComponent(treeURL)}`).then(mapTree),
    () => fetchJSON(`https://proxy.cors.dev/${treeURL}`).then(mapTree),
    () => fetchJSON(`https://data.jsdelivr.com/v1/package/gh/${OWNER}/${REPO}@${BRANCH}/flat`).then((result) => (result.files || []).filter((item) => item.name.startsWith('/docs/') && /\.(md|mdx|txt)$/i.test(item.name)).map((item) => {
      const path = item.name.replace(/^\//, '');
      return { path, name: path.split('/').pop(), html_url: `${ROOT}/blob/${BRANCH}/${path}`, download_url: `${CDN}/${path}` };
    })),
    () => recursiveContents('docs')
  ], (items) => Array.isArray(items) && items.length ? items : null);
}

function normaliseDocLink(url, path) {
  const target = String(url || '').trim();
  if (!target || target.startsWith('#')) return target;
  try {
    const parsed = new URL(target, `${ROOT}/blob/${BRANCH}/${path}`);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
  } catch (error) {
    return `${ROOT}/tree/${BRANCH}/docs`;
  }
  return `${ROOT}/tree/${BRANCH}/docs`;
}

function inlineMarkdown(text, path) {
  let source = escapeHTML(text);
  const code = [];
  source = source.replace(/`([^`]+)`/g, (_, value) => {
    const key = `@@LUNEXCODE${code.length}@@`;
    code.push(`<code>${value}</code>`);
    return key;
  });
  source = source.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const safeURL = normaliseDocLink(url, path);
    return `<a href="${escapeHTML(safeURL)}" target="_blank" rel="noreferrer">${alt ? `Image: ${alt}` : 'Open image'} ↗</a>`;
  });
  source = source.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safeURL = normaliseDocLink(url, path);
    return `<a href="${escapeHTML(safeURL)}" target="_blank" rel="noreferrer">${label}</a>`;
  });
  source = source.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>');
  source = source.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
  source = source.replace(/~~(.+?)~~/g, '<del>$1</del>');
  return source.replace(/@@LUNEXCODE(\d+)@@/g, (_, index) => code[Number(index)] || '');
}

function renderMarkdown(markdown, path) {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n');
  const output = [];
  let paragraph = [];
  let listType = '';
  let codeLines = null;
  let quoteLines = [];
  const flushParagraph = () => {
    if (paragraph.length) {
      output.push(`<p>${paragraph.map((line) => inlineMarkdown(line.trim(), path)).join('<br>')}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listType) {
      output.push(`</${listType}>`);
      listType = '';
    }
  };
  const flushQuote = () => {
    if (quoteLines.length) {
      output.push(`<blockquote>${quoteLines.map((line) => `<p>${inlineMarkdown(line, path)}</p>`).join('')}</blockquote>`);
      quoteLines = [];
    }
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (codeLines) {
      if (/^\s*```/.test(line)) {
        output.push(`<pre><code>${escapeHTML(codeLines.join('\n'))}</code></pre>`);
        codeLines = null;
      } else {
        codeLines.push(line);
      }
      continue;
    }
    if (/^\s*```/.test(line)) {
      flushParagraph(); closeList(); flushQuote();
      codeLines = [];
      continue;
    }
    if (!line.trim()) {
      flushParagraph(); closeList(); flushQuote();
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph(); closeList(); flushQuote();
      const level = Math.min(heading[1].length, 4);
      output.push(`<h${level}>${inlineMarkdown(heading[2], path)}</h${level}>`);
      continue;
    }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushParagraph(); closeList(); flushQuote(); output.push('<hr>'); continue;
    }
    if (/^\s*>/.test(line)) {
      flushParagraph(); closeList();
      quoteLines.push(line.replace(/^\s*>\s?/, ''));
      continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph(); flushQuote();
      const desired = unordered ? 'ul' : 'ol';
      if (listType && listType !== desired) closeList();
      if (!listType) { listType = desired; output.push(`<${listType}>`); }
      output.push(`<li>${inlineMarkdown((unordered || ordered)[1], path)}</li>`);
      continue;
    }
    if (line.includes('|') && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
      flushParagraph(); closeList(); flushQuote();
      const splitRow = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
      const headers = splitRow(line);
      index += 1;
      const bodyRows = [];
      while (index + 1 < lines.length && lines[index + 1].includes('|') && lines[index + 1].trim()) {
        index += 1;
        bodyRows.push(splitRow(lines[index]));
      }
      output.push(`<table><thead><tr>${headers.map((cell) => `<th>${inlineMarkdown(cell, path)}</th>`).join('')}</tr></thead><tbody>${bodyRows.map((row) => `<tr>${headers.map((_, cellIndex) => `<td>${inlineMarkdown(row[cellIndex] || '', path)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    flushQuote(); closeList();
    paragraph.push(line);
  }
  flushParagraph(); closeList(); flushQuote();
  if (codeLines) output.push(`<pre><code>${escapeHTML(codeLines.join('\n'))}</code></pre>`);
  return output.join('\n');
}

function renderDocList(filterText = '') {
  const list = $('docsFileList');
  list.replaceChildren();
  const query = filterText.trim().toLowerCase();
  const visible = docs.filter((doc) => `${doc.name} ${doc.path}`.toLowerCase().includes(query));
  if (!visible.length) {
    list.append(makeElement('div', 'docs-source', query ? 'No matching pages.' : 'No documentation files were found.'));
    return;
  }
  visible.forEach((doc) => {
    const button = makeElement('button', `doc-nav-button${doc.path === activeDocPath ? ' active' : ''}`);
    button.type = 'button';
    const icon = makeElement('span', 'doc-file-icon', 'md');
    const name = makeElement('span', 'doc-nav-name', doc.name.replace(/\.(md|mdx|txt)$/i, '').replace(/[-_]/g, ' '));
    button.append(icon, name);
    button.title = doc.path;
    button.addEventListener('click', () => loadDoc(doc));
    list.append(button);
  });
}

async function fetchDocText(doc) {
  const direct = doc.download_url || `${RAW}/${doc.path}`;
  const candidates = [direct, `${RAW}/${doc.path}`, `${CDN}/${doc.path}`, `https://raw.githack.com/${OWNER}/${REPO}/${BRANCH}/${doc.path}`, `https://api.allorigins.win/raw?url=${encodeURIComponent(direct)}`, `https://proxy.cors.dev/${direct}`].filter(Boolean);
  return trySources(candidates.map((url) => () => fetchResource(url, {}, 4500).then((response) => response.text())), (text) => typeof text === 'string' ? text : null);
}

async function loadDoc(doc) {
  if (!doc) return;
  activeDocPath = doc.path;
  renderDocList($('docsSearch').value);
  const content = $('docsContent');
  content.replaceChildren();
  const loading = makeElement('div', 'docs-empty-state');
  loading.append(makeElement('div', 'docs-bookmark', 'lx'), makeElement('div', 'docs-state-eyebrow', 'LUNEX DOCUMENTATION'), makeElement('h3', '', 'Opening page…'), makeElement('p', '', doc.path));
  content.append(loading);
  try {
    const text = await fetchDocText(doc);
    const header = makeElement('div', 'docs-document-top');
    header.append(makeElement('div', 'docs-breadcrumb', `docs / ${doc.path.replace(/^docs\//, '').split('/').join(' / ')}`));
    const actions = makeElement('div', 'docs-document-actions');
    const viewSource = makeElement('a', '', 'View source ↗');
    viewSource.href = doc.html_url || `${ROOT}/blob/${BRANCH}/${doc.path}`;
    viewSource.target = '_blank';
    viewSource.rel = 'noreferrer';
    actions.append(viewSource);
    header.append(actions);
    const markdown = makeElement('div', 'markdown-content');
    markdown.innerHTML = renderMarkdown(text, doc.path);
    content.replaceChildren(header, markdown);
    content.scrollTop = 0;
  } catch (error) {
    content.replaceChildren();
    const errorBox = makeElement('div', 'docs-load-error');
    errorBox.append(document.createTextNode('This page could not be loaded through the available sources. '));
    const fallback = makeElement('a', '', 'Open it on GitHub ↗');
    fallback.href = doc.html_url || `${ROOT}/tree/${BRANCH}/docs`;
    fallback.target = '_blank';
    fallback.rel = 'noreferrer';
    errorBox.append(fallback);
    content.append(errorBox);
  }
}

async function initialiseDocs() {
  const list = $('docsFileList');
  const source = $('docsSource');
  try {
    docs = await getDocsList();
    docs.sort((a, b) => a.path.localeCompare(b.path));
    source.replaceChildren(makeElement('span', 'status-dot'), document.createTextNode(` ${docs.length} pages · GitHub`));
    renderDocList();
    if (docs.length) await loadDoc(docs.find((doc) => /readme/i.test(doc.name)) || docs[0]);
    else showDocsFallback('No Markdown files were found in the docs folder. Open the repository to browse the full documentation.');
  } catch (error) {
    docs = [];
    source.textContent = 'GitHub is unavailable';
    list.replaceChildren();
    showDocsFallback('The documentation could not be fetched through the available sources. The official GitHub folder is still available.');
  }
}

function showDocsFallback(message) {
  const content = $('docsContent');
  content.replaceChildren();
  const state = makeElement('div', 'docs-empty-state');
  state.append(makeElement('div', 'docs-bookmark', 'lx'), makeElement('div', 'docs-state-eyebrow', 'LUNEX DOCUMENTATION'), makeElement('h3', '', 'Read the docs.'), makeElement('p', '', message));
  const link = makeElement('a', 'button button-secondary', 'Open docs on GitHub ↗');
  link.href = `${ROOT}/tree/${BRANCH}/docs`;
  link.target = '_blank';
  link.rel = 'noreferrer';
  state.append(link);
  content.append(state);
}

if ($('docsSearch')) $('docsSearch').addEventListener('input', (event) => renderDocList(event.target.value));
if ($('refreshDocs')) $('refreshDocs').addEventListener('click', () => {
  $('docsFileList').replaceChildren(makeElement('div', 'docs-skeleton'), makeElement('div', 'docs-skeleton'), makeElement('div', 'docs-skeleton'));
  initialiseDocs();
});


async function initialiseHomeRelease() {
  const version = $('homeLatestTag');
  if (!version) return;
  const link = $('homeLatestLink');
  const date = $('homeLatestDate');
  try {
    const latestFromList = (items) => {
      if (!Array.isArray(items)) throw new Error('No release list returned');
      const available = items.filter((item) => !item.draft);
      available.sort((a, b) => new Date(b.published_at || b.created_at || 0) - new Date(a.published_at || a.created_at || 0));
      if (!available.length) throw new Error('No published releases found');
      return available[0];
    };
    const listURL = `${API}/releases?per_page=100`;
    const latest = await trySources([
      () => fetchJSON(listURL).then(latestFromList),
      () => fetchJSON(`https://api.allorigins.win/raw?url=${encodeURIComponent(listURL)}`).then(latestFromList),
      () => fetchJSON(`https://proxy.cors.dev/${listURL}`).then(latestFromList),
      () => fetchJSON(`${API}/releases/latest`),
      () => fetchResource(`${ROOT}/releases.atom`, {}, 3500).then((response) => response.text()).then((xml) => parseReleaseFeed(xml)[0])
    ], (item) => item && (item.tag_name || item.name) ? item : null);
    version.textContent = latest.tag_name || latest.name;
    if (link) link.href = latest.html_url || `${ROOT}/releases/latest`;
    if (date) date.textContent = latest.published_at ? `Published ${formatDate(latest.published_at)}` : 'Latest release on GitHub';
  } catch (error) {
    version.textContent = 'View the latest release';
    if (link) link.href = `${ROOT}/releases/latest`;
    if (date) date.textContent = 'Visit GitHub for the latest build';
  }
}

if ($('latestRelease')) getReleaseData();
if ($('docsFileList')) initialiseDocs();
if ($('homeLatestTag')) initialiseHomeRelease();
