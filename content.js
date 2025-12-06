// 运行状态
let flowRunning = false;
let hasClickedTopPublishOnce = false;
let userInitialSchedule = '';
let useStandardPrefixSuffix = true;
let userPatreonUrl = 'https://www.patreon.com/webnovel';
let userCurrentChapter = 1;
let userTotalChapters = 200;

// 顺序定时计划（每周黄金发布窗口） JS: 周日=0, 周一=1 ...
// 使用 h 可大于等于24 表示次日
const weeklyWindows = {
  1: [ {h:21, m:30}, {h:23, m:45} ],
  2: [ {h:22, m:0} ],
  3: [ {h:9, m:0}, {h:22, m:15}, {h:24, m:30} ], // 00:30+1日
  4: [ {h:21, m:45}, {h:23, m:30} ],
  5: [ {h:11, m:45}, {h:22, m:0}, {h:24, m:0} ], // 00:00+1日
  6: [ {h:22, m:30} ],
  0: [ {h:21, m:0} ]
};

let scheduleMode = 'weekly';
let scheduleNextDate = null;

function parseUserDateTime(str) {
  if (!str) return null;
  // 支持 YYYY/MM/DD HH:mm 或 YYYY-MM-DD HH:mm
  const s = str.trim().replace(/-/g, '/');
  const m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[1],10), parseInt(m[2],10)-1, parseInt(m[3],10), parseInt(m[4],10), parseInt(m[5],10), 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function computeNextSlotWeekly(fromDate) {
  const maxDays = 21; // 安全上限
  for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
    const base = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + dayOffset, 0, 0, 0, 0);
    const wday = base.getDay();
    const windows = weeklyWindows[wday] || [];
    for (const w of windows) {
      const plus = w.h >= 24 ? 1 : 0;
      const hour = w.h >= 24 ? (w.h - 24) : w.h;
      const slot = new Date(base.getFullYear(), base.getMonth(), base.getDate() + plus, hour, w.m, 0, 0);
      if (slot.getTime() >= fromDate.getTime()) {
        return slot;
      }
    }
  }
  // 若未找到（不太可能），返回 fromDate 自身
  return new Date(fromDate.getTime());
}

function computeNextSlotFixed(fromDate, initial) {
  // 从 initial 取出时分，日期从 fromDate 开始向后找第一个 >= fromDate 的该时间点；下一次固定 +1 天
  const hh = initial.getHours();
  const mm = initial.getMinutes();
  let base = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), hh, mm, 0, 0);
  if (base.getTime() < fromDate.getTime()) {
    base = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, hh, mm, 0, 0);
  }
  return base;
}

function initScheduleIterator(initialStr) {
  const base = parseUserDateTime(initialStr) || new Date();
  // 对齐到下一分钟，避免边界
  const aligned = new Date(base.getFullYear(), base.getMonth(), base.getDate(), base.getHours(), base.getMinutes(), 0, 0);
  if (scheduleMode === 'fixed') {
    scheduleNextDate = computeNextSlotFixed(aligned, aligned);
  } else {
    scheduleNextDate = computeNextSlotWeekly(aligned);
  }
}

function getNextScheduleDateAndAdvance() {
  if (!scheduleNextDate) initScheduleIterator(userInitialSchedule);
  const result = scheduleNextDate;
  if (scheduleMode === 'fixed') {
    // 下一个 = 当前 + 1 天（保持时分）
    scheduleNextDate = new Date(result.getFullYear(), result.getMonth(), result.getDate() + 1, result.getHours(), result.getMinutes(), 0, 0);
  } else {
    const nextBase = new Date(result.getTime() + 60 * 1000);
    scheduleNextDate = computeNextSlotWeekly(nextBase);
  }
  return result;
}

// 前缀 前20%章节加入
let contentPrefix = `
💎 WEEKLY POWER GOALS 💎
🔥 30→2ch | 60→5ch | 100→8ch | 200→15ch | 400→25ch
⏰ Resets Monday!
 
💪 READER POWER RANKING:
🥇 Top Voter gets Character Naming Rights!
🥈 2nd Place gets Exclusive Preview!  
🥉 3rd Place gets Discord VIP Role!
`;

