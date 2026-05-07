// 設定檔 - 教會週報管理系統

const CONFIG = {

  // ============================================================
  // 雲端草稿位置（填入後即自動啟用雲端儲存）
  // 留空字串 '' 則使用瀏覽器本地快取（localStorage）
  // ============================================================
  GAS_SYNC_URL: '',  // ← 請填入你的 Google Apps Script Web App 網址

  // 教會基本資訊
  CHURCH_NAME: '台灣基督長老教會林口教會',
  CHURCH_NAME_EN: 'Linkou Presbyterian Church',

  // 固定奉獻帳戶資訊
  BANK_ACCOUNT: '教會奉獻帳戶：彰化銀行林口分行\n戶名：台灣基督長老教會林口教會\n銀行代碼：009　帳號：9689-51-29395500\n若有匯款請通知教會辦公室，謝謝！',

  // LKC1958 排班系統 GAS 端點（獨立於 LKERP 路由）
  LKC1958_GAS_URL: 'https://script.google.com/macros/s/AKfycbx4268IkgwQm2Es0gjDHLU_U9nKJrRMR1-xzbbtuaq08lePLgAQ2wnDRrCeHdy9jNhh/exec',
  LKC1958_TOKEN: 'ChurchApp-2026',

  // 自動儲存間隔（毫秒）
  AUTO_SAVE_INTERVAL: 60000,

  // 草稿最大保存數量
  MAX_DRAFTS: 10,

  // localStorage 金鑰前綴
  DRAFT_KEY_PREFIX: 'bulletin_draft_',

  // 版本
  VERSION: '1.0.0',

  // 台語小組列表
  TW_GROUPS: [
    '葡萄樹A', '葡萄樹B', '恩典團契', '橄欖樹', '松年團契',
    '學青', '棕樹A', '棕樹B', '香柏樹', '提摩太',
    '以斯帖', '芥菜種A', '芥菜種B', '芥菜種C',
    '恩典幸福小組', '棕樹幸福小組'
  ],

  // 主日學班級
  SUNDAY_SCHOOL_CLASSES: [
    '幼小班', '初小班', '中小班', '高小班',
    '青少年班', '成人A班', '成人B班'
  ]
};

// 從 LKERP 載入共用設定（churchAPI 函式，供 LKworship / LKGroup / LKCschedule 使用）
(function loadExternalConfig() {
  const script = document.createElement('script');
  script.src = 'https://jirehwang.github.io/LKERP.github.io/config.js';
  script.onerror = () => console.warn('[Config] 外部設定載入失敗，使用預設設定');
  script.onload = () => console.log('[Config] 外部設定載入成功');
  document.head.appendChild(script);
})();
