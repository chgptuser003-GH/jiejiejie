const BASE = 'http://127.0.0.1:8787';
const READ_ONLY_SANDBOX_SHOP_ID = '228006723';
const inflight = new Set();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url || inflight.has(tabId)) return;
  let callback;
  try { callback = new URL(changeInfo.url); } catch { return; }
  const { pendingRedirectOrigin, pairToken } = await chrome.storage.local.get(['pendingRedirectOrigin', 'pairToken']);
  if (!pendingRedirectOrigin || !pairToken || callback.origin !== pendingRedirectOrigin) return;
  const code = callback.searchParams.get('code');
  const callbackError = callback.searchParams.get('error');
  const shopId = callback.searchParams.get('shop_id');
  const state = callback.searchParams.get('state');
  if (!state || (!code && !callbackError)) return;
  inflight.add(tabId);
  await chrome.storage.local.remove('pendingRedirectOrigin');
  try {
    if (callbackError) throw new Error('Shopee 授權未完成。');
    if (String(shopId) !== READ_ONLY_SANDBOX_SHOP_ID) throw new Error('目前只允許臺灣沙盒測試店鋪授權。');
    const healthResponse = await fetch(`${BASE}/health`);
    if (!healthResponse.ok) throw new Error('本機沙盒後端未就緒。');
    const health = await healthResponse.json();
    if (health.environment !== 'sandbox' || String(health.shopId) !== READ_ONLY_SANDBOX_SHOP_ID) {
      throw new Error('目前只允許連接臺灣沙盒測試店鋪。');
    }
    const response = await fetch(`${BASE}/oauth/finish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${pairToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ code, shopId, state }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || result.error || '授權失敗');
    await chrome.storage.local.set({ authResult: { success: true, message: `測試店鋪 ${result.shopId} 已授權。` } });
  } catch (error) {
    await chrome.storage.local.set({ authResult: { success: false, message: error.message || '授權失敗' } });
  } finally {
    await chrome.tabs.update(tabId, { url: chrome.runtime.getURL('authorization-result.html') });
    inflight.delete(tabId);
  }
});
