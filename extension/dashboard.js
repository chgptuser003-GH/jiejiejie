import { modules, statuses } from './feature-catalog.js';
import { calculateProfit, DEFAULT_CALCULATOR_SETTINGS } from './calculator.js';
import { evaluateBudgetTopup } from './budget-rule.js';
import { scanCampaignPages } from './campaign-scan.js';
import { parseItemIds, selectDeletionCandidates } from './campaign-selection.js';

const BASE = 'http://127.0.0.1:8787';
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const $ = id => document.getElementById(id);
let activeModule = modules[0];
let activeFeature = activeModule.features[0];

async function api(path, { method = 'GET', body } = {}) {
  const { pairToken } = await chrome.storage.local.get('pairToken');
  if (!pairToken) throw new Error('請先在插件視窗儲存本機配對碼。');
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${pairToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    if (data.error === 'pairing_required') {
      throw new Error('本機配對碼不正確，請在插件視窗重新儲存。');
    }
    if (['shop_authorization_required', 'shop_authorization_expired'].includes(data.error)) {
      throw new Error('測試店鋪尚未授權，請在插件視窗點「授權測試店鋪」。');
    }
    throw new Error(data.message || data.error || `HTTP ${response.status}`);
  }
  return data;
}

function field(parent, labelText, id, { type = 'number', value = '', min, step, options } = {}) {
  const label = node('label', '', labelText);
  const input = node(options ? 'select' : 'input');
  input.id = id;
  if (options) {
    for (const [optionValue, optionText] of options) {
      const option = node('option', '', optionText);
      option.value = optionValue;
      input.append(option);
    }
  } else {
    input.type = type;
    if (min !== undefined) input.min = min;
    if (step !== undefined) input.step = step;
  }
  input.value = value;
  label.append(input);
  parent.append(label);
  return input;
}

function toolPanel(title, description) {
  const panel = node('div', 'tool');
  panel.append(node('h3', '', title), node('p', '', description));
  const fields = node('div', 'fields');
  panel.append(fields);
  const output = node('div', 'output', '輸入條件後按執行。');
  return { panel, fields, output };
}

function runButton(panel, output, action, label = '查詢') {
  const button = node('button', 'run-button', label);
  button.type = 'button';
  panel.append(button, output);
  button.addEventListener('click', async () => {
    button.disabled = true;
    output.className = 'output';
    output.replaceChildren(node('span', '', '處理中…'));
    try { await action(output); }
    catch (error) {
      output.className = 'output error';
      output.textContent = error.message || String(error);
    } finally { button.disabled = false; }
  });
}

function table(output, headers, rows) {
  output.replaceChildren();
  if (!rows.length) return output.append(node('span', '', '沒有符合的資料。'));
  const element = node('table', 'data-table');
  const head = node('thead');
  const headRow = node('tr');
  for (const heading of headers) headRow.append(node('th', '', heading));
  head.append(headRow);
  const body = node('tbody');
  for (const cells of rows) {
    const row = node('tr');
    for (const cell of cells) row.append(node('td', '', String(cell ?? '—')));
    body.append(row);
  }
  element.append(head, body);
  output.append(element);
}

function dateForApi(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('請選擇日期。');
  const [year, month, day] = value.split('-');
  return `${day}-${month}-${year}`;
}

function todayTaipei() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function appendCampaignTool(container) {
  const { panel, fields, output } = toolPanel('活動列表', '已通過沙盒只讀驗證；可按類型和起始位置查詢廣告活動。');
  const type = field(fields, '廣告類型', 'ad-type', { options: [['all', '全部'], ['manual', '手動選品'], ['auto', '自動']] });
  const limit = field(fields, '本頁上限', 'ad-limit', { value: '100', min: '1', step: '1' });
  const offset = field(fields, '起始位置', 'ad-offset', { value: '0', min: '0', step: '1' });
  runButton(panel, output, async target => {
    const data = await api(`/api/ads?type=${encodeURIComponent(type.value)}&limit=${encodeURIComponent(limit.value)}&offset=${encodeURIComponent(offset.value)}`);
    const campaigns = data.campaign_list || [];
    target.replaceChildren(node('p', 'query-summary', `本頁 ${campaigns.length} 個活動${data.has_next_page ? '；後面還有資料' : ''}。`));
    if (!campaigns.length) {
      target.append(node('span', '', '這家沙盒店鋪目前沒有廣告活動。'));
    } else {
      let settingsById = new Map();
      try {
        const ids = campaigns.map(item => item.campaign_id).filter(Boolean).slice(0, 100);
        const settings = await api(`/api/ads/settings?ids=${encodeURIComponent(ids.join(','))}`);
        settingsById = new Map((settings.campaign_list || []).map(item => [String(item.campaign_id), item]));
      } catch (error) {
        target.append(node('p', 'query-note', `活動設定暫時無法讀取：${error.message || String(error)}`));
      }
      const tableOutput = node('div');
      table(tableOutput, ['活動 ID', '名稱', '狀態', '競價方式', '預算 TWD', '商品 ID', '目標 ROAS'], campaigns.map(item => {
        const settings = settingsById.get(String(item.campaign_id));
        const info = settings?.common_info;
        return [item.campaign_id, info?.ad_name, info?.campaign_status, info?.bidding_method,
          info?.campaign_budget, info?.item_id_list?.join('、'),
          settings?.auto_bidding_info?.roas_target];
      }));
      target.append(tableOutput);
    }
  });
  container.append(panel);
}

function appendAllAdCandidates(container) {
  const { panel, fields, output } = toolPanel('在架商品投放預覽',
    '只讀檢查本頁在架商品是否已出現在廣告活動；庫存和建立資格尚未驗證，不會自動建立廣告。');
  const offset = field(fields, '商品起始位置', 'all-ad-item-offset', { value: '0', min: '0', step: '1' });
  const size = field(fields, '本頁商品上限', 'all-ad-item-size', { value: '100', min: '1', step: '1' });
  runButton(panel, output, async target => {
    const itemOffset = Number(offset.value);
    const pageSize = Number(size.value);
    if (!Number.isSafeInteger(itemOffset) || itemOffset < 0
      || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new Error('起始位置須為非負整數，本頁上限須為 1–100。');
    }
    const products = await api(`/api/items?status=NORMAL&offset=${itemOffset}&pageSize=${pageSize}`);
    const items = products.item || [];
    if (!items.length) {
      target.textContent = '本頁沒有在架商品。';
      return;
    }
    const advertisedIds = new Set();
    let adOffset = 0;
    let scanComplete = false;
    let scannedCampaigns = 0;
    for (let page = 0; page < 5; page++) {
      const listed = await api(`/api/ads?limit=100&offset=${adOffset}`);
      const campaigns = (listed.campaign_list || []).filter(item => item.campaign_id);
      if (campaigns.length) {
        const joined = encodeURIComponent(campaigns.map(item => item.campaign_id).join(','));
        const settings = await api(`/api/ads/settings?ids=${joined}`);
        if ((settings.campaign_list || []).length !== campaigns.length) {
          throw new Error('有廣告活動設定未回傳，無法可靠判定商品是否已投放。');
        }
        for (const campaign of settings.campaign_list) {
          for (const itemId of campaign.common_info?.item_id_list || []) advertisedIds.add(String(itemId));
        }
        scannedCampaigns += campaigns.length;
      }
      if (!listed.has_next_page) { scanComplete = true; break; }
      if (!campaigns.length) break;
      adOffset += campaigns.length;
    }
    const rows = items.map(item => [item.item_id, item.item_status,
      advertisedIds.has(String(item.item_id)) ? '已出現在廣告活動'
        : scanComplete ? '未出現在廣告活動；庫存與資格未確認' : '未確認：活動尚未掃完']);
    table(target, ['商品 ID', '商品狀態', '投放預覽'], rows);
    const candidates = scanComplete ? rows.filter(row => row[2].startsWith('未出現在')).length : 0;
    target.prepend(node('p', 'query-summary',
      `本頁 ${items.length} 件在架商品；已掃描 ${scannedCampaigns} 個活動。`
      + (scanComplete ? `其中 ${candidates} 件未出現在活動。` : '活動超過本次掃描範圍，不能判定未投放商品。')
      + (products.has_next_page ? ' 後面還有商品，請調整商品起始位置。' : '')));
  }, '預覽在架商品');
  container.append(panel);
  return panel;
}

function appendProductTool(container) {
  const { panel, fields, output } = toolPanel('商品列表', '讀取在架或下架商品。每頁最多 100 件。');
  const status = field(fields, '商品狀態', 'item-status', { options: [['NORMAL', '在架'], ['UNLIST', '下架']] });
  const size = field(fields, '每頁件數', 'item-size', { value: '100', min: '1', step: '1' });
  runButton(panel, output, async target => {
    const data = await api(`/api/items?status=${encodeURIComponent(status.value)}&pageSize=${encodeURIComponent(size.value)}`);
    table(target, ['商品 ID', '狀態', '更新時間'], (data.item || []).map(item => [item.item_id, item.item_status, item.update_time]));
  });
  container.append(panel);
}

function appendManualAdTool(container) {
  const { panel, fields, output } = toolPanel('沙盒單件廣告試建',
    '只支援手動選品、平台自動競價的單件商品；此模式不設定目標 ROAS。先預覽，再明確確認建立。');
  const itemId = field(fields, '商品 ID', 'manual-item-id', { type: 'text', value: '' });
  const budget = field(fields, '每日預算 TWD', 'manual-budget', { value: '85', min: '1', step: '0.01' });
  const today = todayTaipei();
  const startDate = field(fields, '開始日期', 'manual-start-date', { type: 'date', value: today });
  const previewButton = node('button', 'run-button', '預覽建立');
  const createButton = node('button', 'run-button', '確認在沙盒建立');
  previewButton.type = createButton.type = 'button';
  createButton.disabled = true;
  const actions = node('div', 'tool-actions');
  actions.append(previewButton, createButton);
  panel.append(actions, output);
  let prepared = null;
  for (const input of [itemId, budget, startDate]) {
    input.addEventListener('input', () => {
      prepared = null;
      createButton.disabled = true;
    });
  }
  previewButton.addEventListener('click', async () => {
    prepared = null;
    createButton.disabled = true;
    output.className = 'output';
    try {
      const numericId = Number(itemId.value);
      const dailyBudget = Number(budget.value);
      if (!/^\d+$/.test(itemId.value.trim()) || !Number.isSafeInteger(numericId) || numericId <= 0) {
        throw new Error('請輸入有效的商品 ID。');
      }
      if (!Number.isFinite(dailyBudget) || dailyBudget <= 0) throw new Error('每日預算必須大於 0。');
      const healthResponse = await fetch(`${BASE}/health`);
      if (!healthResponse.ok) throw new Error('本機後端未就緒。');
      const health = await healthResponse.json();
      if (health.environment !== 'sandbox') throw new Error('只允許在沙盒店鋪建立測試廣告。');
      prepared = {
        shopId: String(health.shopId), confirm: 'CREATE_SANDBOX_MANUAL_AD',
        itemId: numericId, budget: dailyBudget, startDate: dateForApi(startDate.value),
        referenceId: crypto.randomUUID(),
      };
      output.textContent = `測試店鋪 ${prepared.shopId}\n商品 ID ${numericId}\n每日預算 TWD ${dailyBudget.toFixed(2)}\n開始日期 ${startDate.value}\n競價方式：平台自動（不設定目標 ROAS）\n尚未送出建立請求。`;
      createButton.disabled = false;
    } catch (error) {
      output.className = 'output error';
      output.textContent = error.message || String(error);
    }
  });
  createButton.addEventListener('click', async () => {
    if (!prepared) return;
    if (!window.confirm(`確認在沙盒店鋪 ${prepared.shopId} 為商品 ${prepared.itemId} 建立測試廣告？`)) return;
    const request = prepared;
    prepared = null;
    createButton.disabled = true;
    output.className = 'output';
    output.textContent = '正在向 Shopee 沙盒送出建立請求…';
    let created;
    try {
      created = await api('/api/ads/manual', { method: 'POST', body: request });
    } catch (error) {
      output.className = 'output error';
      output.textContent = `建立未確認成功：${error.message || String(error)}\n請先查活動列表，避免重複送出。`;
      return;
    }
    output.textContent = `沙盒建立請求已完成。請到活動列表核對結果。\n${JSON.stringify(created.result, null, 2)}`;
    try { await loadShopOverview(); } catch { /* 建立結果不受概覽刷新影響。 */ }
  });
  container.append(panel);
}

