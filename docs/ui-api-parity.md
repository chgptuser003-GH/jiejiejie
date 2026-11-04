# 原版 6.9.9 與 CF 0.9.16：UI／API 對照驗收

依據使用者提供的 `shopee插件助手 10.2.zip`，核對原版 `popup.html`、`dashboard.html`、`topup.html`、`shipping-console.html`、`marketing-console.html`、`product-management.html` 及其 JS；新版依據 `extension/`、`open-platform/` 與臺灣沙盒店鋪實測記錄。本文件只記錄可證實的狀態。「有欄位」不等於「功能可用」，也不代表版面逐像素一致。

## UI 對照

| 畫面 | 原版 | CF 0.9.16 | 尚有差異 |
|---|---|---|---|
| 彈窗 | 7 個工具卡片、站點選擇、狀態；另有原作者帳號／授權系統 | 7 個工具卡片、TW 沙盒標籤、後端連線及授權狀態 | 工具卡片排版接近；原作者帳密系統未移植，改用 Shopee OAuth 和本機配對；多站點尚未做 |
| 廣告控制台 | 12 個導航頁籤，專屬表單、任務進度和日誌 | 12 個導航入口均按原版主要分區重排；部分頁籤有真正沙盒工具 | 原版各頁複雜的彈窗、篩選互動、分區細節及表格尚未完整重建；不能宣稱像素一致 |
| 預算水位線 | 多規則編輯、商品選擇器、時間窗、23:55 動作、日誌 | 多規則表單、新增／移除／複製、在架商品分頁選擇與進行中廣告對照、時間窗與次日欄位聯動、單條規則的樣本數值計算；規則草稿保存在本機 Chrome storage，重開控制台可還原 | 選擇器仍無原版的 ROI 類型、日期、標題、績效排序和跨頁全選；廣告掃描上限 1000 活動；時間窗計算、排程、店鋪寫入與執行日誌未接入；草稿不會在不同電腦之間同步 |
| 發貨／物流 | 備貨天數、物流、現貨預售、隔日達、贈品／SKU 聯動 | 五個入口均有按原版主要分區重排的頁面；可對前 100 件商品做只讀範圍、選取或 ID 核對 | 銷量、特賣、滿額贈排除、渠道選擇、備貨天數詳情、批量寫入、進度與恢復快照未重建 |
| 行銷 | 組合促銷、折扣、滿額贈的獨立頁籤、參數與任務日誌 | 3 個入口均按原版主要表單重排；可只讀核對前 100 件在架商品 | 活動選擇清單、商品資格、衝突提示、寫入與任務日誌未重建 |
| 商品管理、限時特賣 | 商品管理為批量操作、修改標題、物流設定三個工作區入口；限時特賣彈窗有開／關與狀態，賣家中心列表另有刪除操作 | 商品管理有三個導航入口；特賣頁有原版開／關與狀態結構 | 商品管理獨立外框、特賣賣家中心刪除操作、活動 API 與續期排程未重建 |
| 利潤計算器 | 本機輸入、計算、保存 | 本機計算、保存；彈窗與控制台共用 | 細部視覺與浮動模式尚未對齊 |

## 功能及 API 對照

### 廣告控制台十二頁的原版欄位契約

