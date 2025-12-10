/**
 * @file content.js
 * @description Core execution logic for Webnovel Automation v2.0
 * Handles DOM manipulation, content injection, and scheduling.
 */

// --- Type Definitions (JSDoc) ---

/**
 * @typedef {Object} Chapter
 * @property {string} name - Filename or chapter title
 * @property {string} content - Raw HTML/Text content
 */

/**
 * @typedef {Object} AppSettings
 * @property {string} prefixTemplate - HTML string for prefix
 * @property {string} suffixTemplate - HTML string for suffix
 * @property {string} patreonUrl - URL to inject
 * @property {string} targetNovel - Novel ID/Title (unused in Phase 1)
 */

/**
 * @typedef {Object} ScheduleConfig
 * @property {boolean} enabled
 * @property {string} startTime - ISO String
 * @property {number} batchSize
 * @property {number} intervalVal
 * @property {number} intervalUnit - seconds
 */


// --- Constants & State ---

const STATE = {
  running: false,
  chapters: /** @type {Chapter[]} */ ([]),
  settings: /** @type {AppSettings} */ ({}),
  scheduleConfig: /** @type {ScheduleConfig} */ ({}),
  currentIndex: 0
};

// --- Utilities (Fail Fast) ---

/**
 * Pauses execution for a specified time.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validates that a DOM element exists.
 * @param {string} selector - CSS selector
 * @param {number} timeoutMs - Max wait time
 * @param {HTMLElement|Document} [root=document] - Root element to search in
 * @returns {Promise<HTMLElement>}
 * @throws {Error} If element not found within timeout
 */
async function assertElement(selector, timeoutMs = 5000, root = document) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!STATE.running) throw new Error('Process stopped by user.');

    const el = root.querySelector(selector);
    if (el) return el;

    // Also check inside iframes (TinyMCE support)
    const frames = document.querySelectorAll('iframe');
    for (const frame of frames) {
      try {
        const doc = frame.contentDocument || frame.contentWindow.document;
        const innerEl = doc.querySelector(selector);
        if (innerEl) return innerEl;
      } catch (e) {
        // Access denied or cross-origin
      }
    }

    await sleep(200);
  }
  throw new Error(`CRITICAL: Element not found: "${selector}"`);
}

/**
 * Tries to find an element by text content (buttons mostly).
 * @param {string} tagName
 * @param {string} text
 * @returns {HTMLElement|null}
 */
function findElementByText(tagName, text) {
  const elements = Array.from(document.querySelectorAll(tagName));
  return elements.find(el => el.textContent.trim().toLowerCase() === text.toLowerCase()) || null;
}

// --- Core Logic ---

/**
 * Main entry point for the upload flow.
 * @param {Chapter[]} chapters
 * @param {AppSettings} settings
 * @param {ScheduleConfig} scheduleConfig
 */
async function runFlow(chapters, settings, scheduleConfig) {
  if (STATE.running) return;
  STATE.running = true;
  STATE.chapters = chapters;
  STATE.settings = settings;
  STATE.scheduleConfig = scheduleConfig;
  STATE.currentIndex = 0;

  try {
    // 0. Ensure we are targeting the correct book
    if (settings.targetNovel) {
        await ensureCorrectBook(settings.targetNovel);
    }

    for (let i = 0; i < chapters.length; i++) {
      if (!STATE.running) break;
      STATE.currentIndex = i;
      const chapter = chapters[i];

      notifyProgress(i + 1, chapters.length, chapter.name);

      await processChapter(chapter, i);

      // Safety delay between chapters
      await sleep(2000);
    }
    notifyDone();
  } catch (error) {
    console.error(error);
    notifyError(error.message);
  } finally {
    STATE.running = false;
  }
}

/**
 * Navigates to the correct book if specified.
 * @param {string} targetNovel - Novel Title or ID
 */
async function ensureCorrectBook(targetNovel) {
    const normalize = (s) => String(s || '').trim().toLowerCase();
    const target = normalize(targetNovel);

    // If we are already in the editor, assume user navigated manually or we are continuing
    const editorBody = document.querySelector('body#tinymce') || document.querySelector('.mce-content-body');
    if (editorBody) return;

    // Check if we are on the dashboard
    if (!location.href.includes('inkstone.webnovel.com')) {
        throw new Error('Please navigate to the Webnovel Inkstone Dashboard first.');
    }

    // Attempt to find the book card
    const potentialTitles = Array.from(document.querySelectorAll('h3, .book-name, .novel-title, a'));

    let bookCard = null;
    for (const el of potentialTitles) {
        if (normalize(el.textContent).includes(target)) {
            // Found a match. Now find the "Explore" or "Chapters" or "Create" button relative to this.
            bookCard = el.closest('.novel-card') || el.closest('.ant-card') || el.closest('li') || el.parentElement;
            break;
        }
    }

    if (!bookCard) {
        if (location.href.includes(target)) return; // Already there
        throw new Error(`Could not find novel matching "${targetNovel}". Please ensure it is visible on the dashboard.`);
    }

    // Find action button inside the card
    const actionBtn = bookCard.querySelector('a[href*="chapter"], button');
    if (actionBtn) {
        actionBtn.click();
        await sleep(3000); // Wait for navigation
    } else {
         // Try clicking the title itself
         const link = bookCard.querySelector('a');
         if (link) {
             link.click();
             await sleep(3000);
         }
    }
}