function appendManualEditTool(container) {
  const { panel, fields, output } = toolPanel('沙盒單件廣告修改',
    '輸入活動 ID，先讀取目前設定並預覽；送出前會再次核對狀態與預算。');
  const campaignId = field(fields, '活動 ID', 'edit-campaign-id', { type: 'text', value: '' });
  const action = field(fields, '修改動作', 'edit-action', { options: [
    ['change_budget', '修改每日預算'], ['change_roas_target', '修改目標 ROAS'],
    ['pause', '暫停'], ['resume', '恢復'],
  ] });
  const value = field(fields, '新值（暫停／恢復時不用）', 'edit-value', { value: '90', min: '0', step: '0.01' });
  const previewButton = node('button', 'run-button', '讀取並預覽');
  const editButton = node('button', 'run-button', '確認在沙盒修改');
  previewButton.type = editButton.type = 'button';
  editButton.disabled = true;
  const actions = node('div', 'tool-actions');
  actions.append(previewButton, editButton);
  panel.append(actions, output);
  let prepared = null;
  for (const input of [campaignId, action, value]) {
    for (const eventName of ['input', 'change']) {
      input.addEventListener(eventName, () => { prepared = null; editButton.disabled = true; });
    }
  }
  previewButton.addEventListener('click', async () => {
    prepared = null;
    editButton.disabled = true;
    output.className = 'output';
    output.textContent = '正在讀取目前活動設定…';
    try {
      const id = Number(campaignId.value);
      if (!/^\d+$/.test(campaignId.value.trim()) || !Number.isSafeInteger(id) || id <= 0) {
        throw new Error('請輸入有效的活動 ID。');
      }
      const healthResponse = await fetch(`${BASE}/health`);
      if (!healthResponse.ok) throw new Error('本機後端未就緒。');
      const health = await healthResponse.json();
      if (health.environment !== 'sandbox') throw new Error('只允許修改沙盒活動。');
      const settings = await api(`/api/ads/settings?ids=${id}`);
      const campaign = (settings.campaign_list || []).find(item => Number(item.campaign_id) === id);
      if (!campaign || campaign.common_info?.ad_type !== 'manual') {
        throw new Error('找不到這個手動選品廣告。');
      }
      const current = campaign.common_info;
      if (action.value === 'change_roas_target' && current.bidding_method === 'auto') {
        throw new Error('這個活動使用 auto 競價，蝦皮不允許直接修改目標 ROAS。');
      }
      if ((action.value === 'pause' && current.campaign_status !== 'ongoing')
        || (action.value === 'resume' && current.campaign_status !== 'paused')) {
        throw new Error('目前活動狀態不適合這個動作，請改選其他操作。');
      }
      const numericValue = Number(value.value);
      if (action.value === 'change_budget' && (value.value.trim() === '' || !Number.isFinite(numericValue) || numericValue <= 0)) {
        throw new Error('新預算必須大於 0。');
      }
      if (action.value === 'change_roas_target' && (value.value.trim() === '' || !Number.isFinite(numericValue) || numericValue < 0)) {
        throw new Error('目標 ROAS 必須是非負數。');
      }
      prepared = {
        shopId: String(health.shopId), confirm: 'EDIT_SANDBOX_MANUAL_AD',
        campaignId: id, action: action.value,
        expectedStatus: current.campaign_status, expectedBudget: current.campaign_budget,
        expectedRoasTarget: campaign.auto_bidding_info?.roas_target ?? 0,
        ...(action.value === 'change_budget' ? { budget: numericValue } : {}),
        ...(action.value === 'change_roas_target' ? { roasTarget: numericValue } : {}),
        referenceId: crypto.randomUUID(),
      };
      output.textContent = `測試店鋪 ${prepared.shopId}\n活動 ${id} · ${current.ad_name ?? ''}\n目前狀態 ${current.campaign_status}\n競價方式 ${current.bidding_method ?? '—'}\n目前預算 TWD ${current.campaign_budget}\n目前目標 ROAS ${campaign.auto_bidding_info?.roas_target ?? '—'}\n修改動作 ${action.selectedOptions[0].textContent}${['change_budget', 'change_roas_target'].includes(action.value) ? ` · 新值 ${numericValue}` : ''}\n尚未送出修改請求。`;
      editButton.disabled = false;
    } catch (error) {
      output.className = 'output error';
      output.textContent = error.message || String(error);
    }
  });
  editButton.addEventListener('click', async () => {
    if (!prepared) return;
    if (!window.confirm(`確認在沙盒店鋪 ${prepared.shopId} 修改活動 ${prepared.campaignId}？`)) return;
    const request = prepared;
    prepared = null;
    editButton.disabled = true;
    output.className = 'output';
    output.textContent = '正在向 Shopee 沙盒送出修改請求…';
    let edited;
    try {
      edited = await api('/api/ads/manual/edit', { method: 'POST', body: request });
    } catch (error) {
      output.className = 'output error';
      output.textContent = `修改未確認成功：${error.message || String(error)}\n請重新讀取設定，避免重複送出。`;
      return;
    }
    output.textContent = `沙盒已接收修改請求，正在讀回確認活動 ${request.campaignId}…`;
    try {
      const settings = await api(`/api/ads/settings?ids=${request.campaignId}`);
      const campaign = (settings.campaign_list || []).find(item => Number(item.campaign_id) === request.campaignId);
      output.textContent = `沙盒修改請求已完成並讀回。\n活動 ${request.campaignId}\n目前狀態 ${campaign?.common_info?.campaign_status ?? '待確認'}\n目前預算 TWD ${campaign?.common_info?.campaign_budget ?? '待確認'}\n目前目標 ROAS ${campaign?.auto_bidding_info?.roas_target ?? '待確認'}\nAPI 回應：${JSON.stringify(edited.result)}`;
    } catch (error) {
      output.textContent = `沙盒已接收修改請求，但讀回暫時失敗：${error.message || String(error)}\n請稍後重新讀取活動設定，避免重複送出。`;
    }
    try { await loadShopOverview(); } catch { /* 修改結果不受概覽刷新影響。 */ }
  });
  container.append(panel);
}

