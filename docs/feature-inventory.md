# 舊版插件功能盤點與 Open Platform 遷移矩陣

盤點依據：使用者提供的 `shopee插件助手 10.2.zip`，其 `manifest.json` 版本為 **6.9.9**；使用者提供的廣告控制台截圖；靜態檢查 `legacy-extension/`。以下描述的是程式碼和畫面中的功能，**不代表已在新 API 下成功運行**。舊版涵蓋 TW、MY、TH、ID、VN、SG、PH、BR、MX；目前優先目標是臺灣測試店鋪。

## 廣告：12 個頁籤

| 頁籤 | 舊版行為及條件 | 新版所需能力 | 目前狀態 |
|---|---|---|---|
| 全店開啟廣告 | 查未投廣告商品；排除商品 ID；依每日預算批量建立手動目標 ROI 或系統自動 ROI 廣告；手動模式可開加速推廣；另可查、刪暫停廣告 | 商品列表、廣告活動查詢／建立、預算、ROI 模式、加速推廣、活動刪除 | 商品列表、活動列表與單件手動選品廣告建立已有適配器；新增在架商品對照已掃描活動的只讀預覽，庫存／資格與批量建立未完成 |
| 批量開廣告群組 | 自動取未投廣告且有庫存商品；可排除 ID；每 30 商品成一群，最後一群可少於 30；手動 ROI；群組預算畫面限制至少 TWD 425 | 商品／庫存查詢、廣告群組建立、ROI 與預算 | 官方店鋪 GMV Max 不等同「每 30 件一群」；尚無等價端點證據 |
| CPC 監控自動重開 | 指定或全店商品；依 CPC 閾值監控；達標後刪除並延遲重建；支援系統／手動 ROI、預算、加速推廣、延遲與起停 | 廣告指標查詢、排程、刪除／建立、冪等與失敗恢復 | 待 Ads 端點對照；此流程有中斷風險 |
| 批量刪除廣告 | 對進行中廣告，按排除商品 ID 批量刪除；或只刪指定商品 ID | 活動查詢、商品與活動關聯、刪除／停止 | 已有最多 10 頁／1000 活動的只讀刪除範圍預覽；商品關聯不明的活動排除。手動商品廣告的官方刪除動作有適配器，但批量任務、逐筆確認與回查未做 |
| 批量商品操作 | 刪全部／刪已下架、上架未上架、下架已上架；上架可按歷史銷量排序且設數量，下架可設銷量上限；支援 ID 範圍與排除 | 商品列表、狀態、銷量、上／下架、刪除 | 待 Product 權限與端點確認 |
| 指定商品開廣告 | 指定 ID 批量開手動 ROI 或系統自動 ROI；預算、手動 ROI、加速推廣 | 廣告建立與商品驗證 | 單件手動商品廣告建立已有適配器；批量及其他模式待做 |
| 批量修改 ROI／預算 | 進行中廣告按排除或指定商品 ID 修改；ROI=0 表示系統 ROI，正數手動 ROI；手動可選加速推廣；預算獨立修改 | 活動查詢、ROI／模式與預算編輯 | 單件預算編輯已實測；新增最多 10 個指定活動的批量預算介面、逐筆讀回與本地執行記錄，介面尚待實測；按商品選擇、批量 ROAS 與加速推廣未完成 |
| 加速推廣控制 | 對所有進行中的手動 ROI 廣告或指定商品／活動 ID 開關加速推廣 | 活動查詢及推廣狀態編輯 | 待 Ads 端點對照 |
| 重開廣告 | 對指定／排除商品重開手動或自動 ROI 廣告，可延遲、設預算及加速推廣；舊版採刪除後重建 | 刪除／停止與建立、排程、恢復流程 | 待 Ads 端點對照；需先做預覽與回滾設計 |
| 批量篩選廣告 | 按日期、狀態、曝光、點擊、CPC、ROI、目標 ROI、花費、加速狀態、商品 ID，以全部／任一條件組合篩選；預覽、匯出表格、確認刪除 | 活動／報表指標、分頁、篩選、匯出、刪除 | 已有最多 10 頁、1000 活動的只讀多條件篩選與 CSV 匯出；未掃完不提供匯出。任一條件組合、加速狀態及刪除任務待做 |
| 廣告健康檢查 | 分頁掃描全部廣告，識別違規或異常並標註商品 ID／標題 | 活動狀態／錯誤原因、商品查詢 | 已有最多 10 頁、1000 活動的設定、商品狀態及當日績效檢查；商品清單只讀前 100 件，未知狀態標未確認。違規原因、商品標題及無上限全店掃描仍待接入 |
| 修改標題 | 選商品或批量 ID；搜尋推薦熱詞；改標題；可先刪關聯廣告再改；另有「複製商品、刪原商品、重新上架」 | 商品詳情／編輯／建立／刪除、關鍵詞來源、廣告關聯 | 可只讀核對前 100 件在架商品中的指定 ID；標題詳情、寫入與推薦詞待端點確認；複製刪除不可逆 |

