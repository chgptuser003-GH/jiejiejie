const BASE = 'http://127.0.0.1:8787';
const $ = id => document.getElementById(id);

async function api(path, { method = 'GET', body } = {}) {
  const { pairToken } = await chrome.storage.local.get('pairToken');
  if (!pairToken) throw new Error('請先儲存本機配對碼');
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${pairToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) {
    if (result.error === 'pairing_required') {
      throw new Error('本機配對碼不正確，請重新複製後端視窗的配對碼。');
    }
    if (result.error === 'shop_authorization_required' || result.error === 'shop_authorization_expired') {
      throw new Error('請先點「授權測試店鋪」。');
    }
    throw new Error(result.message || result.error || `HTTP ${response.status}`);
  }
  return result;
}

function showError(error, target = 'results') {
  $(target).className = 'results error';
  $(target).textContent = error.message || String(error);
}

async function checkHealth() {
  let result;
  try {
    const response = await fetch(`${BASE}/health`);
    if (!response.ok) throw new Error('本機後端未就緒');
    result = await response.json();
  } catch {
    document.querySelector('.state-section').classList.add('offline');
    $('status').className = 'error';
    $('status').textContent = '本機後端未啟動；利潤計算仍可使用。';
    $('auth-status').textContent = '本機後端未連線，無法確認授權';
    return;
  }
  document.querySelector('.state-section').classList.remove('offline');
  $('status').className = 'success';
  $('status').textContent = `本機後端已連線 · 測試 Shop ID ${result.shopId}`;
  try {
    const { pairToken } = await chrome.storage.local.get('pairToken');
    if (!pairToken) {
      $('auth-status').textContent = '請先儲存本機配對碼';
      return;
    }
    const auth = await fetch(`${BASE}/api/items?status=NORMAL&pageSize=1`, {
      headers: { authorization: `Bearer ${pairToken}` },
    });
    if (auth.ok) {
      $('auth-status').textContent = `測試店鋪 ${result.shopId} 已授權`;
    } else {
      const data = await auth.json();
      $('auth-status').textContent = data.error === 'pairing_required'
        ? '配對碼不正確，請重新儲存'
        : ['shop_authorization_required', 'shop_authorization_expired'].includes(data.error)
          ? '尚未完成測試店鋪授權'
          : '授權狀態暫時無法確認';
    }
  } catch {
    $('auth-status').textContent = '授權狀態暫時無法確認';
  }
}

async function initialize() {
  const stored = await chrome.storage.local.get('pairToken');
  $('pair-token').value = stored.pairToken || '';
  await checkHealth();
}

$('save-pair').addEventListener('click', async () => {
  const pairToken = $('pair-token').value.trim();
  if (!pairToken) return showError(new Error('請輸入配對碼'));
  try {
    const response = await fetch(`${BASE}/api/items?status=NORMAL&pageSize=1`, {
      headers: { authorization: `Bearer ${pairToken}` },
    });
    if (response.status === 401) throw new Error('配對碼不正確，請重新複製後端視窗的配對碼。');
    await chrome.storage.local.set({ pairToken });
    $('results').className = 'results success';
    $('results').textContent = '配對碼已驗證並儲存。';
    await checkHealth();
  } catch (error) { showError(error); }
});

for (const [buttonId, destination] of Object.entries({
  'open-dashboard': 'ads/ads-all',
  'open-flash': 'flash/flash-renew',
  'open-shipping': 'shipping/shipping-days',
  'open-calculator': 'calculator/calculator-main',
  'open-budget': 'budget/budget-rules',
  'open-products': 'products/products-bulk',
  'open-marketing': 'marketing/marketing-bundle',
})) {
  $(buttonId).addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html#${destination}`) });
  });
}

$('authorize').addEventListener('click', async () => {
  try {
    const result = await api('/oauth/start');
    await chrome.storage.local.set({ pendingRedirectOrigin: result.redirectOrigin });
    await chrome.tabs.create({ url: result.authorizationUrl });
    $('auth-status').textContent = '請在新分頁完成 Shopee 測試店鋪授權。';
  } catch (error) { showError(error); }
});

initialize();
