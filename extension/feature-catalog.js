export const modules = [
  {
    id: 'ads', name: '廣告管理', icon: '📣', features: [
      { id: 'ads-all', name: '全店開啟廣告', status: 'partial', summary: '篩選未投放商品，設定每日預算、目標 ROAS 或自動競價後批量建立。', details: '新增在架商品的只讀投放預覽；活動掃描完整時才標示未出現在活動的商品，庫存與建立資格仍未確認。單件自動競價廣告已實測，全店批量仍未完成。', tool: 'all-ads' },
      { id: 'ads-groups', name: '批量開廣告群組', status: 'mapping', summary: '排除已有廣告或零庫存商品，每 30 件組成一組投放。', details: '官方店鋪 GMV Max 與舊版每 30 件商品一組的語義不同，仍需確認等價 API。' },
      { id: 'ads-cpc', name: 'CPC 監控自動重開', status: 'partial', summary: '按 CPC 閾值監控廣告，延時關閉並重建。', details: '每日與每小時績效 API 適配器已完成；監控排程、數據延遲驗證及安全重開流程尚未完成。', tool: 'performance' },
      { id: 'ads-delete', name: '批量刪除廣告', status: 'partial', summary: '按指定或排除商品 ID 批量處理進行中廣告。', details: '最多 10 頁／1000 活動的只讀刪除範圍預覽可逐活動顯示廣告類型、商品 ID、API 對照與資料不明原因，並可下載標記完整／不完整的 CSV 核對表。手動選品刪除端點已有適配器但未沙盒實測；批量刪除按鈕仍停用。' },
      { id: 'ads-specific', name: '指定商品開廣告', status: 'partial', summary: '對指定商品設定預算、目標 ROAS 和投放模式。', details: '單件手動選品、平台自動競價建立已在沙盒實測。原版自動 ROI 區的商品 ID 可帶入下方最多 10 件的安全批量預覽；須在架、廣告掃描完整且沒有既有廣告，確認後才逐件建立並讀回，批量介面尚待沙盒實測。平台自動競價與原版系統 ROI 尚未證實等價；手動 ROI、加速推廣未接通。', tool: 'manual-ad' },
      { id: 'ads-roi', name: '批量修改 ROI／預算', status: 'partial', summary: '以商品或活動 ID 批量修改目標 ROAS 與每日預算。', details: '上方指定或排除商品 ID 可完整掃描手動選品廣告，最多 10 個活動帶入下方安全預覽；仍須另按確認才逐筆修改並讀回，介面尚待沙盒實測。正數目標 ROAS 僅允許 manual 競價且目前目標可讀的活動；auto 競價、ROI=0 的系統模式切換與加速推廣不支援。', tool: 'manual-edit' },
      { id: 'ads-boost', name: '加速推廣控制', status: 'mapping', summary: '批量開關手動 ROAS 廣告的加速推廣。', details: '尚未核實官方 API 有與舊版「加速推廣」完全相同的設定。' },
      { id: 'ads-reopen', name: '重開廣告', status: 'partial', summary: '按指定商品延時重開，保留預算和 ROAS 設定。', details: '舊版採刪除再建立，需先完成快照、預覽和失敗恢復，避免投放中斷。' },
      { id: 'ads-filter', name: '批量篩選廣告', status: 'partial', summary: '依曝光、點擊、花費、CPC、ROAS、狀態等條件篩選與匯出。', details: '原版上方表單已接入最多 10 頁、1000 個活動的只讀查詢，支援日期、活動狀態、指定／排除商品 ID、曝光、點擊、CPC、ROAS、目標 ROAS 與花費的任一／全部匹配；完整掃描可下載活動表及匹配 ID。下方保留簡化只讀工具。加速狀態和批量刪除尚未接通，活動層級績效不等同逐商品績效。', tool: 'ad-filter' },
      { id: 'ads-health', name: '廣告健康檢查', status: 'partial', summary: '掃描活動狀態、異常和商品資訊。', details: '原版上方「開始掃描」及下方工具共用最多 10 頁、1000 個活動的只讀設定、商品狀態與當日績效檢查；結果區分需核對設定、資料未確認與已核對欄位。商品清單只讀前 100 件；零曝光不視為違規。蝦皮違規原因、商品標題與無上限全店掃描尚未接入。', tool: 'ad-health' },
    ],
  },
  {
    id: 'budget', name: '預算水位線', icon: '📈', features: [
      { id: 'budget-rules', name: '預算追加與定時控制', status: 'partial', summary: '依剩餘預算、CPC、ROAS 和上限判斷追加；可設時間窗、日終重置與隔日恢復。', details: '已按原版建立多規則、複製規則、瀏覽器本機草稿保存、在架商品分頁選擇與進行中廣告對照、時間窗與次日恢復的表單聯動，可將單條規則的數值門檻套用到本機樣本預覽；商品選擇尚未按 ROI 類型、日期、標題和績效排序，持久任務、後端排程、廣告讀寫及 23:55 重置尚未接入。', tool: 'budget-preview' },
    ],
  },
  {
    id: 'products', name: '商品管理', icon: '📦', features: [
      { id: 'products-bulk', name: '商品批量操作', status: 'partial', summary: '查詢、上架、下架及刪除商品，可按 ID、狀態和銷量篩選。', details: '商品列表 API 和只讀查詢已完成；批量寫入及刪除尚未接入。', tool: 'products' },
      { id: 'products-title', name: '修改標題', status: 'partial', summary: '逐件或批量修改標題，提供熱詞推薦及廣告關聯處理。', details: '可只讀核對前 100 件在架商品中的指定 ID；商品標題詳情、編輯、熱詞來源和「複製商品後刪原商品」流程仍需逐項對照官方 API。' },
    ],
  },
  {
    id: 'shipping', name: '發貨與物流', icon: '🚚', features: [
      { id: 'shipping-days', name: '批量發貨天數', status: 'partial', summary: '設現貨 1 天或預售 3–15 天，依商品狀態、銷量和活動排除。', details: '已按原版建立模式、範圍、排除、物流聯動與雙排程欄位，可只讀預覽前 100 件上架／下架商品；銷量、特賣、滿額贈、備貨天數寫入和定時任務仍未接入。' },
      { id: 'shipping-channels', name: '物流渠道設定', status: 'partial', summary: '批量開關或調整商品的物流渠道。', details: '可讀取前 100 件在架商品並選取 ID；店鋪可用渠道、商品渠道狀態與寫入端點尚未確認，因此套用按鈕停用。' },
      { id: 'shipping-stock', name: '現貨預售查詢', status: 'partial', summary: '統計發貨天數並複製現貨／預售商品 ID。', details: '可讀取前 100 件在架商品；商品詳情與 SKU 備貨天數未接入，故不計算現貨／預售數量，也不提供 ID 複製。' },
      { id: 'shipping-next', name: '全店改隔日到貨', status: 'partial', summary: '按比例選零銷量商品，改 1 天並啟用隔日到貨；支援恢復。', details: '商品清單完整時可只讀計算比例目標；銷量、隔日到貨渠道、資格與恢復快照尚未接入，寫入停用。' },
      { id: 'shipping-gift', name: '贈品與 SKU 聯動', status: 'partial', summary: '同步主商品與贈品的發貨天數和物流設定。', details: '可在前 100 件在架商品中核對贈品 ID；主商品、活動關聯、SKU 更新、物流和建立活動仍需官方端點。' },
    ],
  },
  {
    id: 'marketing', name: '行銷活動', icon: '🎁', features: [
      { id: 'marketing-bundle', name: '組合促銷', status: 'partial', summary: '指定商品、購買數、折扣額及每人限購後建立組合活動。', details: '已按原版建立欄位及商品範圍切換，可只讀核對前 100 件在架商品；Bundle Deal 資格、活動日期及建立端點尚未驗證。' },
      { id: 'marketing-discount', name: '折扣活動', status: 'partial', summary: '為在架商品批量建立折扣並檢查活動衝突。', details: '已按原版建立欄位及商品範圍切換，可只讀核對前 100 件在架商品；折扣規則、活動衝突與建立端點尚未驗證。' },
      { id: 'marketing-gift', name: '滿額贈／加購贈', status: 'partial', summary: '統一發貨天數，建立或更新主商品和贈品活動。', details: '可只讀核對前 100 件在架商品中的贈品 ID；活動列表、主商品、SKU、備貨天數和建立／更新端點尚未驗證。' },
    ],
  },
  {
    id: 'flash', name: '限時特賣', icon: '⚡', features: [
      { id: 'flash-renew', name: '店鋪特賣自動續期', status: 'mapping', summary: '到期前讀取活動商品與價格，按規則建立下一期活動。', details: '已對照原版彈窗的續期開關與狀態；ShopFlashSale 活動、商品、價格和排程端點尚未驗證。原版在賣家中心列表的刪除操作也尚未重建。' },
    ],
  },
  {
    id: 'calculator', name: '利潤計算', icon: '🧮', features: [
      { id: 'calculator-main', name: '利潤與 ROI 計算器', status: 'local', summary: '用售價、成本、費率、匯率及運費計算到手金額、利潤率和 ROI。', details: '計算完全在本機執行，沿用舊版公式並處理零售價和負利潤；輸入值保存在插件本機，彈窗與控制台共用。', tool: 'calculator' },
    ],
  },
];

export const statuses = {
  local: { label: '可直接使用', className: 'ready' },
  partial: { label: '部分完成', className: 'partial' },
  mapping: { label: '待對接 API', className: 'pending' },
};
