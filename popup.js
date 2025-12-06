// Phase 1 & 2: Popup Logic with Storage and UI Handling

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

  // --- Toolbar Logic (Simple) ---
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

  // --- File Handling (Phase 3 Prep) ---
  fileInput.addEventListener('change', (e) => {
    selectedFiles = Array.from(e.target.files);
    // Sort files by name (alphanumeric sort needed for Ch1, Ch2, Ch10)
    selectedFiles.sort((a, b) => {
      return a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });

    fileCount.textContent = `${selectedFiles.length} files selected`;
    // In Phase 3, we will read these files. For now, we just acknowledge selection.
  });

  // --- Flow Control ---
  startBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) {
      statusDiv.textContent = 'Error: No files selected.';
      return;
    }

    statusDiv.textContent = 'Status: Preparing files...';

    try {
      // For now (Phase 1/2), we will read files here and pass content to content script
      // This is a naive implementation for text/html files.
      // In Phase 3, we will make this robust.
      const chapters = [];
      for (const file of selectedFiles) {
        const text = await file.text();
        chapters.push({
          name: file.name,
          content: text,
        });
      }

      const tab = await getActiveTab();
      await ensureContentScript(tab.id);

      // Get settings from storage to ensure we have latest
      const settings = await chrome.storage.local.get([
        'prefixTemplate',
        'suffixTemplate',
        'patreonUrl',
      ]);

      const payload = {
        action: 'startFlow',
        chapters: chapters, // Sending all content (warning: memory limit if too huge, but usually novels are text)
        settings: settings,
      };

      await send(tab.id, payload);
      statusDiv.textContent = `Status: Flow started with ${chapters.length} chapters.`;
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