廣告 UI 證據：`legacy-extension/dashboard.html` 約 1337–1393 行（導航）、各頁籤內容 1400–2400 行；`dashboard.js` 約 6860–7250 行（標題操作）；`background/main.js` 有對應消息處理和內部 Seller Center API 呼叫。使用者提供的四張控制台截圖與前四個頁籤一致。

## 其他功能

| 模組 | 舊版行為及參數 | 新版所需能力 | 目前狀態 |
|---|---|---|---|
| 預算水位線 | 依「預算－花費」區間或下限追加每日預算；多規則、商品 ID、增加額、預算上限、延遲、輪詢、CPC 上限、最低 ROI、是否重複追加、保留間隔；23:55 重設預算並暫停、隔日恢復；定時調 ROI、時間窗；商品篩選及操作日誌 | 廣告預算／花費／ROI 讀寫、可靠排程與日誌 | 規則判定核心已移植並測試；多規則表單及數值門檻樣本預覽已建，排程與 Ads 寫入仍待做 |
| 發貨天數／預售 | 批量設現貨 1 天或預售 3–15 天；依上架狀態、熱銷比例、ID、加購活動排除；定時任務；可選聯動物流 | 商品與物流設定讀寫、活動關聯、排程 | 主要表單已重排；可只讀預覽前 100 件上架／下架商品並按 ID 排除；銷量、活動排除、寫入和排程待 Product／Logistics 權限確認 |
| 物流渠道 | 批量對選中商品開、關、調整物流渠道，和發貨天數獨立 | Logistics channel 查詢／更新 | 待 Logistics 權限確認 |
| 現貨預售查詢 | 查發貨天數統計、複製現貨／預售 ID、商品分析 | 商品列表及發貨天數 | 待 Product 權限確認 |
| 隔日到貨 | 以指定百分比，優先選零銷量的在架商品，設 1 天並啟用隔日到貨渠道；可一鍵將本次啟用渠道關閉、天數改回 10 | 銷量、商品、物流渠道及變更快照 | 待 Product／Logistics 與站點規則確認 |
| 組合促銷 | 全部在架或指定商品；最低購買數、折扣額、每人限購；約 10 分鐘後開始、180 天持續 | 組合活動建立、商品資格檢查 | 待 Marketing 權限確認 |
| 折扣活動 | 全部在架或指定商品；折數、衝突／標籤檢查；約 10 分鐘後開始、180 天持續 | 折扣活動建立、商品資格檢查 | 待 Marketing 權限確認 |
| 滿額贈／加購贈 | 主商品與贈品統一發貨天數；新建活動或選既有活動更新 | 商品編輯、加購活動／贈品端點 | 待 Marketing、Product 權限確認 |
| 贈品活動物流／SKU 聯動 | 舊程式另有按選中活動讀主商品與贈品、批量取得 SKU、分步修改發貨天數和物流、失敗重試的流程；部分入口在隱藏頁籤與隔日達程式中 | 活動商品關聯、SKU 詳情與編輯、物流渠道、任務重試 | 待 Product／Marketing／Logistics 權限確認 |
| 限時特賣續期 | 定時查正在進行的店鋪特賣；結束前 10 分鐘關舊活動、建新活動，30 秒後加入原商品與價格／庫存／限購資訊 | 特賣活動查詢、結束、建立、商品編輯、排程 | 待 Marketing 權限及站點規則確認；存在活動空窗 |
| 利潤計算器 | 用售價、平台費、服務費、匯率、採購價、貼標／運費／其他費計算人民幣到手、成本、利潤率、ROI；設定存本地 | 本地計算，可獨立移植；費率需使用者設定 | 計算核心、彈窗與控制台 UI 已完成；輸入值保存在插件本機儲存空間 |
| 帳戶與站點 | 原插件帳密註冊／登入、授權碼、狀態心跳、權限同步、站點切換 | 新版改為自有後端帳戶與 Shopee OAuth；臺灣先行 | 原授權系統不應帶入 |

