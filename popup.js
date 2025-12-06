// Phase 3: File Handling System Upgrade
// - Robust file reading (Text/HTML)
// - Natural Sort
// - Memory management for large batches

document.addEventListener('DOMContentLoaded', async () => {
  // --- UI Elements ---
  const tabs = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');

  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusDiv = document.getElementById('status');
  const fileInput = document.getElementById('files');
  const fileCount = document.getElementById('file-count');

  const prefixEditor = document.getElementById('prefixEditor');
  const suffixEditor = document.getElementById('suffixEditor');
  const saveTemplatesBtn = document.getElementById('saveTemplatesBtn');
  const templateStatus = document.getElementById('templateStatus');

  const patreonUrlInput = document.getElementById('patreonUrl');
  const targetNovelInput = document.getElementById('targetNovel');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const settingsStatus = document.getElementById('settingsStatus');

  // --- State ---
  let selectedFiles = [];

  // --- Initialization ---
  loadStoredData();

  // --- Tab Switching ---
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      contents.forEach((c) => c.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      document.getElementById(targetId).classList.add('active');
    });
  });

  // --- Toolbar Logic ---
  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      document.execCommand(cmd, false, null);
    });
  });

  // --- Storage Handling ---
  async function loadStoredData() {
    const data = await chrome.storage.local.get([
      'prefixTemplate',
      'suffixTemplate',
      'patreonUrl',
      'targetNovel',
    ]);

    if (data.prefixTemplate) prefixEditor.innerHTML = data.prefixTemplate;
    if (data.suffixTemplate) suffixEditor.innerHTML = data.suffixTemplate;
    if (data.patreonUrl) patreonUrlInput.value = data.patreonUrl;
    if (data.targetNovel) targetNovelInput.value = data.targetNovel;
  }

  saveTemplatesBtn.addEventListener('click', async () => {
    const prefix = prefixEditor.innerHTML;
    const suffix = suffixEditor.innerHTML;

    await chrome.storage.local.set({
      prefixTemplate: prefix,
      suffixTemplate: suffix,
    });

    showStatus(templateStatus, 'Templates saved successfully!');
  });

  saveSettingsBtn.addEventListener('click', async () => {
    const url = patreonUrlInput.value;
    const novel = targetNovelInput.value;

    await chrome.storage.local.set({
      patreonUrl: url,
      targetNovel: novel,
    });

    showStatus(settingsStatus, 'Settings saved successfully!');
  });

  function showStatus(element, msg) {
    element.textContent = msg;
    setTimeout(() => {
      element.textContent = '';
    }, 2000);
  }

  // --- File Handling (Phase 3) ---
  fileInput.addEventListener('change', (e) => {
    // 1. Filter for text/html only to avoid system files like .DS_Store
    const rawFiles = Array.from(e.target.files).filter(f =>
      f.name.match(/\.(txt|html|htm)$/i) || f.type.startsWith('text/')
    );

    // 2. Sort files naturally (Chapter 1, Chapter 2, Chapter 10)
    selectedFiles = rawFiles.sort((a, b) => {
      return a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });

    fileCount.textContent = `${selectedFiles.length} files selected (Filtered & Sorted)`;

    if (selectedFiles.length > 0) {
      statusDiv.textContent = `Ready: ${selectedFiles[0].name} ... ${selectedFiles[selectedFiles.length-1].name}`;
    }
  });

  async function readFiles(files) {
    const results = [];
    const total = files.length;

    // Safety check for massive uploads
    if (total > 500) {
        if (!confirm(`You are about to upload ${total} chapters. This might take a while to read. Continue?`)) {
            throw new Error('Upload cancelled by user.');
        }
    }

    for (let i = 0; i < total; i++) {
        const file = files[i];
        // Update UI every 10 files so user knows it's working
        if (i % 10 === 0) {
            statusDiv.textContent = `Reading file ${i+1}/${total}: ${file.name}`;
            // Allow UI to breathe
            await new Promise(r => setTimeout(r, 0));
        }

        try {
            const text = await file.text();
            results.push({
                name: file.name,
                content: text
            });
        } catch (err) {
            console.error(`Failed to read ${file.name}`, err);
            // We continue, but maybe log it?
            results.push({
                name: file.name,
                content: `[ERROR READING FILE] ${err.message}`
            });
        }
    }
    return results;
  }

  // --- Flow Control ---
  startBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) {
      statusDiv.textContent = 'Error: No files selected.';
      return;
    }

    try {
      // Step 1: Read Files
      statusDiv.textContent = 'Reading files...';
      const chapters = await readFiles(selectedFiles);

      // Step 2: Inject Content Script
      const tab = await getActiveTab();
      await ensureContentScript(tab.id);

      // Step 3: Get Settings
      const settings = await chrome.storage.local.get([
        'prefixTemplate',
        'suffixTemplate',
        'patreonUrl',
      ]);

      // Step 4: Send Payload
      statusDiv.textContent = 'Starting automation...';
      const payload = {
        action: 'startFlow',
        chapters: chapters,
        settings: settings,
      };

      await send(tab.id, payload);
      statusDiv.textContent = `Flow started: ${chapters.length} chapters.`;

    } catch (e) {
      console.error(e);
      statusDiv.textContent = `Error: ${e.message}`;
    }
  });

  stopBtn.addEventListener('click', async () => {
    try {
      const tab = await getActiveTab();
      await send(tab.id, { action: 'stopFlow' });
      statusDiv.textContent = 'Status: Stopping...';
    } catch (e) {
      console.error(e);
      statusDiv.textContent = 'Error: Could not stop. (Is tab open?)';
    }
  });

  // --- Helpers ---
  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab) throw new Error('No active tab found');
    return tab;
  }

  async function ensureContentScript(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: '__ping' });
    } catch (e) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js'],
        });
      } catch (err) {
        console.warn('Injection failed:', err);
      }
    }
  }

  function send(tabId, payload) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, payload, (res) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(err);
        resolve(res);
      });
    });
  }

  // Monitor progress
  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === 'flowProgress') {
      statusDiv.textContent = `Progress: ${req.current}/${req.total} (${req.name})`;
    } else if (req.action === 'flowDone') {
      statusDiv.textContent = 'Status: Complete';
    } else if (req.action === 'flowError') {
      statusDiv.textContent = `Error: ${req.message}`;
    }
  });
});
