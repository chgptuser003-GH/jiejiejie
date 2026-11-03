# CF App 本機沙盒使用說明

本專案優先對接 CF 測試 App（Partner ID `1251151`）與臺灣沙盒店鋪 `228006723`。現在的插件是**開發預覽版**：利潤計算和預算規則預覽可離線使用；商品、廣告活動與績效查詢需要本機後端、App 密鑰和店鋪 OAuth 授權。控制台列出舊插件 23 項功能及狀態；單件廣告建立和修改預算已接入，批量和定時功能尚未完成。

## 建置與測試

在 `open-platform/` 目錄執行：

```powershell
node --test
node scripts/build-extension.js
```

Chrome 的「管理擴充功能」開啟開發人員模式後，可選擇 `dist/extension/` 作為未封裝擴充功能載入。這是本地開發安裝，尚未發佈到 Chrome 線上應用程式商店。
已載入舊版 `dist/extension/` 的使用者，重新建置後到 `chrome://extensions` 按該擴充功能的「重新載入」，再打開彈窗並點「開啟控制台」。

本機 Chrome 目前使用 `C:\Users\aa\Desktop\extension` 作為未封裝插件目錄。2026-11-03 已將 0.9.2 建置檔同步到該目錄；Chrome 仍需在 `chrome://extensions` 對「CF 蝦皮營運助手（測試版）」按一次「重新載入」，才會顯示新版。

## 後端配置

在這台 Windows 電腦上，可從 PowerShell 執行 `open-platform/scripts/start-sandbox.ps1`。腳本已填入 CF 測試 Partner ID、沙盒 Shop ID 和 `https://phnix.tech/` 回呼網址，只會詢問測試 Partner Key。如控制台的 HTTPS 回呼網址不同，可加上 `-RedirectUrl 'https://你的網址/'`。輸入 Partner Key 時畫面不顯示；密鑰不寫入專案。Token 加密金鑰由 Windows 使用者保護，資料存於本機 `%LOCALAPPDATA%/CF-Shopee-Assistant/`。腳本視窗需保持開啟，插件才能連接 `127.0.0.1:8787`。

後端啟動後，複製視窗顯示的**插件配對碼**到插件「連線設定與測試工具」，按「儲存配對碼」，再按「授權測試店鋪」。蝦皮授權完成後可執行 `open-platform/scripts/verify-sandbox.ps1`，只讀檢查商品與廣告活動；亦可在插件中按「查看在架商品」和「查看廣告活動」。2026-11-03 已實測 CF App 在 Shop ID `228006723` 的 OAuth、商品列表（1 件，ID `846071597`），並建立單件沙盒廣告 `151139`。活動列表、設定及每日／每小時績效均查詢成功；預算編輯已實測 85 → 90 → 85，暫停／恢復已實測 `ongoing` → `paused` → `ongoing`。此活動的 `auto` 競價不支援直接修改目標 ROAS；刪除、批量和其他寫入權限尚未驗證。

從 Shopee Open Platform 控制台取得測試 Partner ID／Key，在**自己電腦的環境變數或密鑰管理服務**配置：

| 名稱 | 用途 |
|---|---|
| `SHOPEE_PARTNER_ID` | CF App 的測試 Partner ID |
| `SHOPEE_PARTNER_KEY` | 測試 Key；只交給後端進程 |
| `SHOPEE_SHOP_ID` | 臺灣沙盒店鋪 ID |
| `SHOPEE_REDIRECT_URL` | 控制台已設定的 HTTPS 測試回呼網址 |
| `SHOPEE_VAULT_KEY_BASE64` | 32 位元組隨機加密金鑰的 Base64 表示 |
| `SHOPEE_PAIR_TOKEN` | 可選；固定插件配對碼，若省略則每次啟動隨機產生 |

執行 `node bin/server.js` 後，後端只監聽 `http://127.0.0.1:8787`。把後端顯示的**配對碼**輸入插件；配對碼不是 Shopee Partner Key。授權測試店鋪後，插件可發出只讀查詢。Token 會加密儲存在後端 `data/tokens.json`，插件只保存配對碼。

本地檔案式 Token Vault 適用於單進程開發。正式部署還需 HTTPS 後端、資料庫／密鑰管理、任務排程、日誌和監控。GitHub 倉庫目前公開，但尚未加入 `LICENSE`；在選定授權條款前，不應將原始碼標為已完成開源授權。舊插件原碼沒有上傳。

## 換電腦時

從 [GitHub 倉庫](https://github.com/chgptuser003-GH/jiejiejie) 下載原始碼，在新電腦的 `open-platform/` 執行 `node --test` 及 `node scripts/build-extension.js`，再把該電腦的 `dist/extension/` 載入 Chrome。執行 `scripts/start-sandbox.ps1` 時，只在新電腦視窗輸入測試 Partner Key；使用新產生的配對碼連接插件，並重新授權沙盒店鋪。舊電腦 `%LOCALAPPDATA%/CF-Shopee-Assistant/` 中的加密 Token 與配對資料不可直接複製到新電腦使用。