function appendBatchBudgetTool(container) {
  const { panel, fields, output } = toolPanel('沙盒批量修改每日預算',
    '輸入最多 10 個手動選品活動 ID。先預覽目前預算，再逐個修改、逐個讀回；出錯即停止。執行期間請保持控制台開啟。');
  const idsInput = field(fields, '活動 ID（逗號或空格分隔）', 'batch-budget-ids', { type: 'text' });
  const budgetInput = field(fields, '新的每日預算 TWD', 'batch-budget-value', { value: '85', min: '1', step: '0.01' });
  const previewButton = node('button', 'run-button', '預覽批量修改');
  const executeButton = node('button', 'run-button', '確認批量修改');
  const stopButton = node('button', 'run-button', '完成目前活動後停止');
  const logButton = node('button', 'run-button', '查看上次執行記錄');
  for (const button of [previewButton, executeButton, stopButton, logButton]) button.type = 'button';
  executeButton.disabled = true;
  stopButton.disabled = true;
  const actions = node('div', 'tool-actions');
  actions.append(previewButton, executeButton, stopButton, logButton);
  panel.append(actions, output);
  let prepared = null;
  let stopRequested = false;
  for (const input of [idsInput, budgetInput]) {
    input.addEventListener('input', () => { prepared = null; executeButton.disabled = true; });
  }
  previewButton.addEventListener('click', async () => {
    prepared = null;
    executeButton.disabled = true;
    previewButton.disabled = true;
    output.className = 'output';
    output.textContent = '正在讀取活動目前設定…';
    try {
      const ids = [...new Set(idsInput.value.split(/[\s,，]+/).filter(Boolean))];
      if (!ids.length || ids.length > 10 || ids.some(id => !/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
        throw new Error('請輸入 1–10 個有效的數字活動 ID。');
      }
      const targetBudget = Number(budgetInput.value);
      if (budgetInput.value.trim() === '' || !Number.isFinite(targetBudget) || targetBudget <= 0) {
        throw new Error('新預算必須大於 0。');
      }
      const healthResponse = await fetch(`${BASE}/health`);
      if (!healthResponse.ok) throw new Error('本機後端未就緒。');
      const health = await healthResponse.json();
      if (health.environment !== 'sandbox') throw new Error('只允許修改沙盒活動。');
      const settings = await api(`/api/ads/settings?ids=${encodeURIComponent(ids.join(','))}`);
      if (String(settings.shop_id) !== String(health.shopId)) {
        throw new Error('活動設定的店鋪與目前沙盒店鋪不一致。');
      }
      const byId = new Map((settings.campaign_list || []).map(item => [String(item.campaign_id), item]));
      const rows = [];
      const requests = [];
      for (const id of ids) {
        const campaign = byId.get(id);
        const info = campaign?.common_info;
        if (!info || info.ad_type !== 'manual' || info.campaign_status !== 'ongoing') {
          throw new Error(`活動 ${id} 不存在，或不是進行中的手動選品廣告。`);
        }
        const currentBudget = Number(info.campaign_budget);
        if (!Number.isFinite(currentBudget) || currentBudget <= 0) {
          throw new Error(`活動 ${id} 的目前預算無法確認。`);
        }
        rows.push([id, info.ad_name, currentBudget, targetBudget,
          currentBudget === targetBudget ? '無需修改' : '等待確認']);
        if (currentBudget !== targetBudget) requests.push({
          shopId: String(health.shopId), confirm: 'EDIT_SANDBOX_MANUAL_AD',
          campaignId: Number(id), action: 'change_budget', budget: targetBudget,
          expectedStatus: info.campaign_status, expectedBudget: currentBudget,
          expectedRoasTarget: campaign.auto_bidding_info?.roas_target ?? 0,
          referenceId: crypto.randomUUID(),
        });
      }
      const summary = node('p', 'query-summary',
        `沙盒店鋪 ${health.shopId}；${ids.length} 個活動，其中 ${requests.length} 個預算會變更。尚未送出修改請求。`);
      table(output, ['活動 ID', '名稱', '目前預算 TWD', '新預算 TWD', '結果'], rows);
      output.prepend(summary);
      prepared = { shopId: String(health.shopId), targetBudget, requests };
      executeButton.disabled = requests.length === 0;
    } catch (error) {
      output.className = 'output error';
      output.textContent = error.message || String(error);
    } finally { previewButton.disabled = false; }
  });
  executeButton.addEventListener('click', async () => {
    if (!prepared?.requests.length) return;
    if (!window.confirm(`確認在沙盒店鋪 ${prepared.shopId} 修改 ${prepared.requests.length} 個廣告活動的每日預算為 TWD ${prepared.targetBudget}？`)) return;
    const batch = prepared;
    prepared = null;
    executeButton.disabled = true;
    previewButton.disabled = true;
    stopButton.disabled = false;
    stopRequested = false;
    const run = {
      startedAt: new Date().toISOString(), shopId: batch.shopId, targetBudget: batch.targetBudget,
      entries: batch.requests.map(request => ({ campaignId: request.campaignId,
        previousBudget: request.expectedBudget, targetBudget: request.budget,
        referenceId: request.referenceId, status: 'pending' })),
    };
    const persist = () => chrome.storage.local.set({ lastBatchBudgetRun: run });
    const showProgress = () => {
      output.textContent = `沙盒批量預算修改：${run.entries.filter(entry => entry.status === 'verified').length}／${run.entries.length} 已讀回確認。\n`
        + run.entries.map(entry => `活動 ${entry.campaignId}: ${entry.status}${entry.message ? ` · ${entry.message}` : ''}`).join('\n');
    };
    try {
      await persist();
      for (let index = 0; index < batch.requests.length; index++) {
        if (stopRequested) break;
        const request = batch.requests[index];
        const entry = run.entries[index];
        entry.status = 'sending';
        await persist();
        showProgress();
        try {
          await api('/api/ads/manual/edit', { method: 'POST', body: request });
          entry.status = 'accepted';
          await persist();
          const settings = await api(`/api/ads/settings?ids=${request.campaignId}`);
          const campaign = (settings.campaign_list || []).find(item => Number(item.campaign_id) === request.campaignId);
          if (Number(campaign?.common_info?.campaign_budget) !== request.budget) {
            throw new Error('讀回的預算與目標不一致，請人工核對。');
          }
          entry.status = 'verified';
        } catch (error) {
          entry.status = 'needs_review';
          entry.message = error.message || String(error);
          stopRequested = true;
        }
        await persist();
        showProgress();
        if (!stopRequested && index < batch.requests.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      for (const entry of run.entries) {
        if (entry.status === 'pending') entry.status = 'not_sent';
      }
      run.finishedAt = new Date().toISOString();
      await persist();
      showProgress();
    } catch (error) {
      output.className = 'output error';
      output.textContent = `批量任務已停止：${error.message || String(error)}\n請先核對活動設定與上次執行記錄，避免重複送出。`;
    } finally {
      stopButton.disabled = true;
      previewButton.disabled = false;
      stopRequested = false;
    }
  });
  stopButton.addEventListener('click', () => { stopRequested = true; stopButton.disabled = true; });
  logButton.addEventListener('click', async () => {
    const { lastBatchBudgetRun } = await chrome.storage.local.get('lastBatchBudgetRun');
    output.textContent = lastBatchBudgetRun
      ? `上次批量記錄（${lastBatchBudgetRun.startedAt}）：\n` + lastBatchBudgetRun.entries.map(entry =>
        `活動 ${entry.campaignId}: ${entry.previousBudget} → ${entry.targetBudget} · ${entry.status}${entry.message ? ` · ${entry.message}` : ''}`).join('\n')
      : '尚無批量預算修改記錄。';
  });
  container.append(panel);
}

function appendManualEditTools(container) {
  appendManualEditTool(container);
  appendBatchBudgetTool(container);
}

function appendPerformanceTool(container) {
  const { panel, fields, output } = toolPanel('廣告績效', '查指定活動的每日或每小時曝光、點擊、花費與 ROAS。每次最多 100 個活動 ID。');
  const ids = field(fields, '活動 ID（逗號分隔）', 'campaign-ids', { type: 'text', value: '' });
  const mode = field(fields, '統計方式', 'perf-mode', { options: [['daily', '每日'], ['hourly', '每小時']] });
  const today = todayTaipei();
  const start = field(fields, '開始日期', 'perf-start', { type: 'date', value: today });
  const end = field(fields, '結束日期', 'perf-end', { type: 'date', value: today });
  runButton(panel, output, async target => {
    const list = ids.value.split(/[\s,，]+/).filter(Boolean);
    if (!list.length || list.length > 100 || list.some(id => !/^\d+$/.test(id))) {
      throw new Error('請輸入 1–100 個數字活動 ID。');
    }
    const joined = encodeURIComponent(list.join(','));
    const path = mode.value === 'daily'
      ? `/api/ads/daily?ids=${joined}&startDate=${dateForApi(start.value)}&endDate=${dateForApi(end.value)}`
      : `/api/ads/hourly?ids=${joined}&date=${dateForApi(start.value)}`;
    const data = await api(path);
    const rows = [];
    for (const campaign of data.campaign_list || []) {
      for (const metric of campaign.metrics_list || []) {
        rows.push([campaign.campaign_id, mode.value === 'hourly' ? `${metric.date} ${metric.hour}:00` : metric.date,
          metric.impression, metric.clicks, metric.cpc, metric.expense, metric.broad_roi]);
      }
    }
    table(target, ['活動 ID', '日期／時段', '曝光', '點擊', 'CPC', '花費', 'ROAS'], rows);
  });
  container.append(panel);
}

function appendFilterTool(container) {
  const { panel, fields, output } = toolPanel('沙盒廣告篩選與匯出',
    '逐頁讀取廣告與指定日期的每日績效，最多 10 頁／1000 個活動；只篩選和匯出，不會更改廣告。所有條件同時符合才會顯示。');
  const offset = field(fields, '活動起始位置', 'filter-offset', { value: '0', min: '0', step: '1' });
  const limit = field(fields, '每頁活動上限', 'filter-limit', { value: '100', min: '1', step: '1' });
  const maxPages = field(fields, '最多讀取頁數（1–10）', 'filter-pages', { value: '10', min: '1', step: '1' });
  const today = todayTaipei();
  const start = field(fields, '開始日期', 'filter-start', { type: 'date', value: today });
  const end = field(fields, '結束日期', 'filter-end', { type: 'date', value: today });
  const status = field(fields, '活動狀態', 'filter-status', { options: [
    ['', '全部'], ['ongoing', '進行中'], ['paused', '已暫停'],
  ] });
  const itemId = field(fields, '指定商品 ID（可留空）', 'filter-item-id', { type: 'text' });
  const minClicks = field(fields, '最少點擊（可留空）', 'filter-clicks', { value: '', min: '0', step: '1' });
  const maxCpc = field(fields, '最高 CPC TWD（可留空）', 'filter-cpc', { value: '', min: '0', step: '0.01' });
  const minRoi = field(fields, '最低 ROAS（可留空）', 'filter-roi', { value: '', min: '0', step: '0.01' });
  const minSpend = field(fields, '最少花費 TWD（可留空）', 'filter-spend', { value: '', min: '0', step: '0.01' });
  const exportButton = node('button', 'run-button', '匯出完整掃描結果 CSV');
  exportButton.type = 'button';
  exportButton.disabled = true;
  let exportRows = null;
  const inputs = [offset, limit, maxPages, start, end, status, itemId, minClicks, maxCpc, minRoi, minSpend];
  for (const input of inputs) {
    for (const eventName of ['input', 'change']) {
      input.addEventListener(eventName, () => { exportRows = null; exportButton.disabled = true; });
    }
  }
  const optionalNumber = (input, label) => {
    if (input.value.trim() === '') return null;
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${label} 必須是非負數。`);
    return value;
  };
  const columns = ['活動 ID', '名稱', '狀態', '商品 ID', '預算 TWD', '目標 ROAS',
    '曝光', '點擊', 'CPC TWD', '花費 TWD', 'ROAS'];
  runButton(panel, output, async target => {
    exportRows = null;
    exportButton.disabled = true;
    const pageOffset = Number(offset.value);
    const pageLimit = Number(limit.value);
    if (!Number.isSafeInteger(pageOffset) || pageOffset < 0
      || !Number.isSafeInteger(pageLimit) || pageLimit < 1 || pageLimit > 100) {
      throw new Error('起始位置須為非負整數，本頁上限須為 1–100。');
    }
    if (start.value > end.value) throw new Error('結束日期不能早於開始日期。');
    const productId = itemId.value.trim();
    if (productId && !/^\d+$/.test(productId)) throw new Error('商品 ID 只能輸入數字。');
    const clicksAtLeast = optionalNumber(minClicks, '最少點擊');
    const cpcAtMost = optionalNumber(maxCpc, '最高 CPC');
    const roiAtLeast = optionalNumber(minRoi, '最低 ROAS');
    const spendAtLeast = optionalNumber(minSpend, '最少花費');
    const rows = [];
    const scan = await scanCampaignPages({
      startOffset: pageOffset, pageSize: pageLimit, maxPages: Number(maxPages.value),
      fetchPage: ({ offset: nextOffset, limit: nextLimit }) => api(`/api/ads?limit=${nextLimit}&offset=${nextOffset}`),
      onPage: async (campaigns, { page }) => {
        target.textContent = `正在讀取第 ${page} 頁；已檢查 ${rows.length} 個符合條件的活動…`;
        if (!campaigns.length) return;
        const ids = campaigns.map(item => String(item.campaign_id));
        const joined = encodeURIComponent(ids.join(','));
        const [settings, performance] = await Promise.all([
          api(`/api/ads/settings?ids=${joined}`),
          api(`/api/ads/daily?ids=${joined}&startDate=${dateForApi(start.value)}&endDate=${dateForApi(end.value)}`),
        ]);
        const byId = new Map((settings.campaign_list || []).map(item => [String(item.campaign_id), item]));
        if (ids.some(id => !byId.get(id)?.common_info)) {
          throw new Error('有活動設定未回傳，已停止篩選；請重新查詢。');
        }
        const metricsById = new Map((performance.campaign_list || []).map(item => [String(item.campaign_id), item.metrics_list || []]));
        for (const listedCampaign of campaigns) {
          const id = String(listedCampaign.campaign_id);
          const info = byId.get(id).common_info;
          const productIds = (info.item_id_list || []).map(String);
          const metrics = metricsById.get(id) || [];
          const impressions = metrics.reduce((sum, metric) => sum + Number(metric.impression || 0), 0);
          const clicks = metrics.reduce((sum, metric) => sum + Number(metric.clicks || 0), 0);
          const spend = metrics.reduce((sum, metric) => sum + Number(metric.expense || 0), 0);
          const gmv = metrics.reduce((sum, metric) => sum + Number(metric.broad_gmv || 0), 0);
          const cpc = clicks > 0 ? spend / clicks : null;
          const roi = spend > 0 ? gmv / spend : null;
          if (status.value && info.campaign_status !== status.value) continue;
          if (productId && !productIds.includes(productId)) continue;
          if (clicksAtLeast !== null && clicks < clicksAtLeast) continue;
          if (cpcAtMost !== null && (cpc === null || cpc > cpcAtMost)) continue;
          if (roiAtLeast !== null && (roi === null || roi < roiAtLeast)) continue;
          if (spendAtLeast !== null && spend < spendAtLeast) continue;
          rows.push([id, info.ad_name, info.campaign_status, productIds.join('、'),
            info.campaign_budget, byId.get(id)?.auto_bidding_info?.roas_target,
            impressions, clicks, cpc === null ? null : cpc.toFixed(2), spend.toFixed(2),
            roi === null ? null : roi.toFixed(2)]);
        }
      },
    });
    table(target, columns, rows);
    target.prepend(node('p', 'query-summary', `已讀取 ${scan.pages} 頁、${scan.scanned} 個活動，符合 ${rows.length} 個。${scan.complete ? '已讀完活動清單。' : `後面還有資料；從位置 ${scan.nextOffset} 繼續掃描，完成前不提供匯出。`}`));
    exportRows = scan.complete ? rows : null;
    exportButton.disabled = !scan.complete || rows.length === 0;
  }, '篩選活動');
  exportButton.addEventListener('click', () => {
    if (!exportRows) return;
    const escapeCell = value => {
      let text = String(value ?? '');
      if (/^[=+@-]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const csv = '\uFEFF' + [columns, ...exportRows].map(row => row.map(escapeCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = node('a');
    link.href = url;
    link.download = `cf-shopee-ads-${todayTaipei()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });
  panel.append(exportButton);
  container.append(panel);
}

function appendHealthTool(container) {
  const { panel, fields, output } = toolPanel('沙盒廣告健康檢查',
    '逐頁檢查最多 10 頁／1000 個活動的設定、關聯商品狀態及指定日期績效。結果是資料檢查，不代表蝦皮違規判定。');
  const offset = field(fields, '活動起始位置', 'health-offset', { value: '0', min: '0', step: '1' });
  const limit = field(fields, '每頁活動上限', 'health-limit', { value: '100', min: '1', step: '1' });
  const maxPages = field(fields, '最多讀取頁數（1–10）', 'health-pages', { value: '10', min: '1', step: '1' });
  const date = field(fields, '績效日期', 'health-date', { type: 'date', value: todayTaipei() });
  runButton(panel, output, async target => {
    const pageOffset = Number(offset.value);
    const pageLimit = Number(limit.value);
    if (!Number.isSafeInteger(pageOffset) || pageOffset < 0
      || !Number.isSafeInteger(pageLimit) || pageLimit < 1 || pageLimit > 100) {
      throw new Error('起始位置須為非負整數，本頁上限須為 1–100。');
    }
    const day = dateForApi(date.value);
    const productsResult = (await Promise.allSettled([
      api('/api/items?status=NORMAL&status=UNLIST&status=BANNED&status=REVIEWING&pageSize=100'),
    ]))[0];
    const productById = new Map((productsResult.status === 'fulfilled'
      ? productsResult.value.item || [] : []).map(item => [String(item.item_id), item.item_status]));
    const rows = [];
    let needsReview = 0;
    let performanceUnavailable = false;
    const scan = await scanCampaignPages({
      startOffset: pageOffset, pageSize: pageLimit, maxPages: Number(maxPages.value),
      fetchPage: ({ offset: nextOffset, limit: nextLimit }) => api(`/api/ads?limit=${nextLimit}&offset=${nextOffset}`),
      onPage: async (campaigns, { page }) => {
        target.textContent = `正在檢查第 ${page} 頁；已讀取 ${rows.length} 個活動…`;
        if (!campaigns.length) return;
        const joined = encodeURIComponent(campaigns.map(item => item.campaign_id).join(','));
        const [settingsResult, performanceResult] = await Promise.allSettled([
          api(`/api/ads/settings?ids=${joined}`),
          api(`/api/ads/daily?ids=${joined}&startDate=${day}&endDate=${day}`),
        ]);
        if (settingsResult.status === 'rejected') throw settingsResult.reason;
        const settings = settingsResult.value;
        if (performanceResult.status === 'rejected') performanceUnavailable = true;
        const settingsById = new Map((settings.campaign_list || []).map(item => [String(item.campaign_id), item]));
        const metricsById = new Map((performanceResult.status === 'fulfilled'
          ? performanceResult.value.campaign_list || [] : []).map(item => [String(item.campaign_id), item.metrics_list || []]));
        for (const listedCampaign of campaigns) {
      const id = String(listedCampaign.campaign_id);
      const info = settingsById.get(id)?.common_info;
      if (!info) {
        needsReview++;
        rows.push([id, '—', '—', '—', '—', '—', '—', '設定資料未回傳，請單獨查詢']);
        continue;
      }
      const itemIds = (info.item_id_list || []).map(String);
      const itemStates = itemIds.map(itemId => `${itemId}: ${productById.get(itemId) || '未確認'}`);
      const metrics = metricsById.get(id) || [];
      const impressions = metrics.reduce((sum, metric) => sum + Number(metric.impression || 0), 0);
      const clicks = metrics.reduce((sum, metric) => sum + Number(metric.clicks || 0), 0);
      const findings = [];
      let flag = false;
      if (!itemIds.length) { findings.push('關聯商品 ID 未回傳'); flag = true; }
      if (!Number.isFinite(Number(info.campaign_budget)) || Number(info.campaign_budget) <= 0) {
        findings.push('每日預算缺失或非正數'); flag = true;
      }
      for (const itemId of itemIds) {
        const itemStatus = productById.get(itemId);
        if (itemStatus && itemStatus !== 'NORMAL') {
          findings.push(`商品 ${itemId} 狀態：${itemStatus}`);
          flag = true;
        }
      }
      if (info.campaign_status !== 'ongoing') findings.push(`活動目前 ${info.campaign_status}`);
      if (productsResult.status !== 'fulfilled' || itemIds.some(itemId => !productById.has(itemId))) {
        findings.push('部分商品狀態未確認');
      }
      if (performanceResult.status !== 'fulfilled') findings.push('績效暫時無法讀取');
      else if (info.campaign_status === 'ongoing' && !metrics.length) findings.push('當日尚無績效資料');
      else if (info.campaign_status === 'ongoing' && impressions === 0) findings.push('當日尚無曝光');
      if (flag) needsReview++;
      rows.push([id, info.ad_name, info.campaign_status, info.campaign_budget,
        itemIds.join('、'), itemStates.join('；'),
        performanceResult.status === 'fulfilled' ? `${impressions}／${clicks}` : '—',
        findings.length ? findings.join('；') : '已檢查欄位未見異常']);
        }
      },
    });
    table(target, ['活動 ID', '名稱', '狀態', '預算 TWD', '商品 ID', '商品狀態', '曝光／點擊', '檢查結果'], rows);
    target.prepend(node('p', 'query-summary',
      `已讀取 ${scan.pages} 頁、${scan.scanned} 個活動；${needsReview} 個需要核對設定或商品${scan.complete ? '。' : `；後面還有活動，請從位置 ${scan.nextOffset} 繼續。`}`));
    if (productsResult.status === 'fulfilled' && productsResult.value.has_next_page) {
      target.append(node('p', 'query-note', '商品清單只讀取前 100 件；未找到的商品狀態一律標為未確認。'));
    }
    if (performanceUnavailable || productsResult.status === 'rejected') {
      target.append(node('p', 'query-note', '部分只讀資料暫時不可用；對應欄位已標為未確認。'));
    }
  }, '開始檢查');
  container.append(panel);
}

function appendBudgetPreview(container) {
  const { panel, fields, output } = toolPanel('預算規則預覽',
    '使用下方樣本數據計算數值門檻；尚未計入時間窗、重複追加和日終動作，也不會修改廣告預算。');
  const inputs = {};
  const defs = [
    ['dailyBudget', '目前每日預算 TWD', 85], ['spend', '目前花費 TWD', 60],
    ['clicks', '點擊數', 10], ['roi', '目前 ROAS', 3],
    ['gap', '剩餘預算觸發上限 TWD', 30], ['add', '追加預算 TWD', 50],
    ['cap', '每日預算上限 TWD', 200], ['cpc', 'CPC 上限 TWD（0 不限制）', 0],
    ['minRoi', '最低 ROAS（0 不限制）', 0], ['delay', '延遲分鐘', 2],
  ];
  for (const [id, label, value] of defs) inputs[id] = field(fields, label, `budget-${id}`, { value: String(value), min: '0', step: '0.01' });
  runButton(panel, output, target => {
    const get = id => Number(inputs[id].value);
    const result = evaluateBudgetTopup({
      rule: { gap_range: { max: get('gap') }, add_amount_twd: get('add'), max_budget_twd: get('cap'),
        cpc_limit: get('cpc'), min_roi: get('minRoi'), delay_min: get('delay') },
      metrics: { dailyBudgetTwd: get('dailyBudget'), spendTwd: get('spend'), click: get('clicks'), roi: get('roi') },
    });
    target.textContent = result.eligible
      ? `符合條件。預計由 TWD ${get('dailyBudget').toFixed(2)} 調整為 TWD ${result.targetBudgetTwd.toFixed(2)}，增加 TWD ${result.actualIncreaseTwd.toFixed(2)}；延遲 ${result.delayMinutes} 分鐘。`
      : `目前不符合追加條件：${result.reason}。剩餘預算 TWD ${(result.gapTwd ?? 0).toFixed(2)}。`;
  }, '預覽規則');
  container.append(panel);
  return { inputs, output, button: panel.querySelector('button.run-button') };
}

function appendCalculator(container) {
  const { panel, fields, output } = toolPanel('利潤計算器', '本地計算，不需要連接後端。費率和匯率可自行調整。');
  const inputs = {};
  const labels = {
    sellPrice: '售價 TWD', purchasePrice: '採購價 CNY', weight: '重量 kg',
    platformFee: '平台費 %', serviceFee: '服務費 %', twToCnyRate: 'TWD／CNY 匯率',
    cnyToTwRate: 'CNY／TWD 匯率', labelFee: '貼標費 CNY', shippingFee: '每 kg 運費 CNY',
    deliveryFee: '配送費 TWD', domesticShipping: '境內運費 CNY',
    freeShipping: '免運補貼 TWD', otherFee: '其他費 CNY',
  };
  for (const [key, label] of Object.entries(labels)) {
    inputs[key] = field(fields, label, `calc-${key}`, {
      value: String({ sellPrice: 460, purchasePrice: 40, weight: 0.5, ...DEFAULT_CALCULATOR_SETTINGS }[key]),
      min: '0', step: '0.01',
    });
  }
  const readValues = () => Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, Number(input.value)]));
  let editedBeforeLoad = false;
  void chrome.storage.local.get('calculatorSettings').then(({ calculatorSettings }) => {
    if (editedBeforeLoad) return;
    for (const [key, input] of Object.entries(inputs)) {
      const saved = calculatorSettings?.[key];
      if (typeof saved === 'number' && Number.isFinite(saved) && saved >= 0) input.value = String(saved);
    }
  }).catch(error => { output.textContent = `計算設定暫時無法載入：${error.message || String(error)}`; });
  for (const input of Object.values(inputs)) {
    input.addEventListener('input', () => { editedBeforeLoad = true; });
    input.addEventListener('change', () => {
      editedBeforeLoad = true;
      void chrome.storage.local.set({ calculatorSettings: readValues() }).catch(error => {
        output.textContent += `\n計算設定無法保存：${error.message || String(error)}`;
      });
    });
  }
  runButton(panel, output, target => {
    const values = readValues();
    const result = calculateProfit(values);
    void chrome.storage.local.set({ calculatorSettings: values }).catch(error => {
      target.textContent += `\n計算設定無法保存：${error.message || String(error)}`;
    });
    target.textContent = `到手 CNY ${result.rmbValue.toFixed(2)}｜總成本 CNY ${result.totalCost.toFixed(2)}｜利潤 CNY ${result.profit.toFixed(2)}\n利潤率 ${result.profitRate == null ? '—' : result.profitRate.toFixed(2) + '%'}｜ROI ${result.roi == null ? '—' : result.roi.toFixed(2)}`;
  }, '計算');
  container.append(panel);
}