// 后缀 基础
let contentSuffixBase = `
🔥 Can't wait for the next cultivation breakthrough?
 
💎 PATREON VIP ACCESS:
📚 Read 5-15 chapters ahead
🎁 Exclusive character backstories
💬 Direct author Q&A access
🏆 Vote on story developments
 
💰 Starting at just $3/month!
🔗 Link: [你的Patreon链接]
 
⚡ Join 800+ fellow cultivators already inside!
#WebNovel #Cultivation #EarlyAccess #Patreon
`;

let contentSuffixBaseFinal = contentSuffixBase.replace('[你的Patreon链接]', userPatreonUrl);

// 后缀 急迫 每50章末尾使用
let contentSuffixUrgent = `
⚠️ MAJOR PLOT TWIST COMING IN CHAPTER 47! ⚠️
 
💥 Patreon readers ALREADY KNOW:
🤯 Who betrayed the MC
💀 The identity of the masked cultivator  
🏆 The secret of the ancient technique
💎 The truth about the jade pendant
 
🚨 Don't get spoiled in comments - Read ahead NOW!
💰 First 48 hours: 50% OFF first month!
🔗 [Patreon链接]
 
⏰ Limited time offer expires soon!
`;

let contentSuffixUrgentFinal = contentSuffixUrgent.replace('[Patreon链接]', userPatreonUrl).replace('[你的Patreon链接]', userPatreonUrl);

// 后缀 社群 最后30章使用
let contentSuffixCommunity = `
🌟 Welcome to the STRONGEST cultivation community! 🌟
 
👥 JOIN 1000+ FELLOW DAOISTS:
💬 Exclusive Discord discussions
📊 Theory crafting sessions
🎨 Fan art showcases  
🎮 Character power scaling debates
📚 Advanced chapters access
 
🏆 PATRON BENEFITS:
🥇 $3 Tier → 3 chapters ahead + Discord access
🥈 $8 Tier → 8 chapters ahead + bonus content  
🥉 $15 Tier → 15 chapters ahead + direct author chat
 
🔗 Ascend to immortality: [Patreon链接]
⚡ The sect awaits your arrival!
`;

let contentSuffixCommunityFinal = contentSuffixCommunity.replace('[Patreon链接]', userPatreonUrl).replace('[你的Patreon链接]', userPatreonUrl);

function shouldUsePrefix(currentChapter, totalChapters) {
  if (!totalChapters || totalChapters <= 0) return false;
  return currentChapter <= Math.ceil(totalChapters * 0.2);
}

function pickSuffix(currentChapter, totalChapters) {
  if (!totalChapters || totalChapters <= 0) return contentSuffixBaseFinal;
  // 每 50 章使用一次紧迫后缀（50、100、150...）
  if (currentChapter % 50 === 0) return contentSuffixUrgentFinal;
  // 最后 30 章使用社群后缀
  if (currentChapter > totalChapters - 30) return contentSuffixCommunityFinal;
  // 其余使用基础后缀
  return contentSuffixBaseFinal;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function makeBoldHtmlFromMultiline(text) {
  // 将多行文本转换为 <p><strong>…</strong></p>，空行生成 <p><br></p>
  const lines = String(text).split(/\r?\n/);
  const html = lines.map(line => {
    const trimmed = line.replace(/\s+$/,'');
    if (trimmed.length === 0) return '<p><br></p>';
    return `<p><strong>${escapeHtml(trimmed)}</strong></p>`;
  }).join('');
  return html;
}

function applyPrefixSuffix(htmlBody) {
  if (!useStandardPrefixSuffix) return htmlBody;
  // 使用最新 URL 替换
  contentSuffixBaseFinal = contentSuffixBase.replace('[你的Patreon链接]', userPatreonUrl);
  contentSuffixUrgentFinal = contentSuffixUrgent.replace('[Patreon链接]', userPatreonUrl).replace('[你的Patreon链接]', userPatreonUrl);
  contentSuffixCommunityFinal = contentSuffixCommunity.replace('[Patreon链接]', userPatreonUrl).replace('[你的Patreon链接]', userPatreonUrl);

  const parts = [];
  if (shouldUsePrefix(userCurrentChapter, userTotalChapters)) {
    parts.push(makeBoldHtmlFromMultiline(contentPrefix));
  }
  parts.push(htmlBody);
  parts.push(makeBoldHtmlFromMultiline(pickSuffix(userCurrentChapter, userTotalChapters)));
  return parts.join('\n');
}

function parseNameBaseAndSuffix(name) {
  const m = String(name).match(/^(\d+)_([A-Za-z0-9]+)$/);
  if (!m) return null;
  return { numStr: m[1], suffix: m[2] };
}

function buildNameList(startName, endName) {
  const a = parseNameBaseAndSuffix(startName);
  const b = parseNameBaseAndSuffix(endName);
  if (!a || !b || a.suffix !== b.suffix) {
    return [startName, endName];
  }
  const start = parseInt(a.numStr, 10);
  const end = parseInt(b.numStr, 10);
  const width = Math.max(a.numStr.length, b.numStr.length);
  const step = start <= end ? 1 : -1;
  const res = [];
  for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
    res.push(`${String(i).padStart(width, '0')}_${a.suffix}`);
  }
  return res;
}

