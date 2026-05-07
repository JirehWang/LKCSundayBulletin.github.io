// API 客戶端 - 教會週報管理系統
// 各系統直連各自 GAS，不走 LKERP 中央路由

const ChurchAPI = {

  // 通用直連 GAS（LKERP 格式: { action, token, data }）
  async callGAS(url, action, data = {}) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: CONFIG.SHARED_TOKEN, data })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  // LKC1958 直連（格式略不同： type 在頂層）
  async callLKC1958(action, opts = {}) {
    const payload = {
      action,
      token: CONFIG.SHARED_TOKEN,
      data: opts.data || {},
      ...(opts.type !== undefined && { type: opts.type })
    };
    const res = await fetch(CONFIG.LKC1958_GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  // 解析多種 GAS 回傳格式
  _unwrap(result) {
    if (Array.isArray(result)) return result;
    if (result && result.status === 'success' && result.data !== undefined) return result.data;
    if (result && result.success === true && result.data !== undefined) return result.data;
    return null;
  },

  // ==========================================
  // LKC1958 - 服事排班
  // ==========================================
  async fetchServiceSchedule(sundayDate) {
    try {
      const result = await this.callLKC1958('getAggregatedReport', { type: 'service' });
      const rawData = this._unwrap(result);
      if (!Array.isArray(rawData) || rawData.length === 0) throw new Error('資料格式不符');

      const headers = rawData[0] || [];
      const rows = rawData.slice(1);
      const targetClean = sundayDate.replace(/-/g, '');
      let targetRow = rows.find(row => {
        const clean = String(row[0] || '').replace(/[^\d]/g, '');
        return clean === targetClean || String(row[0]).includes(sundayDate);
      }) || rows[rows.length - 1] || [];

      const r = {};
      headers.forEach((h, i) => { r[h] = targetRow[i] || ''; });

      return {
        success: true, source: 'LKC1958_June_1',
        data: {
          mc:        r['司會'] || r['司儀'] || '',
          zhMc:      r['華語司會'] || r['國語司會'] || r['普通話司會'] || r['華語司儀'] || '',
          pianist:   r['司琴'] || '',
          choir:     r['詩班'] || '',
          usher:     r['招待/停車'] || r['招待'] || '',
          chairman:  r['主席'] || r['主理'] || '',
          songLeader:r['領詩'] || '',
          raw: r
        }
      };
    } catch (err) {
      console.error('[LKC1958]', err);
      return { success: false, source: 'LKC1958_June_1', error: err.message };
    }
  },

  // ==========================================
  // LKworship - 敬拜團
  // ==========================================
  async fetchWorshipSchedule(date) {
    try {
      const d = new Date(date);
      const year = d.getFullYear();
      const quarter = 'Q' + Math.ceil((d.getMonth() + 1) / 3);

      const result = await this.callGAS(CONFIG.LKWORSHIP_GAS_URL, 'getSchedule', { year, quarter });
      const scheduleData = this._unwrap(result);

      let row = null;
      if (Array.isArray(scheduleData)) {
        row = scheduleData.find(r => {
          const rd = String(r['日期'] || r[0] || '');
          return rd === date || rd.includes(date);
        }) || scheduleData[scheduleData.length - 1] || null;
      }

      return {
        success: true, source: 'LKworship',
        data: {
          leader:  row ? (row['主領'] || '') : '',
          singers: row ? (row['配唱'] || '') : '',
          pianist: row ? (row['司琴'] || '') : '',
          raw: row || {}
        }
      };
    } catch (err) {
      console.error('[LKworship]', err);
      return { success: false, source: 'LKworship', error: err.message };
    }
  },

  // ==========================================
  // LKCschedule - 行事曆
  // ==========================================
  async fetchCalendar() {
    try {
      const result = await this.callGAS(CONFIG.LKCSCHEDULE_GAS_URL, 'load', {});
      const rawData = this._unwrap(result);
      const events = Array.isArray(rawData) ? rawData
        : (result && Array.isArray(result.events) ? result.events : []);

      return {
        success: true, source: 'LKCschedule',
        data: events.map(e => ({
          date:         e['日期']    || e.date         || '',
          name:         e['聚會名稱'] || e.name         || '',
          category:     e['聚會類別'] || e.category     || '',
          sermonTitle:  e['講題']    || e.sermonTitle  || '',
          speaker:      e['講員']    || e.speaker      || '',
          scripture:    e['經文']    || e.scripture    || '',
          callToWorship:e['宣召']    || e.callToWorship|| '',
          goldenVerse:  e['金句']    || e.goldenVerse  || '',
          hymn:         e['詩歌/聖詩']|| e['詩歌'] || e['聖詩'] || e.hymn || '',
          notes:        e['備註']    || e.notes        || '',
          raw: e
        }))
      };
    } catch (err) {
      console.error('[LKCschedule]', err);
      return { success: false, source: 'LKCschedule', error: err.message };
    }
  },

  async fetchCalendarForDate(date) {
    const result = await this.fetchCalendar();
    if (!result.success) return result;
    const events = result.data;

    const match = e => e.date === date || String(e.date).includes(date);
    const twService = events.find(e => match(e) && (e.category === '台語' || e.name.includes('台語') || e.category === '主日'));
    const zhService = events.find(e => match(e) && (e.category === '華語' || e.name.includes('華語')));

    const today = new Date(date);
    const limit = new Date(today); limit.setMonth(limit.getMonth() + 3);
    const upcoming = events
      .filter(e => { const d = new Date(e.date); return d >= today && d <= limit; })
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return { success: true, source: 'LKCschedule', data: { taiwanese: twService || null, mandarin: zhService || null, upcoming } };
  },

  // ==========================================
  // LKC_Attendance - 點名（跨域限制，請手動填入）
  // ==========================================
  async fetchAttendance() {
    return { success: false, source: 'LKC_Attendance', error: '出席人數請手動填入' };
  },

  // ==========================================
  // LKGroup - 小組
  // ==========================================
  async fetchSmallGroups(date) {
    try {
      const results = {};
      await Promise.all(CONFIG.TW_GROUPS.map(async groupName => {
        try {
          const result = await this.callGAS(CONFIG.LKGROUP_GAS_URL, 'getStats', {
            groupName, groupCode: '', startDate: 'RAW_MODE'
          });
          const data = this._unwrap(result);
          if (Array.isArray(data) && data.length > 0) {
            const recent = data[data.length - 1];
            results[groupName] = {
              date:        recent['日期'] || '',
              attendance:  Number(recent['出席人數']) || 0,
              newFriends:  Number(recent['新朋友'])  || 0
            };
          } else {
            results[groupName] = { date: '', attendance: 0, newFriends: 0 };
          }
        } catch (e) {
          results[groupName] = { date: '', attendance: 0, newFriends: 0, error: e.message };
        }
      }));
      return { success: true, source: 'LKGroup', data: results };
    } catch (err) {
      console.error('[LKGroup]', err);
      return { success: false, source: 'LKGroup', error: err.message };
    }
  },

  // ==========================================
  // 整合帶入
  // ==========================================
  async fetchAll(date) {
    const [calendar, service, worship, attendance, smallGroups] = await Promise.allSettled([
      this.fetchCalendarForDate(date),
      this.fetchServiceSchedule(date),
      this.fetchWorshipSchedule(date),
      this.fetchAttendance(date),
      this.fetchSmallGroups(date)
    ]);
    const val = r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message };
    return { calendar: val(calendar), service: val(service), worship: val(worship), attendance: val(attendance), smallGroups: val(smallGroups) };
  }
};