const tools = {
  campaigns: appendCampaignTool,
  products: appendProductTool,
  'manual-ad': appendManualAdTool,
  'manual-edit': appendManualEditTools,
  'ad-filter': appendFilterTool,
  'ad-health': appendHealthTool,
  'budget-preview': appendBudgetPreview,
  calculator: appendCalculator,
};

function previewInput(parent, label, value, { type = 'number', unit = '' } = {}) {
  const wrapper = node('label', 'preview-field', label);
  const input = node('input');
  input.type = type;
  input.value = value;
  if (type === 'number') input.min = '0';
  wrapper.append(input);
  if (unit) wrapper.append(node('span', 'field-unit', unit));
  parent.append(wrapper);
}

function previewTextarea(parent, label, placeholder) {
  const wrapper = node('label', 'preview-field wide', label);
  const textarea = node('textarea');
  textarea.placeholder = placeholder;
  wrapper.append(textarea);
  parent.append(wrapper);
}

function previewSelect(parent, label, options) {
  const wrapper = node('label', 'preview-field', label);
  const select = node('select');
  for (const text of options) select.append(node('option', '', text));
  wrapper.append(select);
  parent.append(wrapper);
}

function previewCheckbox(parent, label) {
  const wrapper = node('label', 'preview-check');
  const input = node('input');
  input.type = 'checkbox';
  wrapper.append(input, node('span', '', label));
  parent.append(wrapper);
}

function previewTask(parent, title, description, buttonLabel) {
  const card = node('div', 'task-option');
  card.append(node('strong', '', title), node('p', '', description));
  const button = node('button', 'disabled-task', buttonLabel);
  button.type = 'button';
  button.disabled = true;
  card.append(button);
  parent.append(card);
}

function appendLegacyPreview(featureId, setup, execution) {
  const form = node('div', 'preview-grid');
  const tasks = node('div', 'task-grid');
  if (featureId === 'ads-reopen') {
    previewInput(form, '手動 ROI · 每日預算', '85', { unit: 'TWD' });
    previewInput(form, '手動 ROI · 目標 ROI', '30');
    previewCheckbox(form, '手動 ROI · 加速推廣');
    previewSelect(form, '手動 ROI · 操作模式', ['指定商品', '排除商品']);
    previewSelect(form, '手動 ROI · 重開時間', ['立即重開', '延遲重開']);
    previewTextarea(form, '手動 ROI · 商品 ID', '逗號、空格或換行分隔');
    previewTask(tasks, '手動 ROI 重開', '原版會刪除後重建活動。', '重開廣告');
    previewInput(form, '系統 ROI · 每日預算', '85', { unit: 'TWD' });
    previewSelect(form, '系統 ROI · 操作模式', ['指定商品', '排除商品']);
    previewSelect(form, '系統 ROI · 重開時間', ['立即重開', '延遲重開']);
    previewTextarea(form, '系統 ROI · 商品 ID', '逗號、空格或換行分隔');
    previewTask(tasks, '系統 ROI 重開', '原版會刪除後重建活動。', '重開廣告');
  } else if (featureId === 'ads-filter') {
    previewSelect(form, '日期範圍', ['今天', '昨天', '最近 7 天', '自訂日期']);
    previewSelect(form, '廣告狀態', ['僅進行中', '全部狀態']);
    previewInput(form, '瀏覽量低於', '10');
    previewInput(form, '點擊量低於', '1');
    previewInput(form, 'CPC 閾值', '5', { unit: 'TWD' });
    previewInput(form, 'ROI 閾值', '3');
    previewInput(form, '目標 ROI 閾值', '30');
    previewInput(form, '花費成本閾值', '85', { unit: 'TWD' });
    previewSelect(form, '加速推廣狀態', ['不限', '已啟用', '未啟用']);
    previewSelect(form, '匹配方式', ['任一條件', '全部條件']);
    previewTextarea(form, '僅查詢商品 ID', '逗號、空格或換行分隔');
    previewTextarea(form, '排除商品 ID', '逗號、空格或換行分隔');
    previewTask(tasks, '批量篩選與處理', '原版含預覽、匯出及確認刪除。下方只讀工具已接入部分條件。', '確認刪除');
  } else if (featureId === 'ads-health') {
    previewSelect(form, '狀態過濾', ['僅進行中', '全部狀態']);
    previewTask(tasks, '廣告健康檢查', '原版會分頁掃描全部活動並標記異常。下方只讀工具目前最多檢查 10 頁。', '全店檢查');
  } else if (featureId === 'products-title') {
    previewTextarea(form, '商品 ID 列表（可選）', '逗號、空格或換行分隔');
    previewInput(form, '搜尋關鍵詞', '', { type: 'text' });
    previewTask(tasks, '選擇商品與推薦熱詞', '原版可檢索熱詞並選擇待改商品。', '選擇商品');
    previewTask(tasks, '修改標題', '原版可批量改標題，並可處理關聯廣告。', '修改標題');
  } else if (featureId === 'budget-rules') {
    previewSelect(form, '活動狀態', ['僅進行中', '全部狀態']);
    previewTextarea(form, '商品 ID（多 ID）', '逗號、空格或換行分隔');
    previewInput(form, '追加金額', '20', { unit: 'TWD' });
    previewInput(form, '最高預算上限', '200', { unit: 'TWD' });
    previewInput(form, '延遲執行', '2', { unit: '分鐘' });
    previewInput(form, '查詢頻率', '2', { unit: '分鐘' });
    previewInput(form, '單點花費上限', '5', { unit: 'TWD' });
    previewInput(form, '最低投產比', '2');
    previewCheckbox(form, '符合條件時可重複追加');
    previewInput(form, '預算預留空間', '50-200', { type: 'text' });
    previewInput(form, '23:55 還原的預算', '40', { unit: 'TWD' });
    previewCheckbox(form, '23:55 暫停廣告');
    previewCheckbox(form, '23:55 調整 ROI');
    previewInput(form, '次日恢復時間', '00:30', { type: 'time' });
    previewInput(form, 'ROI 還原時間', '00:30', { type: 'time' });
    previewCheckbox(form, '按時段調整 ROI');
    previewCheckbox(form, '全天追加預算');
    previewTask(tasks, '預算水位線排程', '原版可新增多規則、啟停排程並查看執行日誌。', '啟動自動追加');
  } else if (featureId === 'shipping-days') {
    previewSelect(form, '備貨天數', ['現貨 1 天', '預售 3–15 天']);
    previewSelect(form, '更新範圍', ['全部在架商品', '指定商品', '依銷量篩選']);
    previewTextarea(form, '排除商品 ID', '逗號、空格或換行分隔');
    previewCheckbox(form, '同時調整物流渠道');
    previewTask(tasks, '手動更新備貨天數', '原版可直接執行或設定定時任務。', '手動更新');
    previewTask(tasks, '定時更新備貨天數', '原版可設定任務頻率與生效時間。', '設定定時');
  } else if (featureId === 'shipping-channels') {
    previewSelect(form, '物流渠道操作', ['啟用', '停用', '調整渠道']);
    previewTextarea(form, '商品 ID', '逗號、空格或換行分隔');
    previewTask(tasks, '批量設定物流渠道', '依所選商品與渠道執行。', '執行設定');
  } else if (featureId === 'shipping-stock') {
    previewTask(tasks, '查詢現貨／預售', '原版統計較長備貨商品，並可複製現貨和預售 ID。', '開始查詢');
  } else if (featureId === 'shipping-next') {
    previewInput(form, '隔日到貨開通比例', '10', { unit: '%' });
    previewTask(tasks, '批量開啟隔日到貨', '原版優先選擇零銷量在架商品。', '開始執行');
    previewTask(tasks, '恢復本次變更', '關閉本次渠道並還原備貨天數。', '恢復');
  } else if (featureId === 'shipping-gift') {
    previewInput(form, '統一備貨天數', '7');
    previewTextarea(form, '贈品商品 ID', '每行一個或以逗號分隔');
    previewTask(tasks, '贈品與 SKU 聯動', '原版可選既有活動並同步商品備貨與物流。', '執行聯動');
  } else if (featureId === 'marketing-bundle') {
    previewSelect(form, '商品範圍', ['全店在售商品', '手動輸入商品 ID']);
    previewInput(form, '滿件數', '5');
    previewInput(form, '減免金額', '5', { unit: 'TWD' });
    previewInput(form, '單買家購買限制', '1');
    previewTextarea(form, '商品 ID', '一行一個');
    previewTask(tasks, '批量開促銷組合', '先核對商品資格和活動時間。', '開始批量建立');
  } else if (featureId === 'marketing-discount') {
    previewSelect(form, '商品範圍', ['全店在售商品', '手動輸入商品 ID']);
    previewInput(form, '折扣（折）', '9');
    previewTextarea(form, '商品 ID', '一行一個');
    previewTask(tasks, '批量開折扣活動', '先核對活動衝突與商品資格。', '開始批量建立');
  } else if (featureId === 'marketing-gift') {
    previewInput(form, '統一備貨天數', '7');
    previewTextarea(form, '贈品商品 ID', '一行一個或以逗號分隔');
    previewTask(tasks, '一鍵建立滿額贈', '原版可建立滿額贈活動。', '建立活動');
    previewTask(tasks, '修改已有滿額贈', '原版可選既有活動修改商品天數。', '選擇活動');
  } else if (featureId === 'flash-renew') {
    previewTask(tasks, '限時特賣續期', '原版到期前擷取活動商品和價格，關閉舊活動並建立下一期。', '啟動續期');
  } else {
    return false;
  }
  setup.append(form);
  execution.append(tasks);
  execution.append(node('p', 'preview-warning', '操作按鈕待官方 API、權限和沙盒驗證完成後啟用。'));
  return true;
}

function workflowHeading(number, title, description) {
  const heading = node('div', 'workflow-heading');
  const text = node('div');
  text.append(node('h3', '', title), node('p', '', description));
  heading.append(node('span', 'step-number', String(number)), text);
  return heading;
}

function allShopField(labelText, id, value, help, { textarea = false, unit = '', min, max, step, wide = false } = {}) {
  const wrapper = node('div', `parameter-field${wide ? ' wide-field' : ''}`);
  const label = node('label', '', labelText);
  label.htmlFor = id;
  const inputWrap = node('div', unit ? 'input-with-unit' : '');
  const input = node(textarea ? 'textarea' : 'input');
  input.id = id;
  if (textarea) { input.rows = 3; input.placeholder = value; }
  else { input.type = 'number'; input.value = value; if (min !== undefined) input.min = min; if (max !== undefined) input.max = max; if (step !== undefined) input.step = step; }
  inputWrap.append(input);
  if (unit) inputWrap.append(node('span', '', unit));
  wrapper.append(label, inputWrap, node('p', '', help));
  return wrapper;
}

function allShopTask(title, tag, description, hint, buttonText, className, icon) {
  const card = node('article', `task-choice-card ${className}`);
  const top = node('div', 'task-choice-top');
  top.append(node('span', 'task-icon', icon), node('span', 'task-tag', tag));
  const button = node('button', 'task-primary-btn', buttonText);
  button.type = 'button';
  button.disabled = true;
  button.title = '批量建立尚未接入已驗證的官方 API';
  card.append(top, node('h4', '', title), node('p', '', description),
    node('div', 'task-parameter-hint', hint), button);
  return card;
}

function appendAllShopLayout(detail, feature) {
  const setup = node('section', 'workflow-card all-shop-setup');
  setup.append(workflowHeading(1, '設定任務參數', '帶「必填」的參數會影響建立結果，可選項可保持預設。'));
  const core = node('div', 'parameter-section');
  const coreHead = node('div', 'parameter-section-head');
  coreHead.append(node('strong', '', '核心參數'), node('small', '', '執行兩種建立任務時都會讀取'));
  const coreGrid = node('div', 'parameter-grid');
  coreGrid.append(allShopField('每日預算 · 必填', 'daily-budget', '85', '每個新廣告每天可使用的預算。', { min: '40', unit: 'TWD' }),
    allShopField('排除商品 ID · 可選', 'exclude-ids', '不想開啟廣告的商品 ID；支援逗號、空格或換行分隔', '留空不額外排除；已有廣告的商品仍會自動跳過。', { textarea: true, wide: true }));
  core.append(coreHead, coreGrid);
  const roi = node('div', 'parameter-section manual-roi-settings');
  const roiHead = node('div', 'parameter-section-head');
  roiHead.append(node('strong', '', '自訂 ROI 專用參數'), node('small', '', '只在自訂 ROI 任務中使用'));
  const roiRow = node('div', 'manual-settings-row');
  roiRow.append(allShopField('目標投入產出比 · 必填', 'target-value', '30', '原版目標 ROI 範圍為 1–50。', { min: '1', max: '50' }));
  const boost = node('label', 'switch-field');
  const boostCheck = node('input');
  boostCheck.type = 'checkbox';
  boostCheck.id = 'global-rapid-boost';
  const boostText = node('span');
  boostText.append(node('strong', '', '啟用加速推廣'), node('small', '', '僅適用於自訂 ROI；系統自動 ROI 不使用。'));
  boost.append(boostCheck, node('span', 'switch-visual'), boostText);
  roiRow.append(boost);
  roi.append(roiHead, roiRow);
  setup.append(core, roi);

  const execution = node('section', 'workflow-card all-shop-actions');
  execution.append(workflowHeading(2, '選擇要執行的任務', '兩個建立任務只需選一個執行，參數用途分別標示。'));
  const choices = node('div', 'task-choice-grid');
  const manualTask = allShopTask('全店開啟 · 自訂 ROI', '使用預算＋目標 ROI',
    '按上方目標 ROI，為未開廣告商品批量建立活動。',
    '讀取：每日預算、目標 ROI、排除 ID、加速推廣', '執行自訂 ROI', 'manual-task-card', '🎯');
  const systemTask = allShopTask('全店開啟 · 系統自動 ROI', '不使用目標 ROI',
    '由平台自動競價，為符合資格的商品建立活動。',
    '讀取：每日預算、排除 ID', '執行系統自動 ROI', 'system-task-card', '✨');
  manualTask.querySelector('button').id = 'start-process';
  systemTask.querySelector('button').id = 'start-system-roi';
  choices.append(manualTask, systemTask);
  execution.append(choices);
  const helper = node('div', 'helper-tool-card');
  const helperCopy = node('div');
  helperCopy.append(node('strong', '', '執行前想先確認範圍？'),
    node('p', '', '查詢在架商品是否已出現在廣告活動，不會修改資料。'));
  const query = node('button', 'helper-query-btn', '僅查詢商品');
  query.type = 'button';
  query.id = 'query-no-ads-products';
  helper.append(node('span', 'helper-tool-icon', '⌕'), helperCopy, query);
  const note = node('div', 'parameter-section all-shop-status');
  note.append(node('strong', '', '目前 API 對接進度'), node('p', '', feature.details));
  detail.append(setup, execution, helper, note);
  const candidatePanel = appendAllAdCandidates(detail);
  appendCampaignTool(detail);
  query.addEventListener('click', () => {
    candidatePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    candidatePanel.querySelector('.run-button')?.click();
  });
}

