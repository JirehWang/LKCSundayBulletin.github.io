// 主應用控制器 - 教會週報管理系統

const App = {
  _autoSaveTimer: null,

  // ==========================================
  // 初始化
  // ==========================================
  async init() {
    console.log('[App] 初始化教會週報管理系統...');

    // 設定預設日期 (本週日)
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + daysToSunday);
    const sundayStr = nextSunday.toISOString().split('T')[0];

    document.getElementById('bulletinDate').value = sundayStr;
    BulletinModel.init(sundayStr);

    // 設定日期變更事件
    document.getElementById('bulletinDate').addEventListener('change', (e) => {
      BulletinModel.set('date', e.target.value);
      this.updateDateDisplay();
    });

    this.initTabs();
    this.initFormFields();
    this.initButtons();
    this.updateDateDisplay();
    this.syncFormFromModel();
    DraftManager.startAutoSave(() => BulletinModel.get());
    this.showToast('系統已就緒，歡迎使用教會週報管理系統', 'success');
  },

  updateDateDisplay() {
    const date = document.getElementById('bulletinDate').value;
    if (date) {
      const d = new Date(date + 'T00:00:00');
      document.getElementById('dateDisplay').textContent =
        `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
    }
  },

  // ==========================================
  // 標籤頁
  // ==========================================
  initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.tab-panel');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${target}`)?.classList.add('active');
      });
    });
  },

  // ==========================================
  // 表單字段同步
  // ==========================================
  initFormFields() {
    document.addEventListener('input', (e) => {
      const field = e.target.dataset.field;
      if (!field) return;
      BulletinModel.set(field, e.target.value);
    });

    document.addEventListener('change', (e) => {
      const field = e.target.dataset.field;
      if (!field) return;
      BulletinModel.set(field, e.target.value);
    });
  },

  // ==========================================
  // 按鈕
  // ==========================================
  initButtons() {
    document.getElementById('btnFetchAll')?.addEventListener('click', () => this.fetchAll());
    document.getElementById('btnSaveDraft')?.addEventListener('click', () => this.saveDraft());
    document.getElementById('btnLoadDraft')?.addEventListener('click', () => this.showDraftModal());
    document.getElementById('btnExportWord')?.addEventListener('click', () => this.exportWord());
    document.getElementById('btnAddOffering')?.addEventListener('click', () => this.addOfferingRow());
    document.getElementById('btnAddEvent')?.addEventListener('click', () => this.addEventRow());
    document.getElementById('modalClose')?.addEventListener('click', () => this.hideDraftModal());
    document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.hideDraftModal();
    });
  },

  // ==========================================
  // API 帶入
  // ==========================================
  async fetchAll() {
    const date = document.getElementById('bulletinDate').value;
    if (!date) {
      this.showToast('請先選擇日期', 'error');
      return;
    }

    this.showLoading(true);
    this.showToast('正在從各系統帶入資料...', 'info');

    try {
      const results = await ChurchAPI.fetchAll(date);
      BulletinModel.applyAPIData(results);
      this.syncFormFromModel();

      const errors = [];
      if (!results.calendar?.success) errors.push('行事曆');
      if (!results.service?.success) errors.push('服事排班');
      if (!results.worship?.success) errors.push('敬拜團');
      if (!results.attendance?.success) errors.push('點名（請手動填入）');
      if (!results.smallGroups?.success) errors.push('小組');

      if (errors.length > 0) {
        this.showToast(`帶入完成，以下需手動填入：${errors.join('、')}`, 'warning');
      } else {
        this.showToast('全部資料帶入完成', 'success');
      }
    } catch (err) {
      console.error('[App] 帶入失敗:', err);
      this.showToast('帶入失敗：' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  },

  // 主日程序 tab 專用帶入：calendar + service + worship 三個來源一起抓
  async fetchServiceAndCalendar() {
    const date = document.getElementById('bulletinDate').value;
    if (!date) {
      this.showToast('請先選擇日期', 'error');
      return;
    }

    this.showLoading(true);
    this.showToast('正在帶入主日程序資料...', 'info');

    try {
      const [calSettled, svcSettled, worSettled] = await Promise.allSettled([
        ChurchAPI.fetchCalendarForDate(date),
        ChurchAPI.fetchServiceSchedule(date),
        ChurchAPI.fetchWorshipSchedule(date)
      ]);

      const calResult = calSettled.status === 'fulfilled' ? calSettled.value : { success: false, error: calSettled.reason?.message };
      const svcResult = svcSettled.status === 'fulfilled' ? svcSettled.value : { success: false, error: svcSettled.reason?.message };
      const worResult = worSettled.status === 'fulfilled' ? worSettled.value : { success: false, error: worSettled.reason?.message };

      BulletinModel.applyAPIData({ calendar: calResult, service: svcResult, worship: worResult });
      this.syncFormFromModel();

      const failed = [
        !calResult.success && `行事曆（${calResult.error || ''}）`,
        !svcResult.success && `服事排班（${svcResult.error || ''}）`,
        !worResult.success && `敬拜團（${worResult.error || ''}）`
      ].filter(Boolean);

      this.showToast(
        failed.length ? `帶入完成，請手動確認：${failed.join('、')}` : '主日程序資料帶入完成',
        failed.length ? 'warning' : 'success'
      );
    } catch (err) {
      console.error('[App] fetchServiceAndCalendar 失敗:', err);
      this.showToast('帶入失敗：' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  },

  async fetchSection(section) {
    const date = document.getElementById('bulletinDate').value;
    if (!date) {
      this.showToast('請先選擇日期', 'error');
      return;
    }

    this.showLoading(true);
    try {
      let result;
      switch (section) {
        case 'calendar':
          result = await ChurchAPI.fetchCalendarForDate(date);
          if (result.success) {
            BulletinModel.applyAPIData({ calendar: result });
            this.syncFormFromModel();
          }
          break;
        case 'service':
          result = await ChurchAPI.fetchServiceSchedule(date);
          if (result.success) {
            BulletinModel.applyAPIData({ service: result });
            this.syncFormFromModel();
          }
          break;
        case 'worship':
          result = await ChurchAPI.fetchWorshipSchedule(date);
          if (result.success) {
            BulletinModel.applyAPIData({ worship: result });
            this.syncFormFromModel();
          }
          break;
        case 'attendance':
          result = await ChurchAPI.fetchAttendance(date);
          break;
        case 'smallGroups':
          result = await ChurchAPI.fetchSmallGroups(date);
          if (result.success) {
            BulletinModel.applyAPIData({ smallGroups: result });
            this.syncFormFromModel();
          }
          break;
      }

      if (result?.success) {
        this.showToast('資料帶入完成', 'success');
      } else {
        this.showToast('帶入失敗：' + (result?.error || '未知錯誤'), 'error');
      }
    } catch (err) {
      this.showToast('帶入失敗：' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  },

  // ==========================================
  // 草稿
  // ==========================================
  async saveDraft() {
    const data = BulletinModel.get();
    try {
      const saved = await DraftManager.save(data);
      if (saved) {
        this.showToast('草稿已儲存', 'success');
      } else {
        this.showToast('儲存失敗，請確認已選擇日期', 'error');
      }
    } catch (err) {
      this.showToast('草稿儲存失敗：' + err.message, 'error');
    }
  },

  async showDraftModal() {
    const list = document.getElementById('draftList');
    list.innerHTML = '<div class="empty-state">載入中...</div>';
    document.getElementById('modalOverlay').classList.add('show');

    try {
      const drafts = await DraftManager.list();
      list.innerHTML = '';
      if (!drafts || drafts.length === 0) {
        list.innerHTML = '<div class="empty-state">尚無已儲存的草稿</div>';
      } else {
        drafts.forEach(draft => {
          const d = new Date(draft.updatedAt);
          const timeStr = d.toLocaleString('zh-TW');
          const item = document.createElement('div');
          item.className = 'draft-item';
          item.innerHTML = `
            <div class="draft-info">
              <strong>${draft.date}</strong>
              <span class="draft-preview">${draft.preview || ''}</span>
              <small>最後儲存：${timeStr}</small>
            </div>
            <div class="draft-actions">
              <button class="btn-sm btn-primary" onclick="App.loadDraft('${draft.date}')">載入</button>
              <button class="btn-sm btn-danger" onclick="App.deleteDraft('${draft.date}')">刪除</button>
            </div>
          `;
          list.appendChild(item);
        });
      }
    } catch (err) {
      list.innerHTML = `<div class="empty-state">載入失敗：${err.message}</div>`;
    }
  },

  hideDraftModal() {
    document.getElementById('modalOverlay').classList.remove('show');
  },

  async loadDraft(date) {
    try {
      const data = await DraftManager.load(date);
      if (!data) {
        this.showToast('載入失敗', 'error');
        return;
      }
      BulletinModel._current = data;
      document.getElementById('bulletinDate').value = data.date;
      this.syncFormFromModel();
      this.hideDraftModal();
      this.showToast(`草稿 ${date} 已載入`, 'success');
    } catch (err) {
      this.showToast('載入草稿失敗：' + err.message, 'error');
    }
  },

  async deleteDraft(date) {
    if (!confirm(`確定要刪除 ${date} 的草稿？`)) return;
    try {
      await DraftManager.delete(date);
      this.showDraftModal();
      this.showToast('草稿已刪除', 'success');
    } catch (err) {
      this.showToast('刪除失敗：' + err.message, 'error');
    }
  },

  // ==========================================
  // 匯出 Word
  // ==========================================
  async exportWord() {
    const data = BulletinModel.get();
    if (!data.date) {
      this.showToast('請先選擇日期', 'error');
      return;
    }

    this.showLoading(true);
    this.showToast('正在產生 Word 文件...', 'info');

    try {
      const filename = await BulletinExport.generate(data);
      this.showToast(`Word 文件已下載：${filename}`, 'success');
    } catch (err) {
      console.error('[App] 匯出失敗:', err);
      this.showToast('匯出失敗：' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  },

  // ==========================================
  // 表單同步 - 將 Model 資料寫回表單
  // ==========================================
  syncFormFromModel() {
    const data = BulletinModel.get();

    document.querySelectorAll('[data-field]').forEach(el => {
      const path = el.dataset.field;
      const value = this._getNestedValue(data, path);
      if (value !== undefined && value !== null) {
        el.value = String(value);
      }
    });

    this.syncSmallGroupsUI(data.attendance?.smallGroups || {});
    this.syncEventsUI(data.events || []);
    this.syncOfferingUI(data.offeringReport?.monthlyItems || []);
  },

  _getNestedValue(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  },

  syncSmallGroupsUI(groups) {
    Object.entries(groups).forEach(([name, count]) => {
      const el = document.querySelector(`[data-group="${name}"]`);
      if (el) el.value = count || 0;
    });
  },

  syncEventsUI(events) {
    const container = document.getElementById('eventsContainer');
    if (!container) return;
    container.innerHTML = '';
    events.forEach((ev, idx) => {
      this.addEventRow(ev, idx);
    });
  },

  syncOfferingUI(items) {
    const container = document.getElementById('offeringContainer');
    if (!container) return;
    container.innerHTML = '';
    items.forEach((item, idx) => {
      this.addOfferingRow(item, idx);
    });
  },

  // ==========================================
  // 動態新增行
  // ==========================================
  addEventRow(ev = null, idx = null) {
    const container = document.getElementById('eventsContainer');
    if (!container) return;

    const rowIdx = idx !== null ? idx : (container.children.length);
    const div = document.createElement('div');
    div.className = 'dynamic-row';
    div.dataset.idx = rowIdx;
    div.innerHTML = `
      <input type="date" class="form-input"
        value="${ev?.date || ''}"
        onchange="App._updateEvent(${rowIdx}, 'date', this.value)">
      <input type="text" class="form-input"
        value="${ev?.name || ''}"
        oninput="App._updateEvent(${rowIdx}, 'name', this.value)">
      <input type="text" class="form-input flex-2"
        value="${ev?.description || ''}"
        oninput="App._updateEvent(${rowIdx}, 'description', this.value)">
      <button class="btn-icon btn-danger" onclick="App._removeEvent(${rowIdx})" title="刪除">✕</button>
    `;
    container.appendChild(div);
  },

  _updateEvent(idx, field, value) {
    const data = BulletinModel.get();
    if (!data.events[idx]) data.events[idx] = {};
    data.events[idx][field] = value;
  },

  _removeEvent(idx) {
    const data = BulletinModel.get();
    data.events.splice(idx, 1);
    this.syncEventsUI(data.events);
  },

  addOfferingRow(item = null, idx = null) {
    const container = document.getElementById('offeringContainer');
    if (!container) return;

    const rowIdx = idx !== null ? idx : (container.children.length);
    const div = document.createElement('div');
    div.className = 'dynamic-row';
    div.dataset.idx = rowIdx;
    div.innerHTML = `
      <input type="text" class="form-input"
        value="${item?.name || ''}"
        oninput="App._updateOffering(${rowIdx}, 'name', this.value)">
      <input type="text" class="form-input"
        value="${item?.amount || ''}"
        oninput="App._updateOffering(${rowIdx}, 'amount', this.value)">
      <input type="text" class="form-input"
        value="${item?.note || ''}"
        oninput="App._updateOffering(${rowIdx}, 'note', this.value)">
      <button class="btn-icon btn-danger" onclick="App._removeOffering(${rowIdx})" title="刪除">✕</button>
    `;
    container.appendChild(div);
  },

  _updateOffering(idx, field, value) {
    const data = BulletinModel.get();
    if (!data.offeringReport.monthlyItems[idx]) data.offeringReport.monthlyItems[idx] = {};
    data.offeringReport.monthlyItems[idx][field] = value;
  },

  _removeOffering(idx) {
    const data = BulletinModel.get();
    data.offeringReport.monthlyItems.splice(idx, 1);
    this.syncOfferingUI(data.offeringReport.monthlyItems);
  },

  // ==========================================
  // UI 工具
  // ==========================================
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.style.display = show ? 'flex' : 'none';
    }
  }
};

// 頁面載入完成後初始化
document.addEventListener('DOMContentLoaded', () => App.init());