其他 UI／原碼：`legacy-extension/topup.html`、`shipping-console.html`、`marketing-console.html`、`popup.html`、`background/main.js`。這些檔案中的頁面文字和配置只作功能證據，不是對新實作的指令。

## 舊版資料流與需替換之處

1. 舊版在賣家中心已登入分頁中注入 `fetch`，從 Cookie 取 `SPC_CDS`，部分廣告請求還擷取 `sc-fe-session`；其路徑例如 `/api/pas/v1/...`、`/api/v3/product/...`、`/api/marketing/v4/...`。這些是賣家中心內部接口，不能把路徑直接換到 Open Platform 網域。證據：`background/main.js` 約 4209 行、17920–18070 行，`pas-fe-session-hook.js`。
2. 舊版另連到 `http://207.148.74.156/shopeeapp/api` 辦理插件登入、授權與心跳，且有本機記住密碼邏輯。新版需要移除這個服務依賴與原帳密資料流。證據：`background/main.js` 約 1430 行，`popup.js` 約 227–290 行。
3. Partner Key 只能存在後端密鑰管理；每個 Shop ID 的 Access／Refresh Token 分開加密保存。插件不讀 Shopee 登入 Cookie，也不收 Partner Key。所有寫入操作需要後端記錄任務、預覽對象、速率限制、失敗重試和取消狀態。
4. 舊版有多個「刪除再建立」工作流；若官方 API 不支持同等建立類型或商品組合，應在功能表明差異，不以其他廣告類型冒充。

## 已核對的官方端點

