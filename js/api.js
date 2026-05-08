// API 客戶端 - 教會週報管理系統

const ChurchAPI = {

  async callGAS(url, action, data = {}) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: CONFIG.SHARED_TOKEN, data })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  // LKC1958 格式：application/x-www-form-urlencoded, payload=JSON
  async callLKC1958(action, data = {}) {
    const payload = { action, token: CONFIG.SHARED_TOKEN, data };
    const formBody = 'payload=' + encodeURIComponent(JSON.stringify(payload));
    const res = await fetch(CONFIG.LKC1958_GAS_URL, {
      method:   'POST',
      headers:  { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:     formBody,
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  // LKC_Attendance 格式：{ action, payload }
  async callAttendance(action, payload = null) {
    const res = await fetch(CONFIG.LKC_ATTENDANCE_GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action, payload })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  _unwrap(result) {
    if (Array.isArray(result)) return result;
    if (result && result.status === 'success' && result.data !== undefined) return result.data;
    if (result && result.success === true && result.data !== undefined) return result.data;
    return null;
  },

  _dateMatch(cellDate, targetDate) {
    const d = String(cellDate || '');
    if (!d || !targetDate) return false;
    if (d.startsWith(targetDate) || d.includes(targetDate)) return true;
    const cellClean   = d.replace(/[^\d]/g, '').substring(0, 8);
    const targetClean = targetDate.replace(/[^\d]/g, '');
    return cellClean === targetClean;
  },

  // ==========================================
  // LKC1958 - 服事排班
  // requireMatch=true: 找不到符合日期的列時回傳空結果
  // ==========================================
  async fetchServiceSchedule(sundayDate, requireMatch = false) {
    try {
      const result = await this.callLKC1958('getAggregatedReport', { type: 'others' });
      console.log('[LKC1958] raw response:', JSON.stringify(result).substring(0, 500));

      const rawData = this._unwrap(result);
      if (!Array.isArray(rawData) || rawData.length === 0) throw new Error('資料格式不符');

      const headers  = rawData[0] || [];
      const rows     = rawData.slice(1);
      const dateIdx  = headers.indexOf('日期');
      console.log('[LKC1958] headers:', headers);
      console.log('[LKC1958] dateIdx:', dateIdx, '| total rows:', rows.length, '| looking for:', sundayDate);

      const matchingRows = dateIdx !== -1
        ? rows.filter(row => this._dateMatch(row[dateIdx], sundayDate))
        : rows.filter(row => this._dateMatch(row[0], sundayDate));

      console.log('[LKC1958] matchingRows:', matchingRows.length);
      matchingRows.forEach((row, i) =>
        console.log(`[LKC1958] row[${i}] 分頁:`, row[0],
          '| 台語司會:', row[headers.indexOf('台語司會')],
          '| 司琴:', row[headers.indexOf('司琴')],
          '| 音控:', row[headers.indexOf('音控同工')])
      );

      let sourceRows;
      if (matchingRows.length > 0) {
        sourceRows = matchingRows;
      } else if (requireMatch) {
        console.log('[LKC1958] 沒有符合', sundayDate, '的列，且 requireMatch=true，回傳空結果');
        return { success: false, source: 'LKC1958_June_1', error: '查無資料' };
      } else {
        sourceRows = [rows[rows.length - 1] || []];
      }

      const r = {};
      headers.forEach((h, i) => {
        if (!h) return;
        for (const row of sourceRows) {
          const v = String(row[i] || '').trim();
          if (v !== '') { r[h] = v; break; }
        }
        if (r[h] === undefined) r[h] = '';
      });

      console.log('[LKC1958] merged r[台語司會]:', r['台語司會'],
                  '| r[司琴]:', r['司琴'], '| r[音控同工]:', r['音控同工']);

      const newcomer = [r['新家人同工1'] || '', r['新家人同工2'] || ''].filter(Boolean).join('、');

      return {
        success: true, source: 'LKC1958_June_1',
        data: {
          mc:           r['台語司會'] || r['司會'] || r['司儀'] || '',
          zhMc:         r['華語司會'] || '',
          pianist:      r['司琴'] || '',
          choir:        r['詩班'] || '',
          usher:        r['招待/停車'] || r['招待'] || '',
          chairman:     r['主席'] || r['主理'] || '',
          songLeader:   r['領詩'] || '',
          soundControl: r['音控同工'] || r['音控'] || '',
          newcomerCare: newcomer,
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
  // requireMatch=true: 找不到日期時回傳空結果
  // ==========================================
  async fetchWorshipSchedule(date, requireMatch = false) {
    try {
      const d = new Date(date);
      const year    = d.getFullYear();
      const quarter = 'Q' + Math.ceil((d.getMonth() + 1) / 3);

      const result = await this.callGAS(CONFIG.LKWORSHIP_GAS_URL, 'getSchedule', { year, quarter });
      console.log('[LKworship] raw response:', JSON.stringify(result).substring(0, 300));

      const scheduleData = this._unwrap(result);
      let row = null;
      if (Array.isArray(scheduleData)) {
        row = scheduleData.find(r => this._dateMatch(r['日期'] || r[0], date)) || null;
        if (!row && !requireMatch) {
          row = scheduleData[scheduleData.length - 1] || null;
        }
      }

      console.log('[LKworship] 資料 (', date, '):', row ? (row['日期'] || row[0]) : '無資料');

      let singers = '';
      if (row) {
        const parts = [row['配唱1'] || '', row['配唱2'] || '', row['配唱3'] || ''].filter(Boolean);
        singers = parts.length > 0 ? parts.join('、') : (row['配唱'] || '');
      }

      return {
        success: true, source: 'LKworship',
        data: {
          leader:  row ? (row['主領'] || '') : '',
          singers,
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
      console.log('[LKCschedule] raw (first 800):', JSON.stringify(result).substring(0, 800));

      let events = [];
      if (result && result.success && Array.isArray(result.events)) {
        events = result.events;
      } else {
        const raw = this._unwrap(result);
        events = Array.isArray(raw) ? raw : [];
      }

      console.log('[LKCschedule] events count:', events.length);
      if (events.length > 0) console.log('[LKCschedule] first event keys:', Object.keys(events[0]));

      return {
        success: true, source: 'LKCschedule',
        data: events.map(e => {
          const sermons = e.sermons || [];
          const twS = sermons.find(s => s.type === '台語/聯合') || null;
          const zhS = sermons.find(s => s.type === '華語') || null;
          return {
            date:         e['日期']     || e.date         || '',
            name:         e['聚會名稱'] || e.name         || '',
            category:     e['講道類別'] || e['聚會類別'] || e.category || '',
            sermonTitle:  twS?.title          || e['講題']  || e.sermonTitle  || '',
            speaker:      twS?.speaker        || e['講員']  || e.speaker      || '',
            scripture:    twS?.scripture      || e['經文']  || e.scripture    || '',
            callToWorship:twS?.callToWorship  || e['宣召']  || e.callToWorship|| '',
            goldenVerse:  twS?.goldenVerse    || e['金句']  || e.goldenVerse  || '',
            hymn:         twS?.hymns          || e['詩歌']  || e['聖詩'] || e.hymn || '',
            notes:        e['備註']           || e.notes        || '',
            zhSermonTitle: zhS?.title     || '',
            zhSpeaker:     zhS?.speaker   || '',
            zhScripture:   zhS?.scripture || '',
            hasTwSermon: !!twS,
            hasZhSermon: !!zhS,
            raw: e
          };
        })
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
    const match = e => this._dateMatch(e.date, date);

    const dayEvents = events.filter(match);
    console.log('[LKCschedule] date:', date, '| dayEvents:', dayEvents.length);

    const twEvent = dayEvents.find(e => e.hasTwSermon)
      || dayEvents.find(e => e.category.includes('台語') || e.name.includes('台語') || e.category === '主日');
    const zhEvent = dayEvents.find(e => e.hasZhSermon)
      || dayEvents.find(e => e.category.includes('華語') || e.name.includes('華語'));

    const twService = twEvent || null;
    const zhService = zhEvent ? {
      date:        zhEvent.date,
      name:        zhEvent.name,
      sermonTitle: zhEvent.zhSermonTitle || zhEvent.sermonTitle || '',
      speaker:     zhEvent.zhSpeaker     || zhEvent.speaker     || '',
      scripture:   zhEvent.zhScripture   || zhEvent.scripture   || ''
    } : null;

    console.log('[LKCschedule] twService.sermonTitle:', twService?.sermonTitle,
                '| zhService.sermonTitle:', zhService?.sermonTitle);

    const today = new Date(date);
    const limit = new Date(today); limit.setMonth(limit.getMonth() + 3);
    const upcoming = events
      .filter(e => { const d = new Date(e.date); return d >= today && d <= limit; })
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return { success: true, source: 'LKCschedule', data: { taiwanese: twService, mandarin: zhService, upcoming } };
  },

  // ==========================================
  // LKC_Attendance - 主日出席人數
  //
  // 使用 getAttendanceStats (mode:'single') 查詢單日人數
  // 總人數 = presentCount + nfMale + nfFemale
  // 群組名稱依 LKC_Attendance 系統設定：台語 / 華語
  // ==========================================
  async fetchAttendance(date) {
    try {
      const req = (type) => ({
        type,
        mode: 'single',
        date,
        baseSheet: '會友名單',
        targetGroups: []
      });

      const [twRaw, zhRaw] = await Promise.allSettled([
        this.callAttendance('getAttendanceStats', req('台語')),
        this.callAttendance('getAttendanceStats', req('華語'))
      ]);

      console.log('[LKC_Attendance] 台語 raw:', twRaw.status === 'fulfilled' ? twRaw.value : twRaw.reason);
      console.log('[LKC_Attendance] 華語 raw:', zhRaw.status === 'fulfilled' ? zhRaw.value : zhRaw.reason);

      const parseTotal = (settled) => {
        if (settled.status !== 'fulfilled') return 0;
        const data = settled.value?.data ?? settled.value;
        if (!data) return 0;
        return (Number(data.presentCount) || 0)
             + (Number(data.nfMale)      || 0)
             + (Number(data.nfFemale)    || 0);
      };

      return {
        success: true, source: 'LKC_Attendance',
        data: {
          taiwanese: { total: parseTotal(twRaw) },
          mandarin:  { total: parseTotal(zhRaw) }
        }
      };
    } catch (err) {
      console.error('[LKC_Attendance]', err);
      return { success: false, source: 'LKC_Attendance', error: err.message };
    }
  },

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
              date:       recent['日期'] || '',
              attendance: Number(recent['實到人數']) || 0,
              newFriends: recent['新朋友'] || ''
            };
          } else {
            results[groupName] = { date: '', attendance: 0, newFriends: '' };
          }
        } catch (e) {
          results[groupName] = { date: '', attendance: 0, newFriends: '', error: e.message };
        }
      }));
      return { success: true, source: 'LKGroup', data: results };
    } catch (err) {
      console.error('[LKGroup]', err);
      return { success: false, source: 'LKGroup', error: err.message };
    }
  },

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