async function readHtmlFile(name) {
  const url = chrome.runtime.getURL(`data/${name}.html`);
  try {
    const resp = await fetch(url, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } catch (e) {
    throw new Error(`读取失败: ${name}.html (${e.message || e})`);
  }
}

function findCreateButton() {
  let btn = document.querySelector('button[data-report-uiname="cac"]');
  if (btn) return btn;
  const buttons = Array.from(document.querySelectorAll('button, .ant-btn'));
  for (const b of buttons) {
    const text = (b.textContent || '').trim().toUpperCase();
    if (text.includes('CREATE CHAPTER')) return b;
  }
  const spans = Array.from(document.querySelectorAll('span'));
  for (const s of spans) {
    const text = (s.textContent || '').trim().toUpperCase();
    if (text === 'CREATE CHAPTER') {
      let node = s;
      for (let i = 0; i < 4 && node; i++) {
        if (node.tagName === 'BUTTON') return node;
        node = node.parentElement;
      }
      return s;
    }
  }
  return null;
}

async function clickNode(node) {
  try { node.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
  const rect = node.getBoundingClientRect();
  const cx = Math.floor(rect.left + rect.width / 2);
  const cy = Math.floor(rect.top + rect.height / 2);
  const target = document.elementFromPoint(cx, cy) || node;
  try {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
  } catch (_) {
    try { node.click(); } catch (_) {}
  }
}

function modalOrEditorExists() {
  const modal = document.querySelector('.ant-modal, [role="dialog"], .modal');
  if (modal) return true;
  const tinyBody = document.querySelector('body#tinymce.mce-content-body.cus-contend-bd[contenteditable="true"]');
  if (tinyBody) return true;
  const iframes = Array.from(document.querySelectorAll('iframe'));
  for (const f of iframes) {
    try {
      const idoc = f.contentDocument || f.contentWindow?.document;
      if (!idoc) continue;
      if (idoc.querySelector('body#tinymce.mce-content-body.cus-contend-bd[contenteditable="true"]')) return true;
    } catch (_) {}
  }
  return false;
}

async function ensureCreateDialog() {
  if (modalOrEditorExists()) return true;
  const btn = findCreateButton();
  if (!btn) throw new Error('未找到 CREATE CHAPTER 按钮');
  await clickNode(btn);
  for (let i = 0; i < 20; i++) {
    if (modalOrEditorExists()) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('创建对话框未出现');
}

function getTinyDocument() {
  let doc = document;
  let body = doc.querySelector('body#tinymce.mce-content-body.cus-contend-bd[contenteditable="true"]');
  if (body) return { doc, body };
  const iframes = Array.from(document.querySelectorAll('iframe'));
  for (const f of iframes) {
    try {
      const idoc = f.contentDocument || f.contentWindow?.document;
      if (!idoc) continue;
      const ibody = idoc.querySelector('body#tinymce.mce-content-body.cus-contend-bd[contenteditable="true"]');
      if (ibody) return { doc: idoc, body: ibody };
    } catch (_) {}
  }
  return { doc: document, body: null };
}

function extractTitleAndBody(htmlText) {
  const tmp = document.createElement('div');
  tmp.innerHTML = htmlText;
  const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let text = '';
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.nodeType === Node.TEXT_NODE) {
      text += n.nodeValue;
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const tag = n.tagName.toLowerCase();
      if (tag === 'br' || tag === 'p' || tag === 'div' || tag === 'li' || tag === 'h1' || tag === 'h2' || tag === 'h3') {
        text += '\n';
      }
    }
  }
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const title = (lines[0] || '').slice(0, 200);
  let bodyHtml = htmlText;
  if (title) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped);
    bodyHtml = bodyHtml.replace(re, '');
  }
  return { title, bodyHtml };
}