/**
 * Process a single chapter: Open Editor -> Fill -> Publish -> Schedule (Optional)
 * @param {Chapter} chapter
 * @param {number} index
 */
async function processChapter(chapter, index) {
  // 1. Ensure we are in the editor (Open "Create Chapter" modal if needed)
  await ensureEditorOpen();

  // 2. Parse Content (Title vs Body)
  const { title, body } = parseContent(chapter.content, chapter.name);

  // 3. Apply Templates
  const finalBody = applyTemplates(body, STATE.settings);

  // 4. Fill Form
  await fillEditorForm(title, finalBody);

  // 5. Handle Publication (Instant or Scheduled)
  if (STATE.scheduleConfig && STATE.scheduleConfig.enabled) {
      await applySchedule(index);
  } else {
      await clickPublish();
  }

  // 6. Handle Confirmation
  await confirmPublish();
}

/**
 * Calculates the schedule date for the Nth chapter and applies it.
 * @param {number} index
 */
async function applySchedule(index) {
    const config = STATE.scheduleConfig;
    const start = new Date(config.startTime);
    const batchSize = config.batchSize || 1;
    const intervalSeconds = (config.intervalVal || 24) * (config.intervalUnit || 3600);

    // Calculate which batch this chapter belongs to (0-indexed)
    const batchIndex = Math.floor(index / batchSize);

    // Calculate timestamp
    const releaseTime = new Date(start.getTime() + (batchIndex * intervalSeconds * 1000));

    // Formatting for Webnovel Inputs
    // We assume Webnovel uses Ant Design DatePicker or similar
    // Format: YYYY-MM-DD HH:mm

    // Click "Scheduled" or Switch if necessary
    // Often it's a switch or radio. Let's look for "Schedule" text or switch
    const switchBtn = document.querySelector('button[role="switch"]');
    if (switchBtn && switchBtn.getAttribute('aria-checked') !== 'true') {
        switchBtn.click();
        await sleep(500);
    }

    // Fill Date
    // Note: Ant Design DatePickers are complex to automate via raw input value.
    // We often need to simulate clicks.

    const yyyy = releaseTime.getFullYear();
    const mm = String(releaseTime.getMonth() + 1).padStart(2, '0');
    const dd = String(releaseTime.getDate()).padStart(2, '0');
    const HH = String(releaseTime.getHours()).padStart(2, '0');
    const MM = String(releaseTime.getMinutes()).padStart(2, '0');

    const dateStr = `${yyyy}-${mm}-${dd}`;
    const timeStr = `${HH}:${MM}`;

    console.log(`Scheduling Chapter ${index} for ${dateStr} ${timeStr}`);

    // Try to find inputs. Usually "Select date" placeholders.
    const dateInput = document.querySelector('input[placeholder*="date"], input[placeholder*="日期"]');
    if (dateInput) {
        // React/AntD often requires click -> type -> enter
        dateInput.click();
        await sleep(200);
        // Sometimes clicking opens a portal, so we might need to find the active input there?
        // Or just force value and dispatch events.

        // Strategy: Force value + React Tracker override if possible, or simple events
        forceInputValue(dateInput, dateStr);
        dateInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await sleep(200);
    }

    const timeInput = document.querySelector('input[placeholder*="time"], input[placeholder*="时间"]');
    if (timeInput) {
        timeInput.click();
        await sleep(200);
        forceInputValue(timeInput, timeStr);
        timeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await sleep(200);
    }

    // Click the actual Publish/Confirm button for the schedule
    // It is often the same "Publish" button
    await clickPublish();
}

/**
 * Helper to force input value for React controlled inputs
 */
function forceInputValue(input, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}


/**
 * Parses raw file content into Title and Body.
 * Supports HTML parsing (extracting title from content) and Text parsing.
 * @param {string} content
 * @param {string} filename
 */
function parseContent(content, filename) {
  let title = filename.replace(/\.(txt|html|htm)$/i, '');
  let body = content;

  // Check if content looks like HTML
  if (content.trim().startsWith('<') || filename.endsWith('.html')) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');

    // Simple heuristic: Text Walker to extract meaningful text, preserving basic structure
    // This mimics the logic from the original content.js

    // If there is a title in the HTML (e.g. h1), use it?
    // The original code tried to extract the first line of text as title.

    // Let's reuse the original extraction logic pattern
    const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let text = '';
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (n.nodeType === Node.TEXT_NODE) {
        text += n.nodeValue;
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        const tag = n.tagName.toLowerCase();
        if (['br', 'p', 'div', 'li', 'h1', 'h2', 'h3'].includes(tag)) {
          text += '\n';
        }
      }
    }

    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const extractedTitle = (lines[0] || '').slice(0, 200); // Limit title length

    if (extractedTitle) {
      title = extractedTitle;
      // Remove title from body if it matches exactly?
      // For now, keep body as is, but maybe strip the title if it's very prominent?
      // The original code did: bodyHtml = bodyHtml.replace(re, '');
      const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped);
      // We operate on the original HTML content
      body = content.replace(re, '');
    }
  } else {
    // Plain Text: First line is title
    const lines = content.split('\n');
    if (lines.length > 0 && lines[0].trim().length > 0 && lines[0].trim().length < 100) {
      title = lines[0].trim();
      body = lines.slice(1).join('\n')
        .split('\n')
        .map(line => line.trim() ? `<p>${line.trim()}</p>` : '<p><br></p>')
        .join('');
    } else {
      // Just body
       body = lines
        .map(line => line.trim() ? `<p>${line.trim()}</p>` : '<p><br></p>')
        .join('');
    }
  }

  return { title, body };
}

