document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusDiv = document.getElementById('status');
  const startName = document.getElementById('startName');
  const endName = document.getElementById('endName');
  const initialSchedule = document.getElementById('initialSchedule');
  const prefixControls = document.getElementById('prefixControls');
  const patreonUrl = document.getElementById('patreonUrl');
  const currentChapter = document.getElementById('currentChapter');
  const totalChapters = document.getElementById('totalChapters');

  function setStatus(text) {
    statusDiv.textContent = `状态：${text}`;
  }

  function getPrefixMode() {
    const checked = document.querySelector('input[name="prefixMode"]:checked');
    return checked ? checked.value : 'standard';
  }

  function getScheduleMode() {
    const checked = document.querySelector('input[name="scheduleMode"]:checked');
    return checked ? checked.value : 'weekly';
  }

  function updatePrefixControls() {
    const mode = getPrefixMode();
    prefixControls.style.display = mode === 'standard' ? 'block' : 'none';
  }

  document.querySelectorAll('input[name="prefixMode"]').forEach(r => {
    r.addEventListener('change', updatePrefixControls);
  });
  updatePrefixControls();

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('未找到活动标签页');
    return tab;
  }

  async function ensureContentScript(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: '__ping' });
    } catch (e) {
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      } catch (err) {
        console.warn('注入 content.js 失败：', err);
      }
    }
  }

  async function send(tabId, payload) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, payload, (res) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(err);
        resolve(res);
      });
    });
  }

  startBtn.addEventListener('click', async () => {
    try {
      const tab = await getActiveTab();
      await ensureContentScript(tab.id);
      const start = (startName.value || '1_p2').trim();
      const end = (endName.value || '3_p2').trim();
      const schedule = (initialSchedule.value || '').trim();
      const mode = getPrefixMode();
      const scheduleMode = getScheduleMode();
      const payload = {
        action: 'startFlow',
        startName: start,
        endName: end,
        intervalMs: 3000,
        initialSchedule: schedule,
        scheduleMode,
        useStandard: mode === 'standard',
        patreonUrl: (patreonUrl.value || '').trim(),
        currentChapter: parseInt(currentChapter.value || '1', 10) || 1,
        totalChapters: parseInt(totalChapters.value || '200', 10) || 200
      };
      await send(tab.id, payload);
      setStatus(`流程已启动：${start} -> ${end}`);
    } catch (e) {
      console.error(e);
      setStatus(`错误：${e.message || e}`);
    }
  });

  stopBtn.addEventListener('click', async () => {
    try {
      const tab = await getActiveTab();
      await ensureContentScript(tab.id);
      await send(tab.id, { action: 'stopFlow' });
      setStatus('流程已停止');
    } catch (e) {
      console.error(e);
      setStatus(`错误：${e.message || e}`);
    }
  });

  chrome.runtime.onMessage.addListener((req) => {
    if (req && req.action === 'flowProgress') {
      setStatus(`进行中：${req.current}/${req.total}（${req.name}.html）`);
    } else if (req && req.action === 'flowDone') {
      setStatus('流程完成');
    } else if (req && req.action === 'flowError') {
      setStatus(`错误：${req.message}`);
    }
  });
});
