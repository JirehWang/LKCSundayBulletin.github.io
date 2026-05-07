// 草稿管理 - 教會週報管理系統
// 使用 localStorage 主要儲存，可選擇 GAS 雲端同步

const DraftManager = {

  // 儲存草稿
  save(data) {
    if (!data.date) {
      console.warn('[Draft] 無日期，無法儲存草稿');
      return false;
    }

    try {
      const key = CONFIG.DRAFT_KEY_PREFIX + data.date;
      const toSave = {
        ...data,
        updatedAt: new Date().toISOString()
      };

      localStorage.setItem(key, JSON.stringify(toSave));

      // 更新草稿索引
      this._updateIndex(data.date);

      // 嘗試雲端同步
      if (CONFIG.GAS_SYNC_URL) {
        this._syncToCloud(toSave).catch(err =>
          console.warn('[Draft] 雲端同步失敗:', err)
        );
      }

      return true;
    } catch (err) {
      console.error('[Draft] 儲存失敗:', err);
      return false;
    }
  },

  // 載入草稿
  load(date) {
    try {
      const key = CONFIG.DRAFT_KEY_PREFIX + date;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.error('[Draft] 載入失敗:', err);
      return null;
    }
  },

  // 刪除草稿
  delete(date) {
    try {
      const key = CONFIG.DRAFT_KEY_PREFIX + date;
      localStorage.removeItem(key);
      this._removeFromIndex(date);
      return true;
    } catch (err) {
      console.error('[Draft] 刪除失敗:', err);
      return false;
    }
  },

  // 取得草稿列表 (最近 10 筆)
  list() {
    try {
      const index = this._getIndex();
      return index.map(date => {
        const draft = this.load(date);
        return {
          date,
          updatedAt: draft?.updatedAt || '',
          preview: draft?.taiwanese?.sermonTitle || draft?.mandarin?.sermonTitle || ''
        };
      }).filter(d => d !== null);
    } catch (err) {
      console.error('[Draft] 列表失敗:', err);
      return [];
    }
  },

  // 取得索引
  _getIndex() {
    try {
      const raw = localStorage.getItem('bulletin_draft_index');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  // 更新索引
  _updateIndex(date) {
    let index = this._getIndex();
    index = index.filter(d => d !== date);
    index.unshift(date);
    if (index.length > CONFIG.MAX_DRAFTS) {
      const removed = index.splice(CONFIG.MAX_DRAFTS);
      removed.forEach(d => localStorage.removeItem(CONFIG.DRAFT_KEY_PREFIX + d));
    }
    localStorage.setItem('bulletin_draft_index', JSON.stringify(index));
  },

  // 從索引移除
  _removeFromIndex(date) {
    let index = this._getIndex();
    index = index.filter(d => d !== date);
    localStorage.setItem('bulletin_draft_index', JSON.stringify(index));
  },

  // 雲端同步
  async _syncToCloud(data) {
    if (!CONFIG.GAS_SYNC_URL) return;
    const response = await fetch(CONFIG.GAS_SYNC_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveDraft', data })
    });
    return response;
  },

  // 從雲端載入
  async loadFromCloud(date) {
    if (!CONFIG.GAS_SYNC_URL) return null;
    try {
      const url = `${CONFIG.GAS_SYNC_URL}?action=loadDraft&date=${date}`;
      const response = await fetch(url);
      const data = await response.json();
      return data;
    } catch (err) {
      console.error('[Draft] 雲端載入失敗:', err);
      return null;
    }
  },

  // 自動儲存計時器
  _autoSaveTimer: null,

  startAutoSave(getDataFn) {
    this.stopAutoSave();
    this._autoSaveTimer = setInterval(() => {
      const data = getDataFn();
      if (data && data.date) {
        const saved = this.save(data);
        if (saved) {
          console.log('[Draft] 自動儲存完成:', data.date);
        }
      }
    }, CONFIG.AUTO_SAVE_INTERVAL);
  },

  stopAutoSave() {
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
  }
};
