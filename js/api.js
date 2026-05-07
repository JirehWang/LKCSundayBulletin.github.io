// API 客戶端 - 教會週報管理系統
// 整合 5 個資料來源；LKC1958 直連，其餘走 LKERP 共用路由

const ChurchAPI = {

  // ----------------------------------------------------------
  // LKC1958 直接呼叫（排班系統有獨立 GAS，不走 LKERP 路由）
  // ----------------------------------------------------------
  async callLKC1958(action, opts = {}) {
    const payload = {
      action,
      token: CONFIG.LKC1958_TOKEN,
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

  // ----------------------------------------------------------
  // LKERP 共用路由（LKworship / LKGroup / LKCschedule）
  // 等候 window.churchAPI 載入最多 5 秒
  // ----------------------------------------------------------
  async callERP(action, params = {}) {
    const deadline = Date.now() + 5000;
    while (typeof window.churchAPI !== 'function' && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (typeof window.churchAPI !== 'function') {
      throw new Error('LKERP churchAPI 尚未載入，請確認網路連線');
    }
    return await window.churchAPI(action, params);
  },

  // ----------------------------------------------------------
  // 從回應物件提取 data（相容多種 GAS 回傳格式）
  // ----------------------------------------------------------
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

      let targetRow = null;
      const targetClean = sundayDate.replace(/-/g, '');
      for (const row of rows) {
        const rowDate = String(row[0] || '');
        const rowClean = rowDate.replace(/[^\d]/g, '');
        if (rowClean === targetClean || rowDate.includes(sundayDate)) {
          targetRow = row;
          break;
        }
      }
      if (!targetRow) targetRow = rows[rows.length - 1] || [];

      const r = {};
      headers.forEach((h, i) => { r[h] = targetRow[i] || ''; });

      return {
        success: true,
        source: 'LKC1958_June_1',
        data: {
          mc: r['司會'] || r['司儀'] || r['領會'] || '',
          choir: r['詩班'] || '',
          usher: r['招待/停車'] || r['招待'] || '',
          loveAgape: r['愛宴同工'] || '',
          chairman: r['主席'] || r['主理'] || '',
          worship: r['領會'] || '',
          communion: r['聖餐'] || '',
          songLeader: r['領詩'] || '',
          raw: r
        }
      };
    } catch (err) {
      console.error('[LKC1958] 錯誤:', err);
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

      const result = await this.callERP('getSchedule', { year, quarter });
      const scheduleData = this._unwrap(result);

      let thisWeekData = null;
      if (Array.isArray(scheduleData)) {
        for (const row of scheduleData) {
          const rowDate = String(row['日期'] || row[0] || '');
          if (rowDate === date || rowDate.includes(date)) {
            thisWeekData = row;
            break;
          }
        }
        if (!thisWeekData && scheduleData.length > 0) {
          thisWeekData = scheduleData[scheduleData.length - 1];
        }
      }

      return {
        success: true,
        source: 'LKworship',
        data: {
          leader: thisWeekData ? (thisWeekData['主領'] || '') : '',
          singers: thisWeekData ? (thisWeekData['配唱'] || '') : '',
          pianist: thisWeekData ? (thisWeekData['司琴'] || '') : '',
          raw: thisWeekData || {}
        }
      };
    } catch (err) {
      console.error('[LKworship] 錯誤:', err);
      return { success: false, source: 'LKworship', error: err.message };
    }
  },

  async fetchWorshipSongs(startDate, endDate) {
    try {
      const result = await this.callERP('getSongs', { startDate, endDate });
      const data = this._unwrap(result) || [];
      return { success: true, source: 'LKworship', data };
    } catch (err) {
      console.error('[LKworship Songs] 錯誤:', err);
      return { success: false, source: 'LKworship', error: err.message };
    }
  },

  // ==========================================
  // LKCschedule - 行事曆
  // ==========================================
  async fetchCalendar() {
    try {
      const result = await this.callERP('load', {});
      const rawData = this._unwrap(result);
      const events = Array.isArray(rawData) ? rawData :
                     (result && Array.isArray(result.events) ? result.events : []);

      return {
        success: true,
        source: 'LKCschedule',
        data: events.map(event => ({
          date: event['日期'] || event.date || '',
          name: event['聚會名稱'] || event.name || '',
          category: event['聚會類別'] || event.category || '',
          sermonTitle: event['講題'] || event.sermonTitle || '',
          speaker: event['講員'] || event.speaker || '',
          scripture: event['經文'] || event.scripture || '',
          callToWorship: event['宣召'] || event.callToWorship || '',
          goldenVerse: event['金句'] || event.goldenVerse || '',
          hymn: event['詩歌/聖詩'] || event['詩歌'] || event['聖詩'] || event.hymn || '',
          notes: event['備註'] || event.notes || '',
          raw: event
        }))
      };
    } catch (err) {
      console.error('[LKCschedule] 錯誤:', err);
      return { success: false, source: 'LKCschedule', error: err.message };
    }
  },

  async fetchCalendarForDate(date) {
    const result = await this.fetchCalendar();
    if (!result.success) return result;

    const events = result.data;
    const twService = events.find(e =>
      (e.date === date || String(e.date).includes(date)) &&
      (e.category === '台語' || e.name.includes('台語') || e.category === '主日')
    );
    const zhService = events.find(e =>
      (e.date === date || String(e.date).includes(date)) &&
      (e.category === '華語' || e.name.includes('華語'))
    );

    const today = new Date(date);
    const threeMonthsLater = new Date(today);
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    const upcomingEvents = events.filter(e => {
      const evDate = new Date(e.date);
      return evDate >= today && evDate <= threeMonthsLater;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      success: true,
      source: 'LKCschedule',
      data: {
        taiwanese: twService || null,
        mandarin: zhService || null,
        upcoming: upcomingEvents
      }
    };
  },

  // ==========================================
  // LKC_Attendance - 點名
  // google.script.run 無法從 GitHub Pages 跨域呼叫
  // 出席人數請手動填入
  // ==========================================
  async fetchAttendance(date) {
    return {
      success: false,
      source: 'LKC_Attendance',
      error: '出席人數請手動填入（跨網域限制，無法自動讀取）'
    };
  },

  // ==========================================
  // LKGroup - 小組
  // ==========================================
  async fetchSmallGroups(date) {
    try {
      const groups = CONFIG.TW_GROUPS;
      const results = {};

      const promises = groups.map(async (groupName) => {
        try {
          const result = await this.callERP('getStats', {
            groupName,
            groupCode: '',
            startDate: 'RAW_MODE'
          });
          const data = this._unwrap(result);
          if (Array.isArray(data) && data.length > 0) {
            const recent = data[data.length - 1];
            results[groupName] = {
              date: recent['日期'] || '',
              attendance: Number(recent['出席人數']) || 0,
              newFriends: Number(recent['新朋友']) || 0
            };
          } else {
            results[groupName] = { date: '', attendance: 0, newFriends: 0 };
          }
        } catch (e) {
          results[groupName] = { date: '', attendance: 0, newFriends: 0, error: e.message };
        }
      });

      await Promise.all(promises);
      return { success: true, source: 'LKGroup', data: results };
    } catch (err) {
      console.error('[LKGroup] 錯誤:', err);
      return { success: false, source: 'LKGroup', error: err.message };
    }
  },

  // ==========================================
  // 整合帶入 - 全部資料
  // ==========================================
  async fetchAll(date) {
    const results = await Promise.allSettled([
      this.fetchCalendarForDate(date),
      this.fetchServiceSchedule(date),
      this.fetchWorshipSchedule(date),
      this.fetchAttendance(date),
      this.fetchSmallGroups(date)
    ]);

    return {
      calendar:    results[0].status === 'fulfilled' ? results[0].value : { success: false, error: results[0].reason?.message },
      service:     results[1].status === 'fulfilled' ? results[1].value : { success: false, error: results[1].reason?.message },
      worship:     results[2].status === 'fulfilled' ? results[2].value : { success: false, error: results[2].reason?.message },
      attendance:  results[3].status === 'fulfilled' ? results[3].value : { success: false, error: results[3].reason?.message },
      smallGroups: results[4].status === 'fulfilled' ? results[4].value : { success: false, error: results[4].reason?.message }
    };
  }
};
