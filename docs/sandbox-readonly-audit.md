# 臺灣沙盒唯讀驗證與原版接口盤點（2026-11-04）

範圍：使用者提供的 `shopee插件助手 10.2.zip`（原版 `manifest.json` 為 6.9.9）、CF 插件及測試 Shop ID `228006723`。本輪只對 `seller.sandbox.test-stable.shopee.tw` 及已授權的 Shopee Open Platform **測試環境**做 GET 查詢；沒有向店鋪送出建立、修改或刪除請求。「沙盒已驗證」只指表內列出的**唯讀子流程**，不表示整個原版功能已複製完成。

## 判定規則與當前證據

- **沙盒已驗證**：本輪從測試店鋪收到實際查詢回應，或在沙盒賣家中心看到相符結果。
- **尚未驗證**：有原版程式碼或介面，但本輪未對沙盒實測；不能由未測推論為不支援。
- **沙盒不支援**：有直接證據證明該項原樣無法在沙盒使用。原版 `manifest.json` 的 `host_permissions`、`content_scripts.matches` 只有正式賣家中心網域，**不包含** `seller.sandbox.test-stable.shopee.tw`。因此原版的頁面注入和依賴它的賣家中心內部接口**不能原樣在此沙盒站點使用**；這不代表 Open Platform 沙盒不支援同類業務能力。

本輪後端 `/health` 回報 `environment=sandbox`、Shop ID `228006723`。唯讀 API `/api/items?status=NORMAL` 回傳 3 件（`803950639`、`803950638`、`846071597`），`has_next_page=false`；`/api/ads?type=all` 回傳 1 個活動（`151139`），`has_next_page=false`。活動設定為 `manual` 手動選品、`auto` 競價、`ongoing`，關聯商品 `846071597`。每日和每小時績效查詢均成功回傳 1 個活動資料。沙盒賣家中心商品頁也顯示 3 件；前兩件是「建立廣告」，`846071597` 是「推廣中」。CF 的原版「僅查詢商品」判定因此得出未有進行中廣告的商品 `803950639`、`803950638`，暫停活動 0 個。**尚未直接驗證原版 `/api/pas/v1/homepage/query/` 的沙盒回應**，故不能宣稱官方產品廣告列表和原版 `new_cpc_homepage` 篩選完全等價。

## 功能逐項狀態