function appendAdGroupsLayout(detail, feature) {
  const form = node('section', 'workflow-card ad-groups-layout');
  form.append(node('p', 'group-intro', '自動取得未開廣告且有庫存的在架商品，每 30 件商品建立一個廣告群組。'));
  const row = node('div', 'group-parameter-row');
  row.append(allShopField('目標投入產出比', 'group-roi-target', '30', '廣告群組僅支援手動 ROI，原版範圍 1–50。', { min: '1', max: '50', step: '0.1' }),
    allShopField('每日預算', 'group-daily-budget', '425', '原版廣告群組每日預算最低 TWD 425。', { min: '425', unit: 'TWD', step: '1' }));
  form.append(row, allShopField('排除商品 ID（可選）', 'group-exclude-ids', '用逗號、空格或換行分隔', '不在建立範圍內的商品。', { textarea: true, wide: true }));
  form.append(node('div', 'group-info', '原版會在建立前核對 ROI、預算、優惠券估算及重疊廣告；最後一組少於 30 件也會建立。'));
  const action = node('div', 'group-action-row');
  const text = node('div');
  text.append(node('strong', '', '批量建立商品廣告群組'), node('p', '', '排除已有廣告、零庫存及手動排除的商品。'));
  const button = node('button', 'task-primary-btn', '開始執行');
  button.type = 'button';
  button.disabled = true;
  button.id = 'btn-start-ad-groups';
  button.title = '官方店鋪 GMV Max 尚未證實等同原版 30 件商品群組';
  action.append(text, button);
  form.append(action);
  const note = node('div', 'parameter-section all-shop-status');
  note.append(node('strong', '', 'API 對接進度'), node('p', '', feature.details));
  detail.append(form, note);
}