function sanitizeHtml(html) {
  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('script, style').forEach(n => n.remove());
    tmp.querySelectorAll('*').forEach(el => {
      [...el.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '').trim().toLowerCase();
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
        if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return tmp.innerHTML;
  } catch (_) {
    return html;
  }
}

function getTinyMceEditors() {
  const editors = [];
  try {
    if (window.tinymce && window.tinymce.editors && window.tinymce.editors.length) {
      editors.push(...window.tinymce.editors);
    }
  } catch (_) {}
  try {
    const frames = Array.from(document.querySelectorAll('iframe'));
    for (const f of frames) {
      try {
        const w = f.contentWindow;
        if (w && w.tinymce && w.tinymce.editors && w.tinymce.editors.length) {
          editors.push(...w.tinymce.editors);
        }
      } catch (_) {}
    }
  } catch (_) {}
  return editors;
}

function isContentNonEmpty() {
  const editors = getTinyMceEditors();
  for (const ed of editors) {
    try {
      const html = ed.getContent({ format: 'html' }) || '';
      const text = ed.getContent({ format: 'text' }) || '';
      if (html.replace(/<[^>]*>/g, '').trim() || text.trim()) return true;
    } catch (_) {}
  }
  const tiny = getTinyDocument();
  if (tiny.body && tiny.body.textContent && tiny.body.textContent.trim()) return true;
  return false;
}

async function setTinyContentViaApi(html) {
  const editors = getTinyMceEditors();
  for (const ed of editors) {
    try {
      ed.focus();
      ed.setContent(html);
      ed.fire('input');
      ed.fire('change');
      if (typeof ed.save === 'function') ed.save();
      ed.getBody()?.blur?.();
  return true;
    } catch (_) {}
  }
  return false;
}

function setCaretToEndContentEditable(el) {
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = el.ownerDocument.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (_) {}
}

async function insertNewLineAtEnd() {
  // 优先 TinyMCE：移动到末尾并插入换行
  const editors = getTinyMceEditors();
  for (const ed of editors) {
    try {
      ed.focus();
      ed.selection.select(ed.getBody(), true);
      ed.selection.collapse(false);
      // 插入一个换行段落
      if (typeof ed.execCommand === 'function') {
        ed.execCommand('mceInsertNewLine');
      } else if (typeof ed.insertContent === 'function') {
        ed.insertContent('<p><br></p>');
      }
      ed.fire('input');
      ed.fire('change');
      return true;
    } catch (_) {}
  }
  // 回退：对 contenteditable 结尾插入换行
  const tiny = getTinyDocument();
  if (tiny.body) {
    tiny.body.innerHTML += '<p><br></p>';
    setCaretToEndContentEditable(tiny.body);
    tiny.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    tiny.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    tiny.body.dispatchEvent(new Event('input', { bubbles: true }));
    tiny.body.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

async function fillContentToEditor(htmlText) {
  const { title, bodyHtml } = extractTitleAndBody(htmlText);

  const titleInput = document.querySelector('input[placeholder="Title Here"], input[placeholder*="Title Here"]');
  if (titleInput) {
    titleInput.focus();
    titleInput.value = title;
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const composedHtml = applyPrefixSuffix(sanitizeHtml(bodyHtml && bodyHtml.trim() ? bodyHtml : '<p>&nbsp;</p>'));

  const usedApi = await setTinyContentViaApi(composedHtml);
  if (!usedApi) {
    const tiny = getTinyDocument();
    if (tiny.body) {
      tiny.body.focus();
      tiny.body.innerHTML = composedHtml;
      tiny.body.dispatchEvent(new Event('input', { bubbles: true }));
      tiny.body.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const fallback = document.querySelector('[contenteditable="true"]');
      if (fallback) {
        fallback.focus();
        fallback.innerHTML = composedHtml;
        fallback.dispatchEvent(new Event('input', { bubbles: true }));
        fallback.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  await new Promise(r => setTimeout(r, 300));
  await insertNewLineAtEnd();
}

function publishPanelExists() {
  if (document.querySelector('button[role="switch"].ant-switch')) return true;
  if (document.querySelector('.ant-picker, .ant-picker-input input')) return true;
  const maybeBtns = Array.from(document.querySelectorAll('button, .ant-btn'))
    .some(b => (b.textContent || '').trim().match(/(Schedule|定时|Publish|发布)/i));
  if (maybeBtns) return true;
  return false;
}

function findTopPublishButton() {
  let btns = Array.from(document.querySelectorAll('button.ant-btn-primary'));
  let found = btns.find(b => ((b.textContent || '').trim().toLowerCase() === 'publish'));
  if (found) return found;
  btns = Array.from(document.querySelectorAll('button, .ant-btn'));
  found = btns.find(b => ((b.textContent || '').trim().toLowerCase() === 'publish'));
  if (found) return found;
  const spans = Array.from(document.querySelectorAll('button span, .ant-btn span, span'));
  const s = spans.find(x => ((x.textContent || '').trim().toLowerCase() === 'publish'));
  if (s) {
    let node = s;
    for (let i = 0; i < 4 && node; i++) {
      if (node.tagName === 'BUTTON') return node;
      node = node.parentElement;
    }
  }
  return null;
}

async function clickTopPublish() {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (isContentNonEmpty()) break;
    const tiny = getTinyDocument();
    if (tiny.body) {
      tiny.body.dispatchEvent(new Event('input', { bubbles: true }));
      tiny.body.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await setTinyContentViaApi(tiny.body ? tiny.body.innerHTML : '');
    await new Promise(r => setTimeout(r, 200));
  }

  if (!isContentNonEmpty()) {
    throw new Error('内容为空，已阻止 Publish 以避免后端报错');
  }

  const btn = findTopPublishButton();
  if (!btn) throw new Error('未找到 Publish 按钮');
  const cls = (btn.className || '');
  if (/disabled/i.test(cls) || btn.disabled) throw new Error('Publish 按钮不可用');
  await clickNode(btn);
}

function computeNextDayNoon() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0);
  const yyyy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, '0');
  const dd = String(next.getDate()).padStart(2, '0');
  const HH = '12';
  const MM = '00';
  return `${yyyy}/${mm}/${dd} ${HH}:${MM}`; // 按你的输入框示例使用斜杠
}

function triggerGlobalEnter(extraTargets = []) {
  try {
    const evDown = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
    const evUp = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
    const targets = [
      document.activeElement,
      document.querySelector('.ant-picker-dropdown'),
      document.body,
      document.documentElement,
      ...extraTargets
    ].filter(Boolean);
    for (const t of targets) {
      try { t.dispatchEvent(evDown); } catch (_) {}
      try { t.dispatchEvent(evUp); } catch (_) {}
    }
    try { window.dispatchEvent(evDown); window.dispatchEvent(evUp); } catch (_) {}
  } catch (_) {}
}

async function setScheduleIfPossible() {
  const switchBtn = document.querySelector('button[role="switch"].ant-switch');
  if (switchBtn && switchBtn.getAttribute('aria-checked') !== 'true') {
    await clickNode(switchBtn);
    await new Promise(r => setTimeout(r, 300));
  }

  // 使用顺序计划得到下一次定时时间
  const dt = getNextScheduleDateAndAdvance();
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const HH = String(dt.getHours()).padStart(2, '0');
  const MM = String(dt.getMinutes()).padStart(2, '0');
  const datePart = `${yyyy}/${mm}/${dd}`;
  const timePart = `${HH}:${MM}`;

  const dateInput = document.querySelector('input[placeholder*="Select date"], input[placeholder*="选择日期"], input[title*="/" i]');
  if (dateInput) {
    const dateBox = dateInput.closest('.ant-picker') || dateInput;
    await clickNode(dateBox);
    dateInput.value = '';
    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
    dateInput.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 100));
    await clickNode(dateBox);
    for (const ch of datePart) {
      dateInput.value += ch;
      dateInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 20));
    }
    dateInput.dispatchEvent(new Event('change', { bubbles: true }));
    triggerGlobalEnter();
  }

  const timeInput = document.querySelector('input[placeholder*="Select time"], input[placeholder*="时间"], input[title*=":" i]');
  if (timeInput) {
    const timeBox = timeInput.closest('.ant-picker') || timeInput;
    await clickNode(timeBox);
    timeInput.value = '';
    timeInput.dispatchEvent(new Event('input', { bubbles: true }));
    timeInput.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 100));
    for (const ch of timePart) {
      timeInput.value += ch;
      timeInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 20));
    }
    timeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    timeInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    timeInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  triggerGlobalEnter();
}

