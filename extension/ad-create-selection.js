export function selectAdCreationItems(items, campaigns, ids, campaignsComplete) {
  if (!Array.isArray(items) || !Array.isArray(campaigns) || !(ids instanceof Set)) {
    throw new TypeError('invalid ad creation selection');
  }
  if (ids.size < 1 || ids.size > 10) throw new Error('一次只能選取 1–10 個商品 ID。');
  if (!campaignsComplete) throw new Error('廣告活動尚未掃描完整，不能可靠排除重複投放。');
  const available = new Map();
  for (const item of items) {
    const id = String(item?.item_id ?? '');
    if (ids.has(id) && item.item_status === 'NORMAL') available.set(id, item);
  }
  const missing = [...ids].filter(id => !available.has(id));
  if (missing.length) throw new Error(`未在已讀取的在架商品中找到：${missing.join('、')}。`);
  const advertised = new Set();
  for (const campaign of campaigns) {
    const itemIds = campaign?.common_info?.item_id_list;
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      throw new Error('部分廣告活動缺少商品關聯，不能可靠排除重複投放。');
    }
    for (const itemId of itemIds) advertised.add(String(itemId));
  }
  const duplicates = [...ids].filter(id => advertised.has(id));
  if (duplicates.length) throw new Error(`這些商品已出現在廣告活動中，請先核對：${duplicates.join('、')}。`);
  return [...ids].map(id => available.get(id));
}