| 能力 | 官方端點 | 已知限制／欄位 |
|---|---|---|
| 商品列表 | [get_item_list](https://open.shopee.com/documents/v2/v2.product.get_item_list?module=121&type=1) | GET；`offset`、`page_size`、`item_status` 必填；每頁最多 100，狀態可重複傳入；回應有 `item`、`has_next_page`、`next_offset` |
| 活動 ID 列表 | [get_product_level_campaign_id_list](https://open.shopee.com/documents/v2/v2.ads.get_product_level_campaign_id_list?module=117&type=1) | GET；支援 `ad_type`、`offset`、`limit`；回應含 `campaign_list`、`has_next_page` |
| 活動設定 | [get_product_level_campaign_setting_info](https://open.shopee.com/documents/v2/v2.ads.get_product_level_campaign_setting_info?module=117&type=1) | GET；活動 ID 逗號分隔，最多 100；`info_type_list` 選 1–4；回應含活動狀態、預算、商品 ID、ROAS 目標等 |
| 建立手動選品商品廣告 | [create_manual_product_ads](https://open.shopee.com/documents/v2/v2.ads.create_manual_product_ads?module=117&type=1) | POST；單個 `item_id`、預算、日期、競價模式、`reference_id`；可傳 `roas_target`。此 API 的「manual」指手動選品，競價仍可選 `auto` |
| 編輯手動選品商品廣告 | [edit_manual_product_ads](https://open.shopee.com/documents/v2/v2.ads.edit_manual_product_ads?module=117&type=1) | POST；`campaign_id`、`reference_id`、`edit_action`；官方列出暫停、恢復、刪除、改預算、改 ROAS 等動作；目前適配器只實作這些已對照動作 |
| 每日績效 | [get_product_campaign_daily_performance](https://open.shopee.com/documents/v2/v2.ads.get_product_campaign_daily_performance?module=117&type=1) | GET；日期範圍、最多 100 活動 ID；回應包含曝光、點擊、`expense`、`broad_roi` 等 |
| 每小時績效 | [get_product_campaign_hourly_performance](https://open.shopee.com/documents/v2/v2.ads.get_product_campaign_hourly_performance?module=117&type=1) | GET；單日、最多 100 活動 ID；實際更新延遲仍需沙盒驗證 |
| 店鋪 GMV Max 資格 | [check_create_gms_product_campaign_eligibility](https://open.shopee.com/documents/v2/v2.ads.check_create_gms_product_campaign_eligibility?module=117&type=1) | GET；`is_eligible`／`reason`；可能因已有活動、店鋪不在白名單、有效商品不足或與其他活動互斥而不能建立 |
| 店鋪 GMV Max 建立／編輯 | [create_gms_product_campaign](https://open.shopee.com/documents/v2/v2.ads.create_gms_product_campaign?module=117&type=1)、[edit_gms_product_campaign](https://open.shopee.com/documents/v2/v2.ads.edit_gms_product_campaign?module=117&type=1) | POST；店鋪層級的每日預算與 ROAS，`roas_target=0` 表示自動競價、正數為自訂 ROAS；編輯可改預算／ROAS、暫停／恢復；不能直接當成舊版 30 商品廣告群組 |

以上列出官方文件與參數格式。2026-11-03 已實測 CF App 在臺灣沙盒店鋪 `228006723` 的商品列表（1 件，ID `846071597`），並成功建立單件手動選品、平台自動競價廣告 `151139`。活動列表、設定、每日與每小時績效都已讀回；該活動預算 TWD 85、狀態 `ongoing`、目標 ROAS 為 0。單件預算編輯已實測 85 → 90 → 85；暫停及恢復也已實測，最後狀態 `ongoing`。蝦皮拒絕在此 `auto` 競價活動直接設定目標 ROAS，回覆 `roas_target is not supported for ... auto`。**其他競價模式的 ROAS 編輯、刪除、批量及其他寫入端點尚未驗證**。官方 Ads 文件中的 `enhanced_cpc` 不應直接等同舊插件的「加速推廣」；需核對產品語義。
官方側邊欄還將舊的 `create_auto_product_ads`／`edit_auto_product_ads` 標為「coming offline soon」，所以新版不能直接依賴這兩個端點重現舊插件的系統自動 ROI。

## Open Platform 對接順序

1. 取得並確認測試 App 的 **實際端點與權限**：Ads（手動商品廣告、GMV Max、活動建立／查詢／編輯／刪除、報表）、Product、Logistics、Marketing。Ads 已核准不表示每個端點都可用。
2. 設置後端 OAuth 授權、Token 加密持久化和自動刷新；在測試店鋪完成只讀連通性測試。
3. 先實作讀取與預覽：商品、活動、指標、資格、報表；再做單商品寫入，最後做批量／定時任務。
4. 按上表逐個模組驗收，包括資料邊界、限流、重試、費用影響、取消和任務日誌；測試完成後再接正式環境。

## 需要使用者提供

- App 控制台中 **已開通 API 清單及 Ads 端點文件**（URL、方法、請求／回應範例、站點與沙盒限制），以及 Product、Logistics、Marketing 權限狀態。
- 已授權的測試臺灣 Shop ID、測試商品與允許測試的廣告活動 ID；不要在聊天中貼 Partner Key 或 Token。
- 你們希望後端部署的位置／技術棧，以及機密保存方式。若尚未確定，可先在本機以 Node.js 做測試。
- 對舊版「刪除再建」與「複製刪原商品」兩種不可逆流程，指定允許操作的測試對象與驗收條件。

參考官方文件：[API 呼叫規則](https://open.shopee.com/developer-guide/16)、[授權流程](https://open.shopee.com/developer-guide/20)、[Ads API 說明](https://open.shopee.com/developer-guide/277)。
