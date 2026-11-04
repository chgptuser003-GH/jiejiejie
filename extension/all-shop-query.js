export function classifyAllShopAds(productIds, campaigns) {
  const ongoingItems = new Set();
  const pausedCampaigns = new Set();
  for (const campaign of campaigns) {
    const info = campaign?.common_info;
    const status = info?.campaign_status;
    if (status === 'paused') {
      const id = String(campaign.campaign_id ?? '');
      if (!/^\d+$/.test(id)) throw new Error('暫停廣告缺少活動 ID。');
      pausedCampaigns.add(id);
    } else if (status === 'ongoing') {
      if (!Array.isArray(info.item_id_list) || !info.item_id_list.length) {
        throw new Error('進行中的廣告缺少商品關聯，不能判定未開廣告商品。');
      }
      for (const itemId of info.item_id_list) {
        const id = String(itemId ?? '');
        if (!/^\d+$/.test(id)) throw new Error('廣告商品 ID 不完整，不能判定未開廣告商品。');
        ongoingItems.add(id);
      }
    } else if (!['ended', 'deleted', 'closed'].includes(status)) {
      throw new Error('有未知的廣告狀態，不能判定未開廣告商品。');
    }
  }
  return {
    withoutOngoingAds: productIds.filter(id => !ongoingItems.has(String(id))),
    pausedCampaignIds: [...pausedCampaigns],
  };
}