| 頁籤 | 原版輸入與操作 ID；CF 目前已建立相同 ID | 實際接通的行為 |
|---|---|---|
| 全店開啟廣告 | `daily-budget`、`exclude-ids`、`target-value`、`global-rapid-boost`、`start-process`、`start-system-roi`、`query-no-ads-products` | 只讀投放範圍預覽；兩種批量建立按鈕停用 |
| 批量開廣告群組 | `group-roi-target`、`group-daily-budget`、`group-exclude-ids`、`btn-start-ad-groups` | 表單可檢視；建立按鈕停用，官方 GMV Max 尚未證實等價 |
| CPC 監控自動重開 | `monitor-target-ids`、`monitor-cpc-threshold`、`monitor-roi-type`、`monitor-budget`、`monitor-roi-target`、`monitor-rapid-boost`、`monitor-reopen-delay`、`btn-start-cpc-monitor`、`btn-stop-cpc-monitor` | 下方可查績效；監控排程和重開按鈕停用 |
| 批量刪除廣告 | `delete-exclude-ids`、`delete-only-ids`、`btn-delete-all`、`btn-delete-by-ids` | 可按指定或排除商品 ID 只讀預覽最多 1000 個活動；批量刪除按鈕停用 |
| 商品批量操作 | `product-ids`、`exclude-product-ids`、`product-operation-select`、`unlist-sales-max`、`relist-max-count`、`btn-execute-product-operation` | 操作類型切換會顯示對應欄位；下方商品查詢可用，批量寫入停用 |
| 指定商品開廣告 | `manual-ids`、`manual-budget`、`manual-roi`、`manual-rapid-boost`、`btn-open-manual-roi`、`auto-ids`、`auto-budget`、`btn-open-auto-roi` | 原版批量按鈕停用；下方另有已實測的沙盒單件手動選品、auto 競價工具，語義與原版系統 ROI 仍須核對 |
| 批量修改 ROI／預算 | `edit-roi-target`、`edit-roi-rapid-boost`、`edit-roi-exclude-ids`、`edit-roi-only-ids`、`btn-edit-roi-all`、`btn-edit-roi-by-ids`、`edit-budget-target`、`edit-budget-exclude-ids`、`edit-budget-only-ids`、`btn-edit-budget-all`、`btn-edit-budget-by-ids` | 原版按商品 ID 批量修改按鈕停用；下方單件編輯與最多 10 活動的批量預算工具已接入 |
| 加速推廣控制 | `rapid-boost-mode`、`rapid-boost-ids`、`btn-enable-rapid-boost`、`btn-disable-rapid-boost` | 模式切換顯示 ID 欄位；寫入停用，官方 `enhanced_cpc` 尚未證實等於原版加速推廣 |
| 重開廣告 | `reopen-manual-budget`、`reopen-manual-roi`、`reopen-manual-rapid-boost`、`reopen-manual-mode`、`reopen-manual-delay`、`reopen-manual-ids`、`btn-reopen-manual-ads`；系統 ROI 對應 `reopen-auto-*` 欄位 | 手動／系統兩區及模式、延時選項可檢視；刪除後重建流程停用 |
| 批量篩選廣告 | `md-date-preset`、`md-state`、曝光／點擊／CPC／ROI／目標 ROI／花費條件、`md-rapid-boost-filter`、`md-match`、`md-only-ids`、`md-exclude-ids`、預覽／下載／刪除按鈕 | 原版表單及區間欄位聯動已建立，按鈕仍未接線；下方只讀掃描支援部分條件的任一／全部匹配與完整掃描後 CSV 匯出 |
| 廣告健康檢查 | `hc-state`、`btn-healthcheck`、`hc-result` | 原版掃描按鈕停用；下方另有最多 10 頁的只讀資料檢查，不等同蝦皮違規判定 |
| 修改標題 | `product-ids-input`、`product-ids-progress`、`select-product-btn`、`selected-product-info`、`keyword-search-input`、`keywords-table` | 可只讀核對前 100 件在架商品中的指定 ID；標題詳情、寫入和推薦關鍵詞未接入 |

相同 ID 和主要欄位順序方便後續逐項接線，但**不代表原版運作邏輯已移植**。CF 仍需要正式的 API 權限、批量任務、逐筆回查與沙盒驗收。

| 模組 | 已在 CF 接通或實測 | 仍未達到原版能力 |
|---|---|---|
| 商品讀取 | Open Platform 商品列表；TW 沙盒讀到 1 件商品 | 詳情、庫存、銷量、上／下架、刪除、標題、備貨天數及物流渠道的 API 權限與流程 |
| 廣告讀取 | 活動列表、設定、每日／每小時績效；最多 10 頁、1000 個活動的只讀任一／全部部分條件篩選、健康檢查和完整掃描後 CSV 匯出 | 真正無上限全店掃描、完整篩選條件、加速推廣狀態、違規原因、關聯商品標題 |
| 廣告寫入 | 單件手動選品、平台自動競價廣告建立；單件預算修改、暫停／恢復已沙盒實測 | 自訂 ROI 模式、30 件群組、加速推廣、批量建立／刪除／重開、CPC 定時監控及其回滾；最多 10 活動的批量預算 UI 尚待實測 |
| 預算水位線 | 本機規則判定、多規則草稿保存與還原 | 後端排程、規則在不同電腦間同步、讀寫回查、23:55 重置與隔日恢復 |
| 物流、行銷、特賣 | UI 參數預覽 | Product／Logistics／Marketing／Shop Flash Sale 官方端點、App 權限、站點限制與實際沙盒測試 |
| 利潤計算 | 本機公式與設定保存 | 費率仍由使用者輸入；不從平台自動取得 |

## 不可直接照搬的原版資料流

原版依賴 Seller Center 內部 API、Cookie、頁面 Session 及原作者的登入服務。CF 使用 Shopee Open Platform App、店鋪 OAuth、後端簽名和加密 Token Vault。兩者請求結構與可用能力不同；不能把原版網頁接口路徑換成 Open Platform 網域來聲稱已接通。

本輪對官方文件的網頁讀取受到 403 限制，尚未取得 Product、Logistics、Marketing、Shop Flash Sale 端點的最新完整規格。後續需先在 CF App 控制台確認具體端點權限，再逐項實作、沙盒讀寫驗證和回查。刪除、批量修改及續期類流程必須先有對象預覽、逐筆結果與失敗恢復。
