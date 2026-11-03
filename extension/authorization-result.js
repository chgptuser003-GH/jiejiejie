chrome.storage.local.get('authResult').then(({ authResult }) => {
  const target = document.getElementById('result');
  target.textContent = authResult?.message || '沒有收到授權結果。';
  target.className = authResult?.success ? 'success' : 'error';
});
