# 擲筊 Moon Blocks - 開發問題與解決方案記錄

本文檔記錄了專案開發過程中所遇到的技術挑戰、除錯過程以及最終的解決方案。

## 1. 物理模擬 (Physics)

### 問題：物理引擎崩潰 (TypeError in ConvexPolyhedron)
*   **症狀**：當筊杯互相碰撞時，Cannon.js 拋出 `TypeError: Cannot read properties of undefined (reading 'x')` 或 `reading 'length'`。
*   **原因**：
    *   直接使用高面數的 GLB 模型頂點生成 `ConvexPolyhedron`。
    *   模型包含重複頂點 (Duplicate Vertices) 或退化面 (Degenerate Faces)，導致物理引擎無法建構有效的凸包。
    *   Cannon.js 的 QuickHull 演算法對這類幾何非常敏感。
*   **嘗試方案**：
    *   嘗試合併頂點 (Merge Vertices) 和降採樣 (Downsampling) -> 效果有限，仍偶爾崩潰。
    *   嘗試改用 `CANNON.Box` -> 穩定但形狀不真實。
*   **最終解法**：
    *   **手動建構凸多面體**：放棄使用原始模型幾何。手動定義一個 8 頂點、12 個面的「楔形體 (Wedge)」來近似筊杯形狀。這保證了幾何的數學完美性。

### 問題：法線朝內 (Inward-facing Normals Warning)
*   **症狀**：Cannon.js 警告 `.faceNormals[...] looks like it points into the shape?`。
*   **原因**：
    *   手動定義的面頂點順序 (Winding Order) 錯誤。
    *   使用了四邊形面 (Quads)，但因頂點不共面 (Non-planar) 導致法線計算歧義。
    *   對 Cannon.js 的右手定則與面法線方向理解有誤。
*   **解決過程**：
    *   將所有四邊形拆解為三角形 (Triangulate)，確保共面。
    *   逐一檢查並翻轉頂點順序，確保 Cross Product 指向物體外部。
    *   發現之前「全面翻轉」的策略錯誤，實際上只有 Top/Bottom 面需要翻轉，側面不需要。

### 問題：筊杯斜卡在地上 (Edge Standing)
*   **症狀**：筊杯落下後經常以不自然的姿勢斜插在地面。
*   **解決方案**：
    *   手動建構的凸多面體大幅簡化了表面，減少了卡住的機會。
    *   調整物理參數：降低摩擦力 (`friction: 0.1`)，增加彈性 (`restitution: 0.8`)，讓其更容易滑動倒下。

### 問題：平躺浮空或凸面陷入 (Floating/Sinking)
*   **症狀**：視覺模型與物理地板之間有縫隙或穿透。
*   **原因**：視覺模型的原點 (Origin) 與物理形狀的幾何中心 (Center of Mass) 不重合。
*   **解決方案**：
    *   在載入 GLB 時，計算所有頂點的 Bounding Box 中心。
    *   將視覺幾何體的頂點反向位移，使整體中心歸零 `(0,0,0)`。

## 2. 視覺效果 (Visuals)

### 問題：雙色顯示 (Two-tone Coloring)
*   **目標**：讓筊杯的平面顯示木頭色，凸面顯示紅色。
*   **嘗試方案**：
    *   **法線偵測**：判斷法線是否朝下 -> 失敗，因法線數據不穩或判定閾值難抓。
    *   **座標偵測**：判斷頂點是否落在 Bounding Box 的極值面上 -> 失敗，容易受模型旋轉影響。
*   **最終解法**：
    *   **材質名稱標記**：在 3D 軟體中直接給平面和凸面指定不同名稱的材質 (`flat`, `curve`)。
    *   程式讀取 `child.material.name`，若含 `flat` 則染白/木頭色，含 `curve` 則染紅。

### 問題：透明背景下的影子
*   **目標**：網頁背景透明，但仍要有地板影子。
*   **解決方案**：
    *   使用 `THREE.ShadowMaterial`。這種材質是透明的，只會渲染接收到的陰影。
    *   將 `this.ground.visible` 設為 `true` (即使它是透明的)，以確保能接收陰影。
    *   只保留主光源 (`spotLight1`) 投射陰影，避免多重影干擾。

## 3. 音效系統 (Audio)

### 問題：連續擲筊無聲 (Second Throw Silence)
*   **症狀**：第一次擲筊有聲音，第二次之後完全靜音。
*   **原因**：
    *   在 `collide` 事件處理中，使用了 `const body = e.body`。
    *   在 Cannon.js 中，`e.body` 指的是「被撞擊的物體」（這裡是地面），而 `e.target` 才是「發出事件的物體」（筊杯）。
    *   第一次撞擊後，地面的 `hasPlayedSound` 旗標被設為 `true`。
    *   後續所有擲筊都在撞擊這個已經「播放過」的地面，因此被過濾掉。
*   **解決方案**：
    *   改用 `const body = e.target`，正確檢查當次擲筊產生的新筊杯物件狀態。

### 問題：聲音重疊雜亂
*   **原因**：筊杯在地上微小彈跳也會觸發播放，且音效檔為長錄音。
*   **解決方案**：
    *   **單次觸發**：每個筊杯在生命週期內只允許播放一次 (`hasPlayedSound` flag)。
    *   **閾值過濾**：撞擊速度 (`relativeVelocity`) 必須大於 `1.0` 才觸發。

### 問題：音效無法播放或路徑錯誤
*   **原因**：使用了錯誤的路徑前綴 (`moonblock/`) 或 `cloneNode` 導致的潛在問題。
*   **解決方案**：
    *   統一使用相對路徑（不含專案目錄名）。
    *   改用 `new Audio(src)` 確保每次播放都是獨立的新實例。

## 4. 介面與程式碼 (UI/Code)

### 問題：變數重複宣告 (SyntaxError)
*   **症狀**：`Identifier 'colorRed' has already been declared`。
*   **原因**：在 `replace` 編輯過程中，未正確清除舊的宣告代碼，導致同一區塊內變數被宣告兩次。
*   **解決方案**：徹底重寫該函數區塊，確保變數作用域與宣告次數正確。

### 問題：手機版列表無法關閉
*   **原因**：使用了 Fixed Positioning 的 Bottom Sheet 但未提供遮罩或關閉按鈕。
*   **解決方案**：在彈出列表頂部動態插入一個「關閉 (X)」按鈕。

---
*Created by Gemini CLI Agent*