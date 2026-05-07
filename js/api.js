// API 客戶端 - 教會週報管理系統
// 整合 5 個資料來源；LKC1958 直連，其餘走 LKERP 共用路由

const ChurchAPI = {

  // ----------------------------------------------------------
  // LKC1958 直接呼叫
  // 格式：application/x-www-form-urlencoded, payload=<JSON>
  // payload: { action, token, data: { ...params } }
  // GAS 後端讀取 e.parameter.payload 或 JSON.parse(postData.contents)
  // ----------------------------------------------------------
  async callLKC1958(action, data = {}) {
    const payload = {
      action,
      token: CONFIG.LKC1958_TOKEN,
      data   // { type: 'service' } 等
    };
    const formBody = 'payload=' + encodeURIComponent(JSON.stringify(payload));
    const res = await fetch(CONFIG.LKC1958_GAS_URL, {
      method:   'POST',
      headers:  { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:     formBody,
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();  // { status:'success', data: matrix }
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
  // GAS 回傳：{ status:'success', data:[[headers],[row],...] }
  // ==========================================
  async fetchServiceSchedule(sundayDate) {
    try {
      const result = await this.callLKC1958('getAggregatedReport', { type: 'service' });
      const rawData = this._unwrap(result);
      if (!Array.isArray(rawData) || rawData.length === 0) throw new Error('資料格式不符');

      const headers = rawData[0] || [];
      const rows = rawData.slice(1);

      // 支援多種日期格式：YYYY-MM-DD、YYYY/M/D、YYYYMMDD 等
      let targetRow = null;
      const targetClean = sundayDate.replace(/-/g, '');
      for (const row of rows) {
        const rowDate = String(row[0] || '');
        const rowClean = rowDate.replace(/[^\d]/g, '');
        if (rowClean === targetClean || rowDate.startsWith(sundayDate)) {
          targetRow = row;
          break;
        }
      }
      if (!targetRow) targetRow = rows[rows.length - 1] || [];

      const r = {};
      headers.forEach((h, i) => { r[h] = targetRow[i] || ''; });

      console.log('[LKC1958] 欄位對應:', Object.keys(r));

      return {
        success: true,
        source: 'LKC1958_June_1',
        data: {
          mc:         r['台語司會'] || r['司會'] || r['司儀'] || r['領會'] || '',
          pianist:    r['司琴'] || '',
          choir:      r['詩班'] || '',
          usher:      r['招待/停車'] || r['招待'] || '',
          loveAgape:  r['愛宴同工'] || '',
          chairman:   r['主席'] || r['主理'] || '',
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
        const targetClean = date.replace(/-/g, '');
        for (const row of scheduleData) {
          const rowDate = String(row['日期'] || row[0] || '');
          const rowClean = rowDate.replace(/[^\d]/g, '');
          if (rowClean === targetClean || rowDate.startsWith(date)) {
            thisWeekData = row;
            break;
          }
        }
        if (!thisWeekData && scheduleData.length > 0) {
          thisWeekData = scheduleData[scheduleData.length - 1];
        }
      }

      console.log('[LKworship] 本週資料:', thisWeekData);

      // 配唱欄位可能是「配唱」或「配唱1」/「配唱2」/「配唱3」
      let singers = '';
      if (thisWeekData) {
        const parts = [
          thisWeekData['配唱1'] || '',
          thisWeekData['配唱2'] || '',
          thisWeekData['配唱3'] || ''
        ].filter(Boolean);
        singers = parts.length > 0 ? parts.join('、') : (thisWeekData['配唱'] || '');
      }

      return {
        success: true,
        source: 'LKworship',
        data: {
          leader:  thisWeekData ? (thisWeekData['主領'] || '') : '',
          singers,
          pianist: thisWeekData ? (thisWeekData['Keyboard'] || thisWeekData['司琴'] || '') : '',
          raw: thisWeekData || {}
        }
      };
    } catch (err) {
      console.error('[LKworship] 錯誤:', err);
      return { success: false, source: 'LKworship', error: err.message };
    }
  },

  // ==========================================
  // LKCschedule - 行事曆
  //
  // GAS 回傳（透過 LKERP）：
  //   { success: true, events: [
  //     { id, date, name, category, ministryItems:[],
  //       sermons: [
  //         { type:'台語/聯合', title, speaker, scripture,
  //           callToWorship, goldenVerse, hymns, description },
  //         { type:'華語', title, speaker, scripture, ... }
  //       ]
  //     }, ...
  //   ]}
  // ==========================================
  async fetchCalendar() {
    try {
      const result = await this.callERP('load', {});

      // LKCschedule 回傳 { success:true, events:[...] }
      let eventList = [];
      if (result && result.success && Array.isArray(result.events)) {
        eventList = result.events;
      } else {
        // 嘗試舊格式相容
        const rawData = this._unwrap(result);
        eventList = Array.isArray(rawData) ? rawData : [];
      }

      console.log('[LKCschedule] 事件數量:', eventList.length);

      return {
        success: true,
        source: 'LKCschedule',
        data: eventList.map(event => {
          const sermons = event.sermons || [];
          const twSermon = sermons.find(s => s.type === '台語/聯合') || null;
          const zhSermon = sermons.find(s => s.type === '華語') || null;
          return {
            date:     event.date     || '',
            name:     event.name     || '',
            category: event.category || '',
            twSermon,
            zhSermon,
            raw: event
          };
        })
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
    const targetClean = date.replace(/-/g, '');

    const matchDate = e => {
      const d = String(e.date || '');
      return d === date || d.replace(/[^\d]/g, '') === targetClean || d.startsWith(date);
    };

    const matchingEvents = events.filter(matchDate);
    console.log('[LKCschedule] 日期', date, '匹配事件:', matchingEvents.length);

    // 每個 event 可能含台語/聯合講道 和/或 華語講道
    let twService = null;
    let zhService = null;

    for (const event of matchingEvents) {
      if (!twService && event.twSermon) {
        const s = event.twSermon;
        twService = {
          date: event.date,
          name: event.name,
          sermonTitle:  s.title        || '',
          speaker:      s.speaker      || '',
          scripture:    s.scripture    || '',
          callToWorship:s.callToWorship|| '',
          goldenVerse:  s.goldenVerse  || '',
          hymn:         s.hymns        || '',
          notes:        s.description  || ''
        };
      }
      if (!zhService && event.zhSermon) {
        const s = event.zhSermon;
        zhService = {
          date: event.date,
          name: event.name,
          sermonTitle: s.title     || '',
          speaker:     s.speaker   || '',
          scripture:   s.scripture || '',
          notes:       s.description || ''
        };
      }
    }

    // 活動預告：未來 3 個月內所有事件
    const today = new Date(date);
    const limit = new Date(today);
    limit.setMonth(limit.getMonth() + 3);

    const upcoming = events
      .filter(e => {
        const evDate = new Date(String(e.date).replace(/\//g, '-'));
        return evDate >= today && evDate <= limit;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      success: true,
      source: 'LKCschedule',
      data: { taiwanese: twService, mandarin: zhService, upcoming }
    };
  },

  // ==========================================
  // LKC_Attendance - 點名
  // google.script.run 無法從 GitHub Pages 跨域呼叫
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
              date:       recent['日期']     || '',
              attendance: Number(recent['實到人數']) || Number(recent['出席人數']) || 0,
              newFriends: Number(recent['新朋友'])  || 0
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