/**
 * Injects Prefix/Suffix templates.
 * @param {string} body
 * @param {AppSettings} settings
 */
function applyTemplates(body, settings) {
  let content = body;

  if (settings.prefixTemplate) {
    content = `${settings.prefixTemplate}\n<hr>\n${content}`;
  }

  if (settings.suffixTemplate) {
    // Replace placeholder if exists
    let suffix = settings.suffixTemplate;
    if (settings.patreonUrl) {
      suffix = suffix.replace(/\[PatreonUrl\]/gi, settings.patreonUrl);
    }
    content = `${content}\n<hr>\n${suffix}`;
  }

  return content;
}

/**
 * Ensures the "Create Chapter" modal/page is active.
 */
async function ensureEditorOpen() {
  // Check if editor exists
  const editorBody = document.querySelector('body#tinymce') ||
                     document.querySelector('.mce-content-body');

  if (editorBody) return; // Already open

  // Click "Create Chapter"
  // Try different selectors known for Webnovel Inkstone
  let btn = document.querySelector('button[data-report-uiname="cac"]');
  if (!btn) {
      // Fallback text search
      btn = findElementByText('button', 'create chapter');
  }

  if (btn) {
    btn.click();
    await sleep(1000);
    // Wait for editor
    await assertElement('.mce-content-body', 10000);
  } else {
    // If we can't find the button, and we aren't in editor, fail.
    // Maybe user is on dashboard.
    throw new Error('Could not find "Create Chapter" button. Please navigate to the novel dashboard.');
  }
}

/**
 * Fills the Title and TinyMCE Editor.
 * @param {string} title
 * @param {string} body
 */
async function fillEditorForm(title, body) {
  // Title Input
  const titleInput = await assertElement('input[placeholder*="Title"]');
  titleInput.value = title;
  titleInput.dispatchEvent(new Event('input', { bubbles: true }));

  // TinyMCE Body
  // We need to set content via TinyMCE API if possible, or direct DOM
  const editorWindow = getTinyMceWindow();
  if (editorWindow && editorWindow.tinymce && editorWindow.tinymce.activeEditor) {
    editorWindow.tinymce.activeEditor.setContent(body);
  } else {
    // Fallback: Direct DOM manipulation (flaky)
    const editorBody = await assertElement('.mce-content-body');
    editorBody.innerHTML = body;
  }

  await sleep(500);
}

function getTinyMceWindow() {
  if (window.tinymce) return window;
  // Check frames
  const frames = document.querySelectorAll('iframe');
  for (const f of frames) {
    if (f.contentWindow && f.contentWindow.tinymce) return f.contentWindow;
  }
  return null;
}

/**
 * Clicks the "Publish" button.
 */
async function clickPublish() {
  // Webnovel usually has a "Publish" button at the top right or bottom
  const btn = findElementByText('button', 'publish');
  if (!btn) throw new Error('Publish button not found');

  btn.click();
  await sleep(1000);
}

/**
 * Confirms the publication (handling modals).
 */
async function confirmPublish() {
  // Often a confirmation modal appears "Are you sure?" or "Confirm"
  // Wait a bit to see if modal appears
  try {
    const confirmBtn = await assertElement('.ant-modal button.ant-btn-primary', 3000);
    if (confirmBtn && confirmBtn.textContent.toLowerCase().includes('confirm')) {
      confirmBtn.click();
      await sleep(2000); // Wait for submission
    }
  } catch (e) {
    // No modal, maybe direct publish
  }
}

// --- Communication ---

function notifyProgress(current, total, name) {
  chrome.runtime.sendMessage({
    action: 'flowProgress',
    current,
    total,
    name
  });
}

function notifyDone() {
  chrome.runtime.sendMessage({ action: 'flowDone' });
}

function notifyError(message) {
  chrome.runtime.sendMessage({ action: 'flowError', message });
}

// Listen for messages from Popup
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === '__ping') {
    sendResponse({ ok: true });
    return;
  }

  if (req.action === 'startFlow') {
    runFlow(req.chapters, req.settings, req.scheduleConfig);
    sendResponse({ status: 'started' });
  }

  if (req.action === 'stopFlow') {
    STATE.running = false;
    sendResponse({ status: 'stopping' });
  }
});
