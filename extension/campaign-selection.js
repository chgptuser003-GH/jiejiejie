export function parseItemIds(text, { required = false } = {}) {
  const values = String(text ?? '').split(/[\s,，]+/).filter(Boolean);
  if (required && values.length === 0) throw new Error('請輸入至少一個商品 ID。');
  const ids = new Set();
  for (const value of values) {
    const number = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number <= 0) {
      throw new Error(`商品 ID 格式不正確：${value}`);
    }
    ids.add(String(number));
  }
  return ids;
}

export function selectDeletionCandidates(campaigns, ids, mode) {
  if (!Array.isArray(campaigns) || !(ids instanceof Set) || !['exclude', 'include'].includes(mode)) {
    throw new TypeError('invalid deletion preview inputs');
  }
  const candidates = [];
  let unknown = 0;
  for (const campaign of campaigns) {
    const info = campaign?.common_info;
    if (!info || !Number.isSafeInteger(Number(campaign.campaign_id))) { unknown++; continue; }
    if (info.campaign_status !== 'ongoing') continue;
    const itemIds = Array.isArray(info.item_id_list) ? info.item_id_list.map(String) : [];
    if (!itemIds.length) { unknown++; continue; }
    if (mode === 'exclude' && itemIds.some(id => ids.has(id))) continue;
    if (mode === 'include' && !itemIds.some(id => ids.has(id))) continue;
    candidates.push({ campaignId: campaign.campaign_id, itemIds, name: info.ad_name || '', status: info.campaign_status });
  }
  return { candidates, unknown };
}

export function selectBudgetCampaigns(campaigns, ids, mode, complete) {
  if (!Array.isArray(campaigns) || !(ids instanceof Set) || !['include', 'exclude'].includes(mode)) {
    throw new TypeError('invalid budget selection');
  }
  if (!complete) throw new Error('廣告活動尚未掃描完整，不能按商品 ID 批量修改預算。');
  const candidates = [];
  const matchedIds = new Set();
  for (const campaign of campaigns) {
    const info = campaign?.common_info;
    const campaignId = Number(campaign?.campaign_id);
    if (!Number.isSafeInteger(campaignId) || campaignId <= 0 || !info) {
      throw new Error('部分活動缺少商品關聯，不能可靠選取修改對象。');
    }
    if (info.ad_type !== 'manual' || info.campaign_status !== 'ongoing') continue;
    if (!Array.isArray(info.item_id_list) || !info.item_id_list.length) {
      throw new Error('部分進行中活動缺少商品關聯，不能可靠選取修改對象。');
    }
    const itemIds = info.item_id_list.map(String);
    if (mode === 'include' && !itemIds.some(id => ids.has(id))) continue;
    if (mode === 'exclude' && itemIds.some(id => ids.has(id))) continue;
    candidates.push({ campaignId: String(campaignId), itemIds, name: info.ad_name || '' });
    for (const id of itemIds) if (ids.has(id)) matchedIds.add(id);
  }
  return { candidates, missingIds: mode === 'include' ? [...ids].filter(id => !matchedIds.has(id)) : [] };
}
