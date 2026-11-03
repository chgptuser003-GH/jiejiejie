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