| 原版畫面與操作 | 原版內部接口或資料來源 | 沙盒狀態 | 核對結果／尚缺 |
|---|---|---|---|
| 商品列表、在架商品讀取 | `/api/v3/opt/mpsku/list/v2/get_product_list`、`search_product_list` | 沙盒已驗證 | CF 對應官方 `/api/v2/product/get_item_list` 讀到 3 件；原版內部接口本身未測。 |
| 商品詳情、庫存與備貨天數 | `/api/v3/product/get_product_info`、`/api/v3/product/search_product_list_v2/` | 尚未驗證 | 商品列表無法證明 SKU 詳情、庫存和備貨天數可讀。 |
| 廣告活動列表 | `/api/pas/v1/homepage/query/`，`campaign_type=new_cpc_homepage` | 沙盒已驗證 | CF 官方 `/api/v2/ads/get_product_level_campaign_id_list` 讀到 1 個；原版內部篩選語義仍待對照。 |
| 廣告狀態、商品關聯、預算與競價 | 原版查詢回應 `entry_list`；另有 `/api/pas/v1/setup_helper/get_budget_data_for_edit/` | 沙盒已驗證 | CF 官方 `/api/v2/ads/get_product_level_campaign_setting_info` 讀到狀態、商品 ID、類型和競價；原版預算編輯輔助接口未測。 |
| 「全店開啟廣告 → 僅查詢商品」 | `/api/v3/opt/mpsku/list/v2/get_product_list` + 兩次 `/api/pas/v1/homepage/query/`（`ongoing`、`paused`） | 沙盒已驗證 | CF 官方 API 完整分頁讀取後得到 2 件未有進行中廣告、0 個暫停活動；與沙盒商品頁相符。兩種 API 的完整範圍未證實等價。 |
| 廣告每日／每小時績效讀取 | `/pas/v1/report/get/`、`/api/mydata/v3/dashboard/key-metrics/`、`product-rankings` | 沙盒已驗證 | CF 官方每日／每小時 Ads 報表均回傳 1 個活動；原版報表欄位、計算口徑未逐欄比對。 |
| 廣告健康檢查、特徵與異常 | `/pas/v1/homepage/list_additional_trait/`、`/pas/v1/report/get/` | 尚未驗證 | 基礎活動／報表可讀，但違規原因、額外特徵、商品標題和原版規則未證實。 |
| 批量篩選廣告、預覽與匯出 | `/api/pas/v1/homepage/query/`、`/pas/v1/report/get/` | 尚未驗證 | CF 有只讀篩選程式，但本輪未逐條用沙盒資料驗收任一／全部條件、日期與匯出。 |
| 全店建立自訂／系統 ROI 廣告 | `/pas/v1/product/mass_create/`、`/pas/v1/homepage/publish/`、`/api/pas/v1/product/get_budget_data_for_creation/` | 尚未驗證 | 本輪禁止建立；官方手動選品、平台自動競價與原版 ROI 模式不可直接視為等價。 |
| 批量開 30 件商品廣告群組 | 商品列表、`/pas/v1/product/mass_create/` | 尚未驗證 | 庫存與 30 件分組資格未測；官方店鋪 GMV Max 不是已證實的同等功能。 |
| CPC 監控、刪除與重開 | `/pas/v1/report/get/`、`/pas/v1/homepage/batch_delete/`、`/pas/v1/product/mass_create/` | 尚未驗證 | 報表底層可讀；閾值、排程、刪除、延遲重建未驗證，未執行。 |
| 批量刪除與刪暫停廣告 | `/pas/v1/homepage/batch_delete/` | 尚未驗證 | 本輪禁止刪除；只讀候選清單不代表刪除可用。 |
| 指定商品開廣告 | `/pas/v1/product/mass_create/`、`/pas/v1/homepage/publish/` | 尚未驗證 | 本輪禁止建立；之前的沙盒寫入記錄不作本輪唯讀驗證。 |
| 批量修改 ROI／預算、加速推廣 | `/api/pas/v1/homepage/mass_edit/`、`/api/pas/v1/product/edit/` | 尚未驗證 | 只確認現有設定可讀；未驗證原版模式切換及加速推廣等價性，本輪禁止修改。 |
| 廣告重開 | `/pas/v1/homepage/batch_delete/` + `/pas/v1/product/mass_create/` | 尚未驗證 | 刪除後建立的恢復流程未做，本輪禁止。 |
| 預算水位線查詢與任務 | `/pas/v1/homepage/query/`、`/pas/v1/report/get/`、`/api/pas/v1/homepage/mass_edit/` | 尚未驗證 | 本機規則計算不等於沙盒排程與寫入；本輪只確認 Ads 基礎查詢。 |
| 商品批量上／下架、刪除 | `/api/v3/product/update_product_info`、`update_product/`、`delete_product/` | 尚未驗證 | 本輪禁止寫入。 |
| 標題修改、熱詞推薦與複製商品 | `/api/v3/product/get_product_info`、`update_product_info`、`create_product_info`、`delete_product/`、`/api/pas/v1/setup_helper/list_recommended_keyword/`、`search_keyword/` | 尚未驗證 | 商品詳情與推薦詞未查，寫入禁止。 |
| 發貨天數與現貨／預售查詢 | `/api/v3/product/get_product_info`、`update_product_info` | 尚未驗證 | 商品列表可讀，SKU 備貨天數未讀；不推算現貨／預售。 |
| 物流渠道、隔日到貨與贈品 SKU 聯動 | `/api/v3/listing-upload/component/get_product_channel_info`、`/api/v3/product/pre_check_logistic`、商品更新接口 | 尚未驗證 | 可用渠道、資格、SKU 關聯及寫入未測。 |
| 組合促銷 | `/api/marketing/v3/bundle_deal/`、`item/validate/`、`item/` | 尚未驗證 | 商品底層可讀；活動資格與列表未測，建立禁止。 |
| 折扣活動 | `/api/marketing/v3/public/discount/list/`、`search/`、`/api/marketing/v4/discount/update_seller_discount_items/` | 尚未驗證 | 未查折扣列表與衝突，寫入禁止。 |
| 滿額贈／加購贈 | `/marketing/v3/add_on_deal/main_item_list/`、`sub_item_list/`、`check_main_item/` | 尚未驗證 | 活動與主贈商品關聯未查，寫入禁止。 |
| 限時特賣自動續期與列表刪除 | `/api/marketing/v4/shop_flash_sale/`、`get_shop_flash_sale_list/`、`get_shop_flash_sale_item_id_list/` | 尚未驗證 | 特賣列表、價格與資格未查；續期、刪除禁止。 |
| 利潤計算器 | 本機公式與 Chrome storage | 尚未驗證 | 不依賴沙盒 API；本輪未對照原版畫面及輸入保存。 |
| 原版帳密授權、站點切換與頁面注入 | `http://207.148.74.156/shopeeapp/api`、賣家中心 Cookie／`SPC_CDS`、原版 `manifest.json` | 沙盒不支援 | 原版未列沙盒站點；CF 使用測試 App OAuth，不能複製原作者帳密與正式站點 Cookie 流程。 |

## 接口性質與後續驗收

原版 `/api/pas/...`、`/api/v3/product/...`、`/api/marketing/...` 均為賣家中心頁面使用的內部接口；CF 已驗證的 `/api/v2/product/...`、`/api/v2/ads/...` 為 Open Platform 接口。兩者的 URL、登入方式、回應欄位及可用範圍不同。**本表不把「原版內部接口未在沙盒測過」誤寫成「沙盒不支援」。**

後續順序：先在沙盒逐項驗證商品詳情／SKU、廣告篩選／狀態／績效與原版查詢範圍；再對照每個原版畫面的欄位、預設值、結果、進度與日誌。只讀驗證期間，所有店鋪建立、修改與刪除入口維持停用；未驗證的畫面不標為完成。
