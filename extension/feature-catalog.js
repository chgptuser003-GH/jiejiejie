export const modules = [
  {
    id: 'ads', name: '廣告管理', icon: '📣', features: [
      { id: 'ads-all', name: '全店開啟廣告', status: 'partial', summary: '篩選未投放商品，設定每日預算、目標 ROAS 或自動競價後批量建立。', details: '新增在架商品的只讀投放預覽；活動掃描完整時才標示未出現在活動的商品，庫存與建立資格仍未確認。單件自動競價廣告已實測，全店批量仍未完成。', tool: 'all-ads' },
      { id: 'ads-groups', name: '批量開廣告群組', status: 'mapping', summary: '排除已有廣告或零庫存商品，每 30 件組成一組投放。', details: '官方店鋪 GMV Max 與舊版每 30 件商品一組的語義不同，仍需確認等價 API。' },
      { id: 'ads-cpc', name: 'CPC 監控自動重開', status: 'partial', summary: '按 CPC 閾值監控廣告，延時關閉並重建。', details: '每日與每小時績效 API 適配器已完成；監控排程、數據延遲驗證及安全重開流程尚未完成。', tool: 'performance' },
      { id: 'ads-delete', name: '批量刪除廣告', status: 'partial', summary: '按指定或排除商品 ID 批量處理進行中廣告。', details: '單件手動選品廣告的刪除 API 已對照；批量預覽、確認及任務紀錄尚未完成。' },
      { id: 'ads-specific', name: '指定商品開廣告', status: 'partial', summary: '對指定商品設定預算、目標 ROAS 和投放模式。', details: '已在沙盒成功建立單件手動選品、平台自動競價廣告。此模式不設定目標 ROAS；批量、其他競價方式與自訂 ROAS 尚未接入。', tool: 'manual-ad' },
      { id: 'ads-roi', name: '批量修改 ROAS／預算', status: 'partial', summary: '以商品或活動 ID 批量修改目標 ROAS 與每日預算。', details: '沙盒單件廣告的預算修改、暫停和恢復已通過實測；新增最多 10 個活動的批量預算工具，逐個讀回並保留執行記錄，尚待介面實測。auto 競價活動不可直接修改目標 ROAS。', tool: 'manual-edit' },
      { id: 'ads-boost', name: '加速推廣控制', status: 'mapping', summary: '批量開關手動 ROAS 廣告的加速推廣。', details: '尚未核實官方 API 有與舊版「加速推廣」完全相同的設定。' },
      { id: 'ads-reopen', name: '重開廣告', status: 'partial', summary: '按指定商品延時重開，保留預算和 ROAS 設定。', details: '舊版採刪除再建立，需先完成快照、預覽和失敗恢復，避免投放中斷。' },
      { id: 'ads-filter', name: '批量篩選廣告', status: 'partial', summary: '依曝光、點擊、花費、CPC、ROAS、狀態等條件篩選與匯出。', details: '已接入單頁最多 100 個活動的只讀篩選與 CSV 匯出，支援日期、狀態、商品 ID、點擊、CPC、花費與 ROAS；跨頁批量任務及刪除尚未完成。', tool: 'ad-filter' },
      { id: 'ads-health', name: '廣告健康檢查', status: 'partial', summary: '掃描活動狀態、異常和商品資訊。', details: '已接入單頁最多 100 活動的只讀設定、商品狀態與當日績效檢查；查不到的商品只標未確認。蝦皮違規原因與跨頁全店掃描尚未接入。', tool: 'ad-health' },
    ],
  },
  {
    id: 'budget', name: '預算水位線', icon: '📈', features: [
      { id: 'budget-rules', name: '預算追加與定時控制', status: 'partial', summary: '依剩餘預算、CPC、ROAS 和上限判斷追加；可設時間窗、日終重置與隔日恢復。', details: '本地規則判定已完成；廣告讀寫、後端排程及 23:55 重置流程尚未完成。', tool: 'budget-preview' },
    ],
  },
  {
    id: 'products', name: '商品管理', icon: '📦', features: [
      { id: 'products-bulk', name: '批量商品操作', status: 'partial', summary: '查詢、上架、下架及刪除商品，可按 ID、狀態和銷量篩選。', details: '商品列表 API 和只讀查詢已完成；批量寫入及刪除尚未接入。', tool: 'products' },
      { id: 'products-title', name: '修改標題', status: 'mapping', summary: '逐件或批量修改標題，提供熱詞推薦及廣告關聯處理。', details: '商品編輯、熱詞來源和「複製商品後刪原商品」流程仍需逐項對照官方 API。' },
    ],
  },
  {
    id: 'shipping', name: '發貨與物流', icon: '🚚', features: [
      { id: 'shipping-days', name: '批量發貨天數', status: 'mapping', summary: '設現貨 1 天或預售 3–15 天，依商品狀態、銷量和活動排除。', details: '需確認 Product API 對整品與 SKU 備貨天數的修改規則。' },
      { id: 'shipping-channels', name: '物流渠道設定', status: 'mapping', summary: '批量開關或調整商品的物流渠道。', details: '需確認 Logistics 與 Product API 的商品物流設定能力。' },
      { id: 'shipping-stock', name: '現貨預售查詢', status: 'mapping', summary: '統計發貨天數並複製現貨／預售商品 ID。', details: '需要商品詳情與 SKU 層級發貨天數查詢。' },
      { id: 'shipping-next', name: '全店改隔日到貨', status: 'mapping', summary: '按比例選零銷量商品，改 1 天並啟用隔日到貨；支援恢復。', details: '需確認臺灣站隔日到貨渠道、資格條件和可逆變更方式。' },
      { id: 'shipping-gift', name: '贈品與 SKU 聯動', status: 'mapping', summary: '同步主商品與贈品的發貨天數和物流設定。', details: '需對照活動商品關聯、SKU 更新與物流 API。' },
    ],
  },
  {
    id: 'marketing', name: '行銷活動', icon: '🎁', features: [
      { id: 'marketing-bundle', name: '組合促銷', status: 'mapping', summary: '指定商品、購買數、折扣額及每人限購後建立組合活動。', details: '需對照 Bundle Deal API 的商品資格、折扣與活動日期限制。' },
      { id: 'marketing-discount', name: '折扣活動', status: 'mapping', summary: '為在架商品批量建立折扣並檢查活動衝突。', details: '需對照 Discount API 與臺灣站促銷規則。' },
      { id: 'marketing-gift', name: '滿額贈／加購贈', status: 'mapping', summary: '統一發貨天數，建立或更新主商品和贈品活動。', details: '需對照 Add-On Deal、Product 與物流 API。' },
    ],
  },
  {
    id: 'flash', name: '限時特賣', icon: '⚡', features: [
      { id: 'flash-renew', name: '店鋪特賣自動續期', status: 'mapping', summary: '到期前讀取活動商品與價格，按規則建立下一期活動。', details: '需對照 ShopFlashSale API；舊版會先關閉舊活動，重建流程必須處理活動空窗。' },
    ],
  },
  {
    id: 'calculator', name: '利潤計算', icon: '🧮', features: [
      { id: 'calculator-main', name: '利潤與 ROI 計算器', status: 'local', summary: '用售價、成本、費率、匯率及運費計算到手金額、利潤率和 ROI。', details: '計算完全在本機執行，沿用舊版公式並處理零售價和負利潤。', tool: 'calculator' },
    ],
  },
];

export const statuses = {
  local: { label: '可直接使用', className: 'ready' },
  partial: { label: '部分完成', className: 'partial' },
  mapping: { label: '待對接 API', className: 'pending' },
};
