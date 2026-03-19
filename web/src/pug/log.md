# 擲筊 Moon Blocks - 開發日誌

## 專案概述
使用 Three.js 開發的 3D 擲筊模擬器，具備真實物理效果和互動式 3D 視角。

## 技術架構

### 前端框架
- **模板引擎**: Pug
- **樣式**: Stylus
- **JavaScript**: ES Module
- **3D 引擎**: Three.js 0.160.0

### 核心依賴
- `three` - 3D 渲染引擎
- `GLTFLoader` - 載入 GLB 3D 模型
- `OrbitControls` - 滑鼠互動控制

## 開發歷程

### 階段一：架構確認與樣式統一
1. **確認專案結構**
   - 基礎模板：`/workspace/base.pug`
   - 全域樣式：`/workspace/index.styl`
   - 工具樣式：`/workspace/moonblock/index.styl`

2. **樣式統一為極簡風格**
   - 素色背景 `#f5f5f5`
   - 簡潔卡片式設計
   - 去除漸層和花俏效果

### 階段二：從 CSS 3D 到 Three.js
1. **初始嘗試 CSS 3D Transform**
   - 問題：筊塊不可見，難以控制物理效果

2. **改用 Three.js**
   - 建立 3D 場景、相機、渲染器
   - 實現鳥瞰視角（正上方往下看）
   - 添加光源系統

### 階段三：GLB 模型整合
1. **模型載入方案**
   - 採用 base64 inline 方式避免額外請求
   - 建立 `moonblock-data.js` 存放編碼資料
   - 建立 `build-model-data.sh` 自動化建構腳本

2. **ES Module 架構**
   - 使用 Import Maps 解決模組路徑
   - 從 CDN 載入 Three.js 和相關 addons

3. **模型處理**
   - 尺寸調整：`scale(0.8, 0.8, 0.8)`
   - 材質替換：紅色 MeshStandardMaterial
   - 正反面不同顏色：
     - 平面朝上（陰筊）：深紅 `0xaa1111`
     - 凸面朝上（聖筊/笑筊）：淺紅 `0xff5555`

### 階段四：物理模擬
1. **重力系統**
   - Z 軸為垂直方向

2. **碰撞檢測**
   - 地面碰撞（高度 `0.05`）
   - 四面隱形牆壁（範圍 `3.5`）

4. **靜止判定**
   - 速度閾值檢查
   - 4 秒超時保護

### 階段五：光源設計
1. **環境光**
   - 強度 `0.6`

2. **主方向光**
   - 位置：`(5, 5, 10)`
   - 強度 `1.2`
   - 陰影映射 2048x2048

3. **補光**
   - 側面方向光 `(-5, 2, 5)` 強度 `0.4`

4. **雙聚光燈**
   - 位置 1：`(-3, -3, 8)`
   - 位置 2：`(3, 3, 8)`
   - 強度 `1.5`，角度 30°
   - 柔邊 `0.3`，衰減距離 `20`

### 階段六：視覺效果
1. **地面**
   - 淺灰色 `0xe8e8e8`
   - MeshStandardMaterial
   - 接收陰影

2. **材質設定**
   - 粗糙度 `0.3`（增加反光）
   - 金屬度 `0.4`（增加光澤）
   - 雙面渲染 `DoubleSide`

3. **陰影系統**
   - PCFSoftShadowMap
   - 所有模型啟用投射和接收陰影

### 階段七：動畫與互動
1. **結束動畫**
   - 800ms 緩動至中心位置
   - 並排展示（x: -1.2 和 1.2）
   - 旋轉至 45° 斜角展示
   - easeInOutCubic 緩動函數

2. **結果顯示**
   - 全螢幕半透明覆蓋層
   - 大字顯示結果（聖筊/笑筊/陰筊）
   - 點擊關閉
   - 防止重複顯示（`isShowingResult` flag）

3. **OrbitControls 互動**
   - 左鍵拖曳：旋轉視角
   - 右鍵拖曳：平移畫面
   - 滾輪：縮放（範圍 3-15）
   - 阻尼效果 `0.05`
   - 限制極角避免翻到底板下方

### 階段八：歷史記錄
- 顯示擲筊結果歷史
- 時間戳記錄
- 滾動列表顯示

## 關鍵檔案

### `/workspace/moonblock/index.pug`
- HTML 結構
- Import map 定義
- Three.js 和 GLTFLoader 引入
- moonblock-data.js 引入

### `/workspace/moonblock/index.styl`
- 極簡卡片樣式
- 全螢幕結果 overlay
- 歷史記錄樣式
- 響應式設計

### `/workspace/moonblock/index.js`
- Three.js 場景初始化
- GLB 模型載入與處理
- 物理模擬引擎
- 動畫與互動邏輯
- 結果判定與顯示

### `/workspace/moonblock/moonblock-data.js`
- Base64 編碼的 GLB 模型
- 由 `build-model-data.sh` 自動生成

### `/workspace/moonblock/build-model-data.sh`
- 從 `moonblock.glb` 生成 `moonblock-data.js`
- BSD/macOS 兼容的 base64 語法

## 結果判定邏輯

```javascript
if (兩個都平面朝上) -> 陰筊（神明不同意，凶）
else if (兩個都凸面朝上) -> 笑筊（神明發笑，不算）
else -> 聖筊（神明同意，吉）
```

## 已解決的問題

1. **GLTFLoader 載入錯誤**
   - 從舊版全域 script 改為 ES Module
   - 使用 Import Maps 解決模組路徑

2. **結果畫面重複顯示**
   - 添加 `isShowingResult` 和 `isFinishing` flags
   - 防止 animate 循環中重複調用 `finishThrow()`

3. **模型正反面難以區分**
   - 增加聚光燈打光
   - 提升材質反光效果
   - 給正反面不同顏色

4. **物理效果不真實**
   - 調整彈跳衰減參數
   - 增加摩擦力
   - 縮小圍牆範圍

5. **結束角度問題**
   - 從面向螢幕改為 45° 斜角
   - 更自然的展示效果

## 待優化項目

- 可能需要調整模型尺寸或相機視角
- 可考慮添加音效
- 可考慮添加更多視覺特效（粒子、軌跡等）

## 使用說明

### 開發環境
1. 確保有 `moonblock.glb` 模型檔案
2. 執行 `./build-model-data.sh` 生成資料檔
3. 啟動本地伺服器瀏覽 `index.html`

### 操作方式
- 點擊「擲筊」按鈕或按空白鍵開始
- 拖曳畫面旋轉視角
- 滾輪縮放
- 右鍵拖曳平移
- 點擊結果覆蓋層或按 ESC 關閉

---

最後更新：2025-12-01
