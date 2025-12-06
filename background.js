chrome.runtime.onInstalled.addListener(() => {
  console.log('[webnovel_helper] 扩展已安装');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[webnovel_helper] 浏览器启动');
});
