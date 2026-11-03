export async function scanCampaignPages({ fetchPage, onPage, startOffset = 0, pageSize = 100, maxPages = 1 }) {
  if (typeof fetchPage !== 'function' || typeof onPage !== 'function') {
    throw new TypeError('fetchPage and onPage are required');
  }
  if (!Number.isSafeInteger(startOffset) || startOffset < 0
    || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100
    || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 10) {
    throw new TypeError('invalid campaign scan range');
  }
  const seen = new Set();
  let offset = startOffset;
  let scanned = 0;
  for (let page = 1; page <= maxPages; page++) {
    const response = await fetchPage({ offset, limit: pageSize });
    if (!Array.isArray(response?.campaign_list)) throw new Error('活動清單格式不正確。');
    const campaigns = response.campaign_list;
    if (campaigns.length > pageSize || (response.has_next_page && campaigns.length === 0)) {
      throw new Error('廣告活動分頁資料不完整，已停止掃描。');
    }
    for (const campaign of campaigns) {
      const id = String(campaign?.campaign_id ?? '');
      if (!/^\d+$/.test(id) || seen.has(id)) {
        throw new Error('廣告活動 ID 缺失或分頁重複，已停止掃描。');
      }
      seen.add(id);
    }
    await onPage(campaigns, { page, offset });
    scanned += campaigns.length;
    if (!response.has_next_page) {
      return { scanned, pages: page, complete: true, nextOffset: null };
    }
    offset += campaigns.length;
  }
  return { scanned, pages: maxPages, complete: false, nextOffset: offset };
}