async function publishAndConfirm() {
  const publishBtn = document.querySelector('button.publishBtn, button[class*="publish"], .publish-btn, .ant-modal-footer button.ant-btn-primary');
  if (publishBtn) {
    await clickNode(publishBtn);
  }
  // 优先找 <button.ant-btn.ant-btn-primary.ant-btn-lg> 内含 <span.fvsc>confirm</span>
  for (let i = 0; i < 20; i++) {
    let ok = Array.from(document.querySelectorAll('button.ant-btn.ant-btn-primary.ant-btn-lg'))
      .find(b => {
        const s = b.querySelector('span.fvsc');
        return s && (s.textContent || '').trim().toLowerCase() === 'confirm';
      });
    if (!ok) {
      ok = Array.from(document.querySelectorAll('button, .ant-btn'))
        .find(b => (b.textContent || '').trim().match(/^(确定|确认|OK|Confirm)$/i));
    }
    if (ok) {
      await clickNode(ok);
      break;
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

async function runFlow(startName, endName, intervalMs = 3000) {
  if (flowRunning) return;
  flowRunning = true;
  try {
    const names = buildNameList(startName, endName);
    const total = names.length;
    for (let i = 0; i < names.length; i++) {
      if (!flowRunning) break;
      const name = names[i];
      try {
        const htmlText = await readHtmlFile(name);
        await ensureCreateDialog();
        await fillContentToEditor(htmlText);
        await clickTopPublish();
        await new Promise(r => setTimeout(r, 1000));
        await setScheduleIfPossible();
        await publishAndConfirm();
        chrome.runtime.sendMessage({ action: 'flowProgress', current: i + 1, total, name });
      } catch (e) {
        chrome.runtime.sendMessage({ action: 'flowError', message: `${name}: ${e.message || e}` });
      }
      if (i < names.length - 1 && flowRunning) {
        await new Promise(r => setTimeout(r, intervalMs));
      }
    }
  } finally {
    flowRunning = false;
    chrome.runtime.sendMessage({ action: 'flowDone' });
  }
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req && req.action === '__ping') {
    sendResponse({ ok: true });
    return true;
  }
  if (req && req.action === 'startFlow') {
    userInitialSchedule = String(req.initialSchedule || '').trim();
    scheduleMode = (req.scheduleMode === 'fixed') ? 'fixed' : 'weekly';
    useStandardPrefixSuffix = !!req.useStandard;
    userPatreonUrl = (req.patreonUrl || userPatreonUrl).trim() || userPatreonUrl;
    userCurrentChapter = Number.isFinite(req.currentChapter) ? Number(req.currentChapter) : 1;
    userTotalChapters = Number.isFinite(req.totalChapters) ? Number(req.totalChapters) : 200;
    runFlow(req.startName || '1_p2', req.endName || '3_p2', Number(req.intervalMs) || 3000);
    sendResponse({ status: 'started' });
    return true;
  }
  if (req && req.action === 'stopFlow') {
    flowRunning = false;
    sendResponse({ status: 'stopped' });
    return true;
  }
  return false;
});