function appendCpcMonitorLayout(detail, feature) {
  const form = node('section', 'workflow-card cpc-monitor-layout');
  form.append(node('p', 'group-intro', '自動監控單點花費，超過閾值時刪除並重開廣告。'));
  const row1 = node('div', 'group-parameter-row');
  row1.append(allShopField('指定商品 ID（可選）', 'monitor-target-ids', '商品 ID；留空監控全部', '', { textarea: true }),
    allShopField('CPC 閾值', 'monitor-cpc-threshold', '5.00', '單點花費超過此值時觸發。', { min: '0.01', unit: 'TWD', step: '0.01' }));
  const row2 = node('div', 'group-parameter-row');
  const type = node('label', 'cpc-select-field', '重開類型');
  const select = node('select');
  select.id = 'monitor-roi-type';
  for (const [value, label] of [['auto', '全站推廣 · 系統自動最佳化'], ['manual', '全站推廣 · 自訂 ROI']]) {
    const option = node('option', '', label);
    option.value = value;
    select.append(option);
  }
  select.value = 'manual';
  type.append(select);
  row2.append(type, allShopField('預算', 'monitor-budget', '85', '重開後的每日預算。', { min: '20', unit: 'TWD', step: '5' }));
  const row3 = node('div', 'group-parameter-row');
  row3.append(allShopField('手動 ROI 值（僅手動模式）', 'monitor-roi-target', '3.0', '', { min: '0.1', step: '0.1' }));
  const boost = node('label', 'cpc-checkbox-field');
  const checkbox = node('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'monitor-rapid-boost';
  boost.append(checkbox, node('span', '', '重開時啟用加速推廣'));
  row3.append(boost);
  const row4 = node('div', 'group-parameter-row');
  const delay = node('label', 'cpc-select-field', '重開延時時間');
  const delaySelect = node('select');
  delaySelect.id = 'monitor-reopen-delay';
  for (const [value, label] of [['0', '立即重開'], ['10', '10 分鐘後'], ['20', '20 分鐘後'],
    ['30', '30 分鐘後'], ['60', '1 小時後'], ['120', '2 小時後'], ['180', '3 小時後']]) {
    const option = node('option', '', label);
    option.value = value;
    delaySelect.append(option);
  }
  delay.append(delaySelect, node('small', '', '原版刪除立即執行，重開可延時。'));
  row4.append(delay, node('div', 'group-info', '💡 原版監控會持續檢查花費，觸發時按設定延時重開。'));
  form.append(row1, row2, row3, row4);
  const actions = node('div', 'cpc-action-row');
  for (const label of ['開始監控', '停止監控']) {
    const button = node('button', 'task-primary-btn', label);
    button.type = 'button';
    button.disabled = true;
    button.id = label === '開始監控' ? 'btn-start-cpc-monitor' : 'btn-stop-cpc-monitor';
    button.title = 'CPC 監控排程與刪除重建尚未完成沙盒驗證';
    actions.append(button);
  }
  form.append(actions);
  const note = node('div', 'parameter-section all-shop-status');
  note.append(node('strong', '', 'API 對接進度'), node('p', '', feature.details));
  detail.append(form, note);
  appendPerformanceTool(detail);
}

function appendDeleteAdsLayout(detail, feature) {
  const form = node('section', 'workflow-card delete-ads-layout');
  const sections = [
    ['delete-exclude-ids', '排除的商品 ID（這些不刪）',
      '逗號、空格或換行分隔；按 item_id 排除', '🧹 按排除 ID 刪除',
      '刪除全部進行中的廣告，排除指定商品。', '刪除廣告'],
    ['delete-only-ids', '要刪除的商品 ID（支援多 ID）',
      '逗號、空格或換行分隔；只刪除指定商品對應的進行中廣告',
      '🗑️ 按指定 ID 刪除', '只刪除指定商品 ID 的廣告。', '按 ID 刪除'],
  ];
  for (const [id, label, placeholder, title, description, buttonText] of sections) {
    const fieldWrap = node('label', 'delete-ads-field', label);
    const textarea = node('textarea');
    textarea.id = id;
    textarea.placeholder = placeholder;
    fieldWrap.append(textarea);
    form.append(fieldWrap);
    if (id === 'delete-exclude-ids') {
      form.append(node('p', 'query-note', '原版只刪除「進行中」廣告；排除列表內的 item_id 不刪除。'));
    }
    const action = node('div', 'group-action-row');
    const info = node('div');
    info.append(node('strong', '', title), node('p', '', description));
    const button = node('button', 'task-primary-btn', buttonText);
    button.type = 'button';
    button.disabled = true;
    button.id = id === 'delete-exclude-ids' ? 'btn-delete-all' : 'btn-delete-by-ids';
    button.title = '批量刪除尚未完成預覽、逐筆確認與沙盒驗證';
    const preview = node('button', 'preview-delete-button', '只讀預覽');
    preview.type = 'button';
    const actions = node('div', 'legacy-action-buttons');
    actions.append(preview, button);
    action.append(info, actions);
    const result = node('div', 'output');
    result.hidden = true;
    preview.addEventListener('click', async () => {
      preview.disabled = true;
      result.hidden = false;
      result.className = 'output';
      result.textContent = '正在讀取活動…';
      try {
        const mode = id === 'delete-exclude-ids' ? 'exclude' : 'include';
        const ids = parseItemIds(textarea.value, { required: mode === 'include' });
        const selected = [];
        let unknown = 0;
        const scan = await scanCampaignPages({
          maxPages: 10,
          fetchPage: ({ offset, limit }) => api(`/api/ads?limit=${limit}&offset=${offset}`),
          onPage: async (campaigns, { page }) => {
            result.textContent = `正在讀取第 ${page} 頁；目前找到 ${selected.length} 個活動…`;
            if (!campaigns.length) return;
            const campaignIds = campaigns.map(item => String(item.campaign_id));
            const settings = await api(`/api/ads/settings?ids=${encodeURIComponent(campaignIds.join(','))}`);
            const byId = new Map((settings.campaign_list || []).map(item => [String(item.campaign_id), item]));
            if (campaignIds.some(campaignId => !byId.has(campaignId))) {
              throw new Error('有活動設定未回傳，無法可靠預覽刪除範圍。');
            }
            const pageResult = selectDeletionCandidates(campaignIds.map(campaignId => byId.get(campaignId)), ids, mode);
            selected.push(...pageResult.candidates);
            unknown += pageResult.unknown;
          },
        });
        table(result, ['活動 ID', '名稱', '狀態', '商品 ID'], selected.map(item => [
          item.campaignId, item.name, item.status, item.itemIds.join('、'),
        ]));
        result.prepend(node('p', 'query-summary', `只讀預覽：已掃描 ${scan.scanned} 個活動；符合條件 ${selected.length} 個；商品關聯不明 ${unknown} 個已排除。${scan.complete ? '活動清單已讀完。' : `後面仍有資料，從位置 ${scan.nextOffset} 繼續；此結果不完整。`}`));
      } catch (error) {
        result.className = 'output error';
        result.textContent = error.message || String(error);
      } finally { preview.disabled = false; }
    });
    form.append(action, result);
    if (id === 'delete-exclude-ids') form.append(node('hr', 'delete-ads-divider'));
  }
  const note = node('div', 'parameter-section all-shop-status');
  note.append(node('strong', '', 'API 對接進度'), node('p', '', feature.details));
  detail.append(form, note);
}

function legacyControl(labelText, id, { kind = 'text', value = '', placeholder = '', min, step, options, help = '' } = {}) {
  const wrapper = node('label', 'legacy-field', labelText);
  let control;
  if (kind === 'select') {
    control = node('select');
    for (const [optionValue, optionLabel] of options || []) {
      const option = node('option', '', optionLabel);
      option.value = optionValue;
      control.append(option);
    }
    control.value = value || control.options[0]?.value || '';
  } else {
    control = node(kind === 'textarea' ? 'textarea' : 'input');
    if (kind !== 'textarea') control.type = kind;
    if (kind === 'textarea') control.rows = 3;
    if (min !== undefined) control.min = min;
    if (step !== undefined) control.step = step;
    control.value = value;
    control.placeholder = placeholder;
  }
  control.id = id;
  wrapper.append(control);
  if (help) wrapper.append(node('small', '', help));
  return { wrapper, control };
}

function legacyAction(title, description, buttonText, id, tone = '') {
  const action = node('div', 'group-action-row legacy-action');
  const copy = node('div');
  copy.append(node('strong', '', title), node('p', '', description));
  const button = node('button', `task-primary-btn ${tone}`, buttonText);
  button.type = 'button';
  button.id = id;
  button.disabled = true;
  button.title = '此批量操作尚未完成官方 API 對照與沙盒驗證';
  action.append(copy, button);
  return action;
}

function legacyStatus(detail, feature) {
  const note = node('div', 'parameter-section all-shop-status');
  note.append(node('strong', '', 'API 對接進度'), node('p', '', feature.details));
  detail.append(note);
}

function appendProductBulkLayout(detail, feature) {
  const form = node('section', 'workflow-card legacy-layout');
  form.append(legacyControl('指定商品 ID（可選，多 ID）', 'product-ids', {
    kind: 'textarea', placeholder: '留空代表操作全部；逗號、空格或換行分隔',
    help: '原版留空會自動拉取商品列表。',
  }).wrapper);
  form.append(legacyControl('排除商品 ID（可選，多 ID）', 'exclude-product-ids', {
    kind: 'textarea', placeholder: '輸入不想操作的商品 ID', help: '排除列表內的商品不會被操作。',
  }).wrapper);
  const operation = legacyControl('選擇操作類型', 'product-operation-select', { kind: 'select', options: [
    ['', '請選擇要執行的操作…'], ['delete-all', '刪除全部店鋪商品'],
    ['delete-delisted', '刪除下架商品'], ['list-unlisted', '批量上架商品'],
    ['unlist-live', '批量下架商品'],
  ] });
  form.append(operation.wrapper);
  const unlist = legacyControl('下架商品總銷量上限', 'unlist-sales-max', {
    kind: 'number', value: '0', min: '0', step: '1',
    help: '原版依歷史銷量過濾待下架商品。',
  }).wrapper;
  const relist = legacyControl('本次最多上架數量（可選）', 'relist-max-count', {
    kind: 'number', min: '0', step: '1', placeholder: '留空代表全部',
    help: '原版按歷史銷量由高至低優先上架。',
  }).wrapper;
  unlist.hidden = relist.hidden = true;
  operation.control.addEventListener('change', () => {
    unlist.hidden = operation.control.value !== 'unlist-live';
    relist.hidden = operation.control.value !== 'list-unlisted';
  });
  form.append(unlist, relist,
    legacyAction('⚡ 執行批量操作', '依選擇的類型批量處理商品。', '執行操作', 'btn-execute-product-operation'));
  detail.append(form);
  legacyStatus(detail, feature);
  appendProductTool(detail);
}

function appendSpecificAdsLayout(detail, feature) {
  const form = node('section', 'workflow-card legacy-layout');
  form.append(node('h3', '', '手動 ROI（需要預算及 ROI）'));
  form.append(legacyControl('商品 ID（支援多 ID）', 'manual-ids', {
    kind: 'textarea', placeholder: '例如 123456, 234567 或每行一個',
  }).wrapper);
  const manualRow = node('div', 'group-parameter-row');
  manualRow.append(legacyControl('每日預算 TWD', 'manual-budget', { kind: 'number', value: '85', min: '40' }).wrapper,
    legacyControl('目標 ROI', 'manual-roi', { kind: 'number', min: '1', placeholder: '例如 30' }).wrapper);
  form.append(manualRow);
  const boost = node('label', 'cpc-checkbox-field');
  const boostInput = node('input');
  boostInput.id = 'manual-rapid-boost';
  boostInput.type = 'checkbox';
  boost.append(boostInput, node('span', '', '啟用加速推廣（手動 ROI 專用）'));
  form.append(boost,
    legacyAction('🧰 開啟手動 ROI 廣告', '為指定商品建立手動 ROI 廣告。', '開啟廣告', 'btn-open-manual-roi'),
    node('hr', 'delete-ads-divider'), node('h3', '', '自動 ROI（輸入商品 ID 後開啟）'));
  form.append(legacyControl('商品 ID（支援多 ID）', 'auto-ids', {
    kind: 'textarea', placeholder: '例如 123456, 234567 或每行一個',
  }).wrapper);
  form.append(legacyControl('每日預算 TWD', 'auto-budget', {
    kind: 'number', value: '85', min: '40', help: '原版系統 ROI 也需要每日預算。',
  }).wrapper);
  form.append(legacyAction('🤖 開啟系統 ROI 廣告', '為指定商品建立系統自動最佳化廣告。', '開啟廣告', 'btn-open-auto-roi', 'secondary'));
  detail.append(form);
  legacyStatus(detail, feature);
  appendManualAdTool(detail);
}

function appendRoiBudgetColumn(title, prefix) {
  const column = node('section', 'workflow-card legacy-layout');
  const isRoi = prefix === 'roi';
  column.append(node('h3', '', title));
  column.append(legacyControl(isRoi ? '目標 ROI（0 代表系統 ROI）' : '目標每日預算 TWD',
    `edit-${prefix}-target`, { kind: 'number', value: isRoi ? '' : '85', min: '0',
      step: isRoi ? '0.1' : '0.01',
      help: isRoi ? '原版以 0 表示系統 ROI，正數表示手動 ROI。CF 尚未驗證此模式切換。' : '設定廣告的每日預算。',
    }).wrapper);
  if (isRoi) {
    const boost = node('label', 'cpc-checkbox-field');
    const input = node('input');
    input.id = 'edit-roi-rapid-boost';
    input.type = 'checkbox';
    boost.append(input, node('span', '', '啟用加速推廣（僅手動 ROI）'));
    column.append(boost);
  }
  column.append(node('h4', '', '按商品 ID 排除（只改進行中）'));
  column.append(legacyControl('排除的商品 ID（這些不改）', `edit-${prefix}-exclude-ids`, {
    kind: 'textarea', placeholder: '逗號、空格或換行分隔',
  }).wrapper);
  column.append(legacyAction('✏️ 按排除 ID 修改', '排除指定商品，修改其他進行中的廣告。',
    isRoi ? '修改 ROI' : '修改預算', `btn-edit-${prefix}-all`, 'warning'));
  column.append(node('hr', 'delete-ads-divider'), node('h4', '', '按指定商品 ID 修改'));
  column.append(legacyControl('要修改的商品 ID（支援多 ID）', `edit-${prefix}-only-ids`, {
    kind: 'textarea', placeholder: '只修改這些商品對應的進行中廣告',
  }).wrapper);
  column.append(legacyAction('🎯 按指定 ID 修改', '只修改指定商品 ID 的廣告。',
    '按 ID 修改', `btn-edit-${prefix}-by-ids`, 'warning'));
  return column;
}

function appendRoiBudgetLayout(detail, feature) {
  const columns = node('div', 'roi-budget-columns');
  columns.append(appendRoiBudgetColumn('批量修改 ROI', 'roi'),
    appendRoiBudgetColumn('批量修改預算', 'budget'));
  detail.append(columns);
  legacyStatus(detail, feature);
  appendManualEditTools(detail);
}

function appendBoostLayout(detail, feature) {
  const form = node('section', 'workflow-card legacy-layout');
  form.append(node('p', 'group-intro', '批量開啟或關閉加速推廣；原版只支援手動 ROI 廣告。'));
  const mode = legacyControl('處理方式', 'rapid-boost-mode', { kind: 'select', options: [
    ['api', '自動模式：讀取全店進行中廣告'], ['manual', '手動輸入商品 ID 或廣告 ID'],
  ] });
  const manual = legacyControl('商品 ID 或廣告 ID（campaign_id）列表', 'rapid-boost-ids', {
    kind: 'textarea', placeholder: '逗號、空格或換行分隔',
    help: '原版可將商品 ID 轉為廣告 ID 後執行。',
  }).wrapper;
  manual.hidden = true;
  mode.control.addEventListener('change', () => { manual.hidden = mode.control.value !== 'manual'; });
  form.append(mode.wrapper, manual,
    legacyAction('🚀 批量開啟加速推廣', '為指定商品開啟加速推廣。', '開啟加速', 'btn-enable-rapid-boost'),
    legacyAction('🛑 批量關閉加速推廣', '為指定商品關閉加速推廣。', '關閉加速', 'btn-disable-rapid-boost', 'secondary'));
  detail.append(form);
  legacyStatus(detail, feature);
}

function legacyRadio(name, id, value, labelText, checked = false, disabled = false) {
  const label = node('label', 'legacy-radio');
  const input = node('input');
  input.type = 'radio';
  input.name = name;
  input.id = id;
  input.value = value;
  input.checked = checked;
  input.disabled = disabled;
  label.append(input, node('span', '', labelText));
  return label;
}

function legacyCheck(id, labelText) {
  const label = node('label', 'legacy-radio');
  const input = node('input');
  input.type = 'checkbox';
  input.id = id;
  label.append(input, node('span', '', labelText));
  return label;
}

function appendReopenSection(form, mode) {
  const manual = mode === 'manual';
  form.append(node('h3', '', manual ? '手動 ROI 重開' : '系統 ROI 重開'));
  const budgetRow = node('div', 'group-parameter-row');
  budgetRow.append(legacyControl('每日預算 (TWD)', `reopen-${mode}-budget`, {
    kind: 'number', value: '85', min: '40', placeholder: '例如 85',
  }).wrapper);
  if (manual) budgetRow.append(legacyControl('目標 ROI', 'reopen-manual-roi', {
    kind: 'number', min: '1', placeholder: '例如 30',
  }).wrapper);
  form.append(budgetRow);
  if (manual) form.append(legacyCheck('reopen-manual-rapid-boost', '啟用加速推廣 (Rapid Boost)'));
  else form.append(node('p', 'group-intro', '系統 ROI 不支援加速推廣。'));
  const choices = node('div', 'group-parameter-row');
  choices.append(legacyControl('操作模式', `reopen-${mode}-mode`, { kind: 'select', options: [
    ['exclude', '排除模式：排除指定商品 ID'], ['include', '指定模式：僅重開指定的商品 ID'],
  ], value: 'include' }).wrapper,
  legacyControl('重開時間', `reopen-${mode}-delay`, { kind: 'select', options: [
    ['0', '立即重開'], ['10', '10 分鐘後'], ['30', '30 分鐘後'], ['60', '1 小時後'],
  ] }).wrapper);
  form.append(choices, legacyControl('商品 ID 列表', `reopen-${mode}-ids`, {
    kind: 'textarea', placeholder: '用逗號、空格或換行分隔商品 ID',
  }).wrapper, legacyAction(manual ? '🔄 重開手動 ROI 廣告' : '⚡ 重開系統 ROI 廣告',
    manual ? '先刪除廣告，再重新建立手動 ROI 廣告。' : '先刪除廣告，再重新建立系統 ROI 廣告。',
    '重開廣告', `btn-reopen-${mode}-ads`, manual ? '' : 'secondary'));
}

function appendReopenLayout(detail, feature) {
  const form = node('section', 'workflow-card legacy-layout');
  form.append(node('p', 'group-intro', '原版流程是先刪除現有廣告，再重新建立；支援指定與排除商品 ID。'));
  appendReopenSection(form, 'manual');
  form.append(node('hr', 'delete-ads-divider'));
  appendReopenSection(form, 'auto');
  detail.append(form);
  legacyStatus(detail, feature);
}

function appendFilterMetric(form, title, prefix, operators, { range = false } = {}) {
  const group = node('div', 'legacy-metric');
  group.append(node('strong', '', title));
  const row = node('div', 'legacy-metric-row');
  const select = legacyControl('比較', `md-${prefix}-op`, { kind: 'select', options: operators });
  const value = legacyControl('數值', `md-${prefix}-val`, { kind: 'number', min: '0', step: '0.01' });
  row.append(select.wrapper, value.wrapper);
  if (range) {
    const second = legacyControl('上限', `md-${prefix}-val2`, { kind: 'number', min: '0', step: '0.01' });
    second.wrapper.hidden = true;
    select.control.addEventListener('change', () => { second.wrapper.hidden = select.control.value !== 'range'; });
    row.append(second.wrapper);
  }
  group.append(row);
  form.append(group);
}

function appendFilterLayout(detail, feature) {
  const form = node('section', 'workflow-card legacy-layout');
  form.append(node('h3', '', '按數據篩選'));
  const columns = node('div', 'legacy-filter-columns');
  const criteria = node('div', 'legacy-filter-section');
  const products = node('div', 'legacy-filter-section');
  criteria.append(node('h4', '', '日期範圍與狀態'), legacyControl('日期範圍', 'md-date-preset', {
    kind: 'select', options: [['today', '今天'], ['yesterday', '昨天'], ['last7', '過去 7 天'],
      ['last30', '過去 30 天'], ['last90', '近三個月']],
  }).wrapper, node('strong', '', '廣告狀態'));
  criteria.append(legacyRadio('md-state', 'ongoing-state', 'ongoing', '僅進行中', true),
    legacyRadio('md-state', 'all-state', 'all', '全部狀態', false, true),
    node('h4', '', '數據篩選條件'));
  const metricChecks = node('div', 'legacy-metric-grid');
  const impression = node('div', 'legacy-metric');
  impression.append(node('strong', '', '瀏覽量條件'), legacyCheck('md-no-impression', '無瀏覽量'),
    legacyCheck('md-imp-lt-en', '瀏覽量低於'),
    legacyControl('瀏覽量上限', 'md-imp-lt', { kind: 'number', min: '0', placeholder: '例如 10' }).wrapper);
  const clicks = node('div', 'legacy-metric');
  clicks.append(node('strong', '', '點擊量條件'), legacyCheck('md-no-click', '無點擊'),
    legacyCheck('md-view-noclick', '有瀏覽量但無點擊'),
    legacyControl('點擊量低於', 'md-click-lt', { kind: 'number', min: '0', placeholder: '填寫數值' }).wrapper);
  const hiddenClickToggle = node('input');
  hiddenClickToggle.type = 'checkbox';
  hiddenClickToggle.id = 'md-click-lt-en';
  hiddenClickToggle.hidden = true;
  clicks.append(hiddenClickToggle);
  metricChecks.append(impression, clicks);
  criteria.append(metricChecks);
  appendFilterMetric(criteria, '單點花費（CPC，TWD）', 'cpc', [['gt', '大於'], ['lt', '小於']]);
  appendFilterMetric(criteria, '投入產出比（ROI）', 'roi', [['gt', '大於'], ['lt', '小於']]);
  appendFilterMetric(criteria, '目標投入產出比', 'target-roi',
    [['gt', '大於'], ['lt', '小於'], ['eq', '等於'], ['range', '區間']], { range: true });
  appendFilterMetric(criteria, '花費成本（Cost，TWD）', 'cost',
    [['gt', '大於'], ['lt', '小於'], ['range', '區間']], { range: true });
  criteria.append(legacyControl('加速推廣狀態', 'md-rapid-boost-filter', { kind: 'select', options: [
    ['all', '全部'], ['enabled', '已加速'], ['disabled', '未加速'],
  ] }).wrapper, node('strong', '', '匹配方式'),
  legacyRadio('md-match', 'any-match', 'any', '任一條件滿足即匹配', true),
  legacyRadio('md-match', 'all-match', 'all', '全部條件滿足才匹配'));
  products.append(node('h4', '', '商品 ID 過濾'),
    legacyControl('僅查詢這些 ID 的商品', 'md-only-ids', {
      kind: 'textarea', placeholder: '空格、逗號或換行分隔',
    }).wrapper,
    legacyControl('排除這些 ID', 'md-exclude-ids', {
      kind: 'textarea', placeholder: '空格、逗號或換行分隔',
    }).wrapper);
  const actions = node('div', 'legacy-filter-actions');
  for (const [id, label] of [
    ['btn-start-query-ads', '查詢廣告'], ['btn-preview-metric-delete', '預覽結果'],
    ['btn-download-product-performance', '下載表格'], ['btn-confirm-delete', '確認刪除'],
    ['btn-download-matched-results', '下載結果'],
  ]) {
    const button = node('button', 'task-primary-btn', label);
    button.type = 'button'; button.id = id; button.disabled = true;
    actions.append(button);
  }
  products.append(actions);
  const result = node('div', 'legacy-filter-result');
  result.append(legacyControl('匹配的商品 ID（共 0 個）', 'matched-product-ids', {
    kind: 'textarea', placeholder: '查詢匹配的商品 ID 將顯示在這裡…',
  }).wrapper);
  result.querySelector('textarea').readOnly = true;
  products.append(result);
  columns.append(criteria, products);
  form.append(columns);
  detail.append(form);
  legacyStatus(detail, feature);
  appendFilterTool(detail);
}

function appendHealthLayout(detail, feature) {
  const form = node('section', 'workflow-card legacy-layout');
  form.append(node('h3', '', '狀態過濾'));
  const states = node('div', 'legacy-radio-row');
  states.append(legacyRadio('hc-state', 'hc-ongoing', 'ongoing', '只看進行中', true),
    legacyRadio('hc-state', 'hc-all', 'all', '全部'));
  form.append(states, node('p', 'group-intro', '原版按總數分頁掃描廣告，標註異常商品 ID 與標題。'),
    legacyAction('🔍 掃描違規／異常狀態', '檢查廣告是否存在違規或異常情況。',
      '開始掃描', 'btn-healthcheck', 'secondary'));
  const result = node('div', 'output');
  result.id = 'hc-result';
  form.append(result);
  detail.append(form);
  legacyStatus(detail, feature);
  appendHealthTool(detail);
}

function appendTitleLayout(detail, feature) {
  const form = node('section', 'workflow-card legacy-layout');
  const initial = node('div');
  initial.id = 'initial-prompt-area';
  initial.append(node('p', 'group-intro', '選擇商品並修改其標題。'));
  const ids = legacyControl('商品 ID 列表（可選）', 'product-ids-input', {
    kind: 'textarea', placeholder: '輸入商品 ID，以逗號或換行分隔',
    help: '目前先核對前 100 件在架商品；尚未接入標題編輯。',
  });
  initial.append(ids.wrapper);
  const progress = node('div', 'group-intro');
  progress.id = 'product-ids-progress';
  progress.hidden = true;
  const current = node('span', '', '0');
  current.id = 'current-id-index';
  const total = node('span', '', '0');
  total.id = 'total-ids-count';
  progress.append('進度：', current, ' / ', total);
  initial.append(progress);
  const select = node('button', 'run-button', '選擇商品');
  select.id = 'select-product-btn';
  select.type = 'button';
  initial.append(select);
  const selected = node('div', 'legacy-title-selected');
  selected.id = 'selected-product-info';
  selected.hidden = true;
  selected.append(node('h3', '', '已選擇的商品'));
  const display = node('div', 'output');
  display.id = 'selected-product-display';
  selected.append(display);
  const keywords = node('div', 'legacy-keywords');
  keywords.id = 'keyword-recommendation-area';
  keywords.hidden = true;
  const search = legacyControl('搜尋關鍵詞', 'keyword-search-input', {
    placeholder: '輸入尋找關鍵字',
  });
  keywords.append(search.wrapper);
  for (const [id, label] of [['keyword-search-btn', '搜尋'], ['keyword-search-clear', '清除']]) {
    const button = node('button', 'run-button', label);
    button.type = 'button'; button.id = id; button.disabled = true;
    keywords.append(button);
  }
  const tableContainer = node('div', 'output');
  const keywordTable = node('table', 'data-table');
  const head = node('tr');
  for (const label of ['關鍵字', '品質分數', '搜尋量', '建議出價']) head.append(node('th', '', label));
  const body = node('tbody');
  body.id = 'keywords-table';
  const tableHead = node('thead');
  tableHead.append(head);
  keywordTable.append(tableHead);
  keywordTable.append(body);
  tableContainer.append(keywordTable);
  keywords.append(node('h3', '', '推薦關鍵字（0）'), tableContainer);
  selected.append(keywords);
  select.addEventListener('click', async () => {
    select.disabled = true;
    selected.hidden = false;
    display.textContent = '正在讀取前 100 件在架商品…';
    try {
      const desired = parseItemIds(ids.control.value);
      const result = await api('/api/items?status=NORMAL&pageSize=100');
      const products = result.item || [];
      const match = desired.size
        ? products.find(item => desired.has(String(item.item_id))) : products[0];
      if (!match) {
        display.textContent = desired.size
          ? '前 100 件在架商品中找不到指定 ID；仍可能在後續頁面。'
          : '前 100 件在架商品沒有可選商品。';
        return;
      }
      display.replaceChildren(node('strong', '', `商品 ID：${match.item_id}`),
        node('p', '', `狀態：${match.item_status || '未確認'}`),
        node('p', 'query-note', '商品標題與推薦關鍵詞尚未接入官方 API，不能在此修改。'));
      if (desired.size) {
        progress.hidden = false;
        current.textContent = '1';
        total.textContent = String(desired.size);
      } else progress.hidden = true;
    } catch (error) {
      display.textContent = error.message || String(error);
    } finally {
      select.disabled = false;
    }
  });
  form.append(initial, selected);
  detail.append(form);
  legacyStatus(detail, feature);
}

function budgetRuleField(parent, className, labelText, { type = 'number', value = '', placeholder = '', min, step } = {}) {
  const label = node('label', 'budget-rule-field', labelText);
  const input = node(type === 'textarea' ? 'textarea' : 'input');
  input.className = className;
  if (type !== 'textarea') input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  if (min !== undefined) input.min = min;
  if (step !== undefined) input.step = step;
  label.append(input);
  parent.append(label);
  return input;
}

function budgetRuleCheck(parent, className, labelText, checked = false) {
  const label = node('label', 'legacy-radio');
  const input = node('input');
  input.type = 'checkbox';
  input.className = className;
  input.checked = checked;
  label.append(input, node('span', '', labelText));
  parent.append(label);
  return input;
}

function makeBudgetRule(index, onRemove) {
  const row = node('article', 'budget-rule-row');
  const head = node('div', 'budget-rule-head');
  head.append(node('h3', '', `規則 ${index}`));
  const remove = node('button', 'preview-delete-button', '移除規則');
  remove.type = 'button';
  remove.addEventListener('click', () => {
    if (row.parentElement?.children.length > 1) {
      row.remove();
      onRemove();
    }
  });
  head.append(remove);
  row.append(head);
  const top = node('div', 'budget-rule-top');
  const product = node('section', 'budget-rule-column');
  product.append(node('h4', '', '商品設定'));
  const pick = node('button', 'preview-delete-button', '添加商品');
  pick.type = 'button'; pick.disabled = true;
  pick.title = '商品選擇器尚未接入';
  product.append(pick);
  budgetRuleField(product, 'rule-item-ids', '商品 ID（支援多 ID）', {
    type: 'textarea', placeholder: '逗號、空格或換行均可',
  });
  const budget = node('section', 'budget-rule-column');
  budget.append(node('h4', '', '預算設定'));
  budgetRuleField(budget, 'rule-add-amount', '追加金額 (TWD)', { min: '1', placeholder: '例如 20' });
  budgetRuleField(budget, 'rule-max-budget', '最高預算上限 (TWD)', { min: '40', placeholder: '例如 200' });
  budgetRuleField(budget, 'rule-delay-min', '延遲執行（分鐘）', { min: '0', value: '2' });
  budgetRuleField(budget, 'rule-check-interval', '查詢頻率（分鐘）', { min: '1', value: '2' });
  budgetRuleField(budget, 'rule-cpc-limit', '單點花費上限 (TWD)', { min: '0', step: '0.01', placeholder: '留空不限制' });
  budgetRuleField(budget, 'rule-min-roi', '最低投產比要求', { min: '0', step: '0.1', placeholder: '留空不限制' });
  budgetRuleCheck(budget, 'rule-repeat', '重複加預算', true);
  const reserve = node('section', 'budget-rule-column');
  reserve.append(node('h4', '', '預算預留空間設定'));
  budgetRuleField(reserve, 'rule-gap-range', '預留空間', { type: 'text', placeholder: '例如 50-200 或 50' });
  budgetRuleField(reserve, 'rule-default-budget', '預設預算（23:55 還原）', { min: '40', placeholder: '例如 40' });
  reserve.append(node('p', 'group-intro', '原版在 23:55 將預算還原為預設值。此排程尚未接入。'));
  top.append(product, budget, reserve);
  row.append(top);
  const bottom = node('div', 'budget-rule-bottom');
  const schedule = node('section', 'budget-rule-column');
  schedule.append(node('h4', '', '定時動作'), node('strong', '', '23:55 動作'));
  const pause = budgetRuleCheck(schedule, 'rule-pause-at-reset', '23:55 暫停廣告');
  const bump = budgetRuleCheck(schedule, 'rule-bump-roi-at-reset', '23:55 提高 ROI 至');
  const bumpValue = budgetRuleField(schedule, 'rule-roi-target', '目標 ROI', { min: '1', step: '0.1' });
  bumpValue.parentElement.hidden = true;
  const recovery = node('div', 'budget-subsection');
  recovery.append(node('h4', '', '次日恢復設定'));
  const resume = budgetRuleField(recovery, 'rule-resume-time', '恢復開投時間', { type: 'time', value: '00:30' });
  const roiRestoreTime = budgetRuleField(recovery, 'rule-roi-restore-time', '恢復 ROI 時間', { type: 'time', value: '00:30' });
  const roiRestore = budgetRuleField(recovery, 'rule-roi-restore', '恢復 ROI 至', {
    min: '0', step: '0.1', placeholder: '0 表示系統 ROI；留空不恢復',
  });
  const updateRecovery = () => {
    bumpValue.parentElement.hidden = !bump.checked;
    recovery.hidden = !pause.checked && !bump.checked;
    resume.parentElement.hidden = !pause.checked;
    roiRestoreTime.parentElement.hidden = roiRestore.parentElement.hidden = !bump.checked;
  };
  pause.addEventListener('change', updateRecovery);
  bump.addEventListener('change', updateRecovery);
  schedule.append(recovery, node('hr', 'delete-ads-divider'),
    node('h4', '', '不同時間段的 ROI 調整'));
  const timedRoi = budgetRuleCheck(schedule, 'rule-enable-roi-time-points', '啟用時間段 ROI 調整');
  const pointArea = node('div', 'budget-subsection');
  const executeToday = legacyControl('已過時間點的執行方式', '', { kind: 'select', options: [
    ['tomorrow', '次日執行'], ['today', '當天執行'],
  ] });
  executeToday.control.className = 'rule-roi-execute-today';
  pointArea.append(executeToday.wrapper);
  const points = node('div', 'budget-time-list');
  const addPoint = node('button', 'preview-delete-button', '＋ 添加時間點');
  addPoint.type = 'button';
  addPoint.addEventListener('click', () => {
    const item = node('div', 'budget-time-row');
    budgetRuleField(item, 'rule-roi-time', '開始時間', { type: 'time', value: '02:00' });
    budgetRuleField(item, 'rule-roi-value', '目標 ROI（0 為系統 ROI）', { min: '0', step: '0.1' });
    const del = node('button', 'preview-delete-button', '移除');
    del.type = 'button'; del.addEventListener('click', () => item.remove());
    item.append(del); points.append(item);
  });
  pointArea.append(addPoint, points);
  timedRoi.addEventListener('change', () => {
    if (timedRoi.checked) bump.checked = false;
    pointArea.hidden = !timedRoi.checked;
    updateRecovery();
  });
  bump.addEventListener('change', () => {
    if (bump.checked) timedRoi.checked = false;
    pointArea.hidden = !timedRoi.checked;
  });
  schedule.append(pointArea);
  const windows = node('section', 'budget-rule-column');
  windows.append(node('h4', '', '加預算時間控制'));
  const allDay = budgetRuleCheck(windows, 'rule-all-day', '不限時間（固定到 23:55 截止）', true);
  const windowArea = node('div', 'budget-subsection');
  const addWindow = node('button', 'preview-delete-button', '＋ 添加時間段');
  addWindow.type = 'button';
  const windowList = node('div', 'budget-time-list');
  addWindow.addEventListener('click', () => {
    const item = node('div', 'budget-time-row');
    budgetRuleField(item, 'rule-window-start', '開始', { type: 'time', value: '09:00' });
    budgetRuleField(item, 'rule-window-end', '結束', { type: 'time', value: '23:55' });
    const del = node('button', 'preview-delete-button', '移除');
    del.type = 'button'; del.addEventListener('click', () => item.remove());
    item.append(del); windowList.append(item);
  });
  allDay.addEventListener('change', () => { windowArea.hidden = allDay.checked; });
  windowArea.append(addWindow, windowList);
  windows.append(windowArea, node('p', 'group-intro', '時間段最晚到 23:55；目前只保存畫面草稿，不會啟動排程。'));
  bottom.append(schedule, windows);
  row.append(bottom);
  const preview = node('button', 'preview-delete-button budget-rule-apply', '用此規則預覽');
  preview.type = 'button';
  row.append(preview);
  updateRecovery();
  pointArea.hidden = true;
  windowArea.hidden = true;
  return row;
}

function appendBudgetLayout(detail, feature) {
  const form = node('section', 'workflow-card legacy-layout budget-rules-layout');
  form.append(node('h3', '', '📈 自動加預算（按消耗水位線）'),
    node('p', 'group-intro', '當「預算－消耗」落在水位區間內或低於下限，原版會依規則追加預算。'));
  const states = node('div', 'legacy-radio-row');
  states.append(legacyRadio('state-filter', '', 'ongoing', '只看進行中', true),
    legacyRadio('state-filter', '', 'all', '全部', false, true));
  form.append(states, node('p', 'group-intro', '運行中的規則在原版會鎖定編輯。'));
  const list = node('div', 'budget-rule-list');
  list.id = 'rule-list';
  const renumber = () => {
    [...list.children].forEach((row, index) => {
      row.querySelector('.budget-rule-head h3').textContent = `規則 ${index + 1}`;
    });
  };
  list.append(makeBudgetRule(1, renumber));
  form.append(list);
  const controls = node('div', 'budget-controls');
  const add = node('button', 'run-button', '＋ 添加規則');
  add.type = 'button'; add.id = 'btn-add-rule';
  add.addEventListener('click', () => {
    list.append(makeBudgetRule(list.children.length + 1, renumber));
    renumber();
  });
  controls.append(add);
  for (const [id, label] of [['btn-start-topup', '▶ 開啟輪詢'], ['btn-stop-topup', '⏹ 停止輪詢']]) {
    const button = node('button', 'run-button', label);
    button.id = id; button.type = 'button'; button.disabled = true;
    button.title = '可靠排程與廣告寫入尚未完成沙盒驗證';
    controls.append(button);
  }
  form.append(controls, node('p', 'query-note', '23:55 還原、輪詢及次日恢復尚未接入；下方可用樣本數據預覽規則的數值門檻。時間窗、重複追加和日終動作不包含在此預覽內。'));
  detail.append(form);
  legacyStatus(detail, feature);
  const preview = appendBudgetPreview(detail);
  list.addEventListener('click', event => {
    if (!event.target.closest('.budget-rule-apply')) return;
    const row = event.target.closest('.budget-rule-row');
    const value = className => row.querySelector(`.${className}`).value.trim();
    const gap = value('rule-gap-range');
    const match = /^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?$/.exec(gap);
    if (!match || (match[2] && Number(match[2]) < Number(match[1])) || !value('rule-add-amount')) {
      preview.output.className = 'output error';
      preview.output.textContent = '請填寫有效的預留空間（例如 50 或 50-200）和追加金額。';
      preview.output.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const mapping = {
      gap: match[2] || match[1], add: value('rule-add-amount'),
      cap: value('rule-max-budget') || '200', cpc: value('rule-cpc-limit') || '0',
      minRoi: value('rule-min-roi') || '0', delay: value('rule-delay-min') || '0',
    };
    for (const [key, inputValue] of Object.entries(mapping)) preview.inputs[key].value = inputValue;
    preview.button.click();
    preview.output.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function shippingChoice(id, title, description, active, onClick) {
  const button = node('button', `shipping-choice${active ? ' active' : ''}`);
  button.type = 'button';
  button.id = id;
  button.append(node('strong', '', title), node('small', '', description));
  button.addEventListener('click', onClick);
  return button;
}

function appendShippingDaysLayout(detail, feature) {
  const form = node('section', 'workflow-card legacy-layout shipping-days-layout');
  form.append(node('h3', '', '🚚 批量改天數'));
  const modes = node('div', 'shipping-choice-grid');
  let shippingMode = 'spot';
  const days = legacyControl('發貨時間（天）', 'daysToShip', { kind: 'select',
    value: '7', options: Array.from({ length: 14 }, (_, index) => [String(index + 2), `${index + 2} 天`]),
  });
  const daysGroup = node('div');
  daysGroup.id = 'daysToShipGroup';
  daysGroup.hidden = true;
  daysGroup.append(days.wrapper);
  const chooseMode = next => {
    shippingMode = next;
    for (const child of modes.children) child.classList.toggle('active', child.id === (next === 'spot' ? 'optionSpot' : 'optionPreorder'));
    daysGroup.hidden = next === 'spot';
  };
  modes.append(shippingChoice('optionSpot', '現貨模式', '1 天發貨', true, () => chooseMode('spot')),
    shippingChoice('optionPreorder', '預售模式', '3–15 天發貨', false, () => chooseMode('preorder')));
  form.append(modes, daysGroup, node('h4', '', '更新範圍'));
  const scopes = node('div', 'shipping-choice-grid scope-grid');
  let scope = 'nonhot';
  const chooseScope = next => {
    scope = next;
    const ids = { all: 'optionAll', online: 'optionOnline', offline: 'optionOffline', nonhot: 'optionNonHot' };
    for (const child of scopes.children) child.classList.toggle('active', child.id === ids[next]);
    topPercent.wrapper.hidden = next !== 'nonhot';
  };
  scopes.append(shippingChoice('optionNonHot', '非熱銷商品', '按銷量排除頭部比例', true, () => chooseScope('nonhot')),
    shippingChoice('optionOnline', '只修改上架商品', '僅更新在線商品', false, () => chooseScope('online')),
    shippingChoice('optionOffline', '只修改未上架商品', '僅更新未上架商品', false, () => chooseScope('offline')),
    shippingChoice('optionAll', '修改店鋪所有商品', '包括在線和未上架', false, () => chooseScope('all')));
  form.append(scopes);
  const topPercent = legacyControl('排除銷量頭部比例 (%)', 'excludeTopSalesPercent', {
    kind: 'number', value: '9', min: '0.1', step: '0.1',
    help: '原版按銷量排序後排除頭部商品；目前 API 尚未接入銷量，無法預覽此模式。',
  });
  topPercent.wrapper.id = 'excludeTopSalesPercentGroup';
  form.append(topPercent.wrapper);
  const excluded = legacyControl('排除商品 ID', 'excludeProductIds', {
    kind: 'textarea', placeholder: '每行一個或用逗號分隔',
  });
  form.append(excluded.wrapper, node('p', 'query-note', '原版還會排除限時特賣商品與選取的滿額贈商品；目前這兩項資料尚未接入。'));
  const deals = node('div', 'group-action-row');
  deals.append(node('span', '', '排除滿額贈活動商品'));
  const dealButton = node('button', 'preview-delete-button', '設定');
  dealButton.id = 'selectAddOnDealsBtn'; dealButton.type = 'button'; dealButton.disabled = true;
  deals.append(dealButton);
  form.append(deals, legacyCheck('toggleLogistics', '自動管理物流開關'));
  const actions = node('div', 'shipping-actions');
  for (const [id, label] of [
    ['startBtn', '手動更新'], ['stopBtn', '停止'], ['autoBtn', '設定自動化任務'],
    ['modifyLogisticsBtn', '物流設定'], ['resetStateBtn', '重置狀態'],
  ]) {
    const button = node('button', 'run-button', label);
    button.id = id; button.type = 'button';
    button.disabled = !['autoBtn', 'modifyLogisticsBtn'].includes(id);
    actions.append(button);
  }
  form.append(actions);
  const automation = node('div', 'shipping-automation');
  automation.id = 'autoSettings';
  automation.hidden = true;
  automation.append(node('h3', '', '自動化設定'),
    node('p', 'query-note', '此處可檢視兩項排程設定；後端排程尚未建立，保存及啟動停用。'));
  for (const number of [1, 2]) {
    const task = node('div', 'budget-rule-column');
    task.append(node('h4', '', `計畫任務 ${number}${number === 2 ? '（可選）' : ''}`));
    const row = node('div', 'group-parameter-row');
    row.append(legacyControl('執行日期', `scheduledDate${number}`, { kind: 'date' }).wrapper,
      legacyControl('執行時間', `scheduledTime${number}`, { kind: 'time', value: number === 1 ? '23:30' : '00:01' }).wrapper);
    task.append(row, legacyControl('修改為發貨天數', `scheduledDays${number}`, {
      kind: 'select', value: number === 1 ? '1' : '10',
      options: Array.from({ length: 15 }, (_, index) => [String(index + 1), `${index + 1} 天`]),
    }).wrapper);
    if (number === 2) {
      const clear = node('button', 'preview-delete-button', '清空此任務');
      clear.id = 'clearTask2Btn'; clear.type = 'button';
      clear.addEventListener('click', () => {
        task.querySelector('#scheduledDate2').value = '';
        task.querySelector('#scheduledTime2').value = '00:01';
        task.querySelector('#scheduledDays2').value = '10';
      });
      task.append(clear);
    }
    automation.append(task);
  }
  for (const [id, label] of [['saveAutoBtn', '保存並啟動'], ['stopAllAutoBtn', '停止所有任務']]) {
    const button = node('button', 'run-button', label);
    button.id = id; button.type = 'button'; button.disabled = true;
    automation.append(button);
  }
  form.append(automation);
  actions.querySelector('#autoBtn').addEventListener('click', () => { automation.hidden = !automation.hidden; });
  actions.querySelector('#modifyLogisticsBtn').addEventListener('click', () => {
    renderFeature(activeModule.features.find(item => item.id === 'shipping-channels'));
  });
  const preview = node('button', 'preview-delete-button', '只讀預覽商品範圍');
  preview.type = 'button';
  const output = node('div', 'output', '選擇商品範圍後可預覽前 100 件商品。');
  preview.addEventListener('click', async () => {
    preview.disabled = true;
    output.className = 'output';
    output.textContent = '正在讀取商品…';
    try {
      if (scope === 'nonhot') throw new Error('非熱銷商品需要銷量資料，目前無法安全預覽。請選擇上架、未上架或全部商品。');
      const excludedIds = parseItemIds(excluded.control.value);
      const statuses = scope === 'online' ? ['NORMAL'] : scope === 'offline' ? ['UNLIST'] : ['NORMAL', 'UNLIST'];
      const params = statuses.map(status => `status=${status}`).join('&');
      const result = await api(`/api/items?${params}&pageSize=100`);
      const items = (result.item || []).filter(item => !excludedIds.has(String(item.item_id)));
      table(output, ['商品 ID', '狀態'], items.map(item => [item.item_id, item.item_status]));
      output.prepend(node('p', 'query-summary',
        `本頁符合 ${items.length} 件；${result.has_next_page ? '後面還有商品，尚未讀完。' : '商品列表已讀完。'}${shippingMode === 'spot' ? '目標為現貨 1 天。' : `目標為預售 ${days.control.value} 天。`}`));
      output.append(node('p', 'query-note', '未核對銷量、限時特賣、滿額贈與物流渠道；此處不會修改商品。'));
    } catch (error) {
      output.className = 'output error';
      output.textContent = error.message || String(error);
    } finally { preview.disabled = false; }
  });
  form.append(preview, output);
  detail.append(form);
  legacyStatus(detail, feature);
}

function renderFeature(feature) {
  activeFeature = feature;
  const detail = $('feature-detail');
  detail.replaceChildren();
  $('module-heading').textContent = feature.name;
  $('module-summary').textContent = feature.summary;
  const badge = node('span', `status ${statuses[feature.status].className}`, statuses[feature.status].label);
  detail.append(badge);
  const legacyLayout = {
    'ads-all': appendAllShopLayout,
    'ads-groups': appendAdGroupsLayout,
    'ads-cpc': appendCpcMonitorLayout,
    'ads-delete': appendDeleteAdsLayout,
    'products-bulk': appendProductBulkLayout,
    'ads-specific': appendSpecificAdsLayout,
    'ads-roi': appendRoiBudgetLayout,
    'ads-boost': appendBoostLayout,
    'ads-reopen': appendReopenLayout,
    'ads-filter': appendFilterLayout,
    'ads-health': appendHealthLayout,
    'products-title': appendTitleLayout,
    'budget-rules': appendBudgetLayout,
    'shipping-days': appendShippingDaysLayout,
  }[feature.id];
  if (legacyLayout) {
    legacyLayout(detail, feature);
    for (const button of document.querySelectorAll('.nav-link')) {
      button.classList.toggle('active', button.dataset.feature === feature.id);
    }
    location.hash = `${activeModule.id}/${feature.id}`;
    return;
  }
  const setup = node('section', 'workflow-card');
  const setupHead = node('div', 'workflow-heading');
  const setupText = node('div');
  setupText.append(node('h3', '', feature.status === 'local' ? '設定計算參數' : '設定任務參數'),
    node('p', '', feature.status === 'local' ? '輸入數值後在下方計算。' : '先核對功能與目前 API 對接狀態。'));
  setupHead.append(node('span', 'step-number', '1'), setupText);
  const explanation = node('div', 'parameter-section');
  explanation.append(node('strong', '', feature.status === 'local' ? '本機可用' : '目前對接進度'),
    node('p', '', feature.details));
  setup.append(setupHead);
  detail.append(setup);
  const execution = node('section', 'workflow-card');
  const executionHead = node('div', 'workflow-heading');
  const executionText = node('div');
  executionText.append(node('h3', '', feature.status === 'local' ? '執行計算' : '選擇要執行的任務'),
    node('p', '', feature.tool ? '下方工具顯示目前已接入的功能；店鋪寫入會先預覽，再由你確認。' : '此操作尚未接入官方 API。'));
  executionHead.append(node('span', 'step-number', '2'), executionText);
  execution.append(executionHead);
  const hasLegacyPreview = appendLegacyPreview(feature.id, setup, execution);
  setup.append(explanation);
  if (feature.tool) tools[feature.tool](execution);
  else if (!hasLegacyPreview) execution.append(node('div', 'parameter-section', '目前不能操作店鋪；等對應 API 與沙盒測試通過後啟用。'));
  detail.append(execution);
  for (const button of document.querySelectorAll('.nav-link')) {
    button.classList.toggle('active', button.dataset.feature === feature.id);
  }
  location.hash = `${activeModule.id}/${feature.id}`;
}

const adsNavigation = [
  'ads-all', 'ads-groups', 'ads-cpc', 'ads-delete', 'products-bulk', 'ads-specific',
  'ads-roi', 'ads-boost', 'ads-reopen', 'ads-filter', 'ads-health', 'products-title',
];
const featuresById = new Map(modules.flatMap(module => module.features.map(feature => [feature.id, feature])));

async function loadShopOverview() {
  const [items, ads] = await Promise.allSettled([
    api('/api/items?status=NORMAL&pageSize=1'),
    api('/api/ads?limit=100'),
  ]);
  if (items.status === 'fulfilled') {
    $('shop-item-count').textContent = String(items.value.total_count ?? items.value.item?.length ?? 0);
  }
  if (ads.status === 'fulfilled') {
    const count = ads.value.campaign_list?.length ?? 0;
    $('shop-ad-count').textContent = `${count}${ads.value.has_next_page ? '+' : ''}`;
  }
  const errors = [items, ads].filter(result => result.status === 'rejected').map(result => result.reason.message);
  $('shop-overview-status').textContent = errors.length
    ? `部分資料無法讀取：${[...new Set(errors)].join('；')}`
    : '資料來自已授權的臺灣沙盒店鋪。';
}

function renderBatchTaskSummary(run) {
  const entries = Array.isArray(run?.entries) ? run.entries : [];
  const processed = entries.filter(entry => entry.status !== 'pending' && entry.status !== 'not_sent');
  const confirmed = entries.filter(entry => entry.status === 'verified');
  const review = entries.filter(entry => ['sending', 'accepted', 'needs_review'].includes(entry.status));
  $('task-total').textContent = String(entries.length);
  $('task-processed').textContent = String(processed.length);
  $('task-success').textContent = String(confirmed.length);
  $('task-review').textContent = String(review.length);
  $('task-last-record').textContent = run
    ? `最近批量預算任務：測試店鋪 ${run.shopId}，目標每日預算 TWD ${run.targetBudget}。${confirmed.length} 個已讀回確認，${review.length} 個待核對。`
    : '尚未開始任何批量任務。';
}

function visibleFeatures(module) {
  return module.id === 'ads' ? adsNavigation.map(id => featuresById.get(id)) : module.features;
}

function renderModule(module, preferredFeature) {
  activeModule = module;
  $('module-picker').value = module.id;
  $('module-icon').textContent = module.icon;
  const nav = $('module-nav');
  nav.replaceChildren();
  const features = visibleFeatures(module);
  for (const feature of features) {
    const button = node('button', 'nav-link');
    button.type = 'button';
    button.dataset.feature = feature.id;
    button.append(node('span', 'nav-icon', feature.id === 'ads-cpc' ? '⌁' : feature.id === 'ads-delete' ? '♜' : feature.id === 'ads-filter' ? '▽' : '◇'),
      node('span', '', feature.name));
    button.addEventListener('click', () => renderFeature(feature));
    nav.append(button);
  }
  renderFeature(features.find(item => item.id === preferredFeature) || features[0]);
}

async function initialize() {
  const { lastBatchBudgetRun } = await chrome.storage.local.get('lastBatchBudgetRun');
  renderBatchTaskSummary(lastBatchBudgetRun);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.lastBatchBudgetRun) {
      renderBatchTaskSummary(changes.lastBatchBudgetRun.newValue);
    }
  });
  for (const module of modules) {
    const option = node('option', '', module.name);
    option.value = module.id;
    $('module-picker').append(option);
  }
  $('module-picker').addEventListener('change', event => {
    renderModule(modules.find(module => module.id === event.target.value) || modules[0]);
  });
  $('reload-page').addEventListener('click', () => location.reload());
  $('open-seller').addEventListener('click', () => chrome.tabs.create({ url: 'https://seller.sandbox.test-stable.shopee.tw/' }));
  $('panel-toggle').addEventListener('click', () => {
    const collapsed = $('console-panel').classList.toggle('collapsed');
    $('panel-toggle').textContent = collapsed ? '+' : '−';
    $('panel-toggle').setAttribute('aria-label', collapsed ? '展開資訊面板' : '收合資訊面板');
  });
  const all = modules.flatMap(module => module.features);
  const count = status => all.filter(feature => feature.status === status).length;
  $('progress').textContent = `${count('local')} 可直接使用 · ${count('partial')} 部分完成 · ${count('mapping')} 待對接`;
  const [moduleId, featureId] = location.hash.slice(1).split('/');
  renderModule(modules.find(module => module.id === moduleId) || modules[0], featureId);
  try {
    const response = await fetch(`${BASE}/health`);
    const data = await response.json();
    $('connection').textContent = `本機後端已連線 · Shop ${data.shopId}`;
    await loadShopOverview();
  } catch { $('connection').textContent = '本機後端未啟動'; }
}

initialize();
