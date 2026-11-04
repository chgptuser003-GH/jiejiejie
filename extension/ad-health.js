export function classifyCampaignHealth({ info, productById, productsAvailable, metricsAvailable, impressions }) {
  if (!info) return { level: 'unknown', notes: ['活動設定未回傳'] };
  const notes = [];
  let issue = false;
  let unknown = false;
  const itemIds = Array.isArray(info.item_id_list) ? info.item_id_list.map(String) : [];
  if (!itemIds.length) { notes.push('關聯商品 ID 未回傳'); unknown = true; }
  const budget = Number(info.campaign_budget);
  if (info.campaign_budget == null || !Number.isFinite(budget) || budget <= 0) {
    notes.push('每日預算缺失或非正數'); issue = true;
  }
  for (const id of itemIds) {
    const status = productById.get(id);
    if (!productsAvailable || !status) { notes.push(`商品 ${id} 狀態未確認`); unknown = true; }
    else if (info.campaign_status === 'ongoing' && status !== 'NORMAL') {
      notes.push(`商品 ${id} 狀態：${status}`); issue = true;
    }
  }
  if (!info.campaign_status) { notes.push('活動狀態未確認'); unknown = true; }
  else if (info.campaign_status !== 'ongoing') notes.push(`活動目前 ${info.campaign_status}`);
  if (!metricsAvailable || impressions === null) {
    notes.push('當日績效未確認'); unknown = true;
  } else if (info.campaign_status === 'ongoing' && impressions === 0) {
    notes.push('當日已回傳零曝光');
  }
  return { level: issue ? 'review' : unknown ? 'unknown' : 'checked', notes };
}
