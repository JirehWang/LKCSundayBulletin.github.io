// API 客戶端 - 教會週報管理系統
// 整合 5 個 churchAPI 資料來源

const ChurchAPI = {

  // 基礎 API 呼叫
  async call(action, payload) {
    if (typeof window.churchAPI !== 'function') {
      throw new Error('churchAPI 尚未載入，請確認外部設定正確');
    }
    return await window.churchAPI(action, payload);
  },

  // ==========================================
  // LKC1958 - 服事排班
  // ==========================================
  async fetchServiceSchedule(sundayDate) {
    try {
      const data = await this.call('getAggregatedReport', { type: 'service' });
      if (!data || !Array.isArray(data)) throw new Error('資料格式錯誤');

      const headers = data[0] || [];
      const rows = data.slice(1);

      // 找到對應日期的行
      const dateStr = sundayDate; // YYYY-MM-DD
      let targetRow = null;

      for (const row of rows) {
        const rowDate = row[0];
        if (rowDate && String(rowDate).includes(dateStr.replace(/-/g, '/'))) {
          targetRow = row;
          break;
        }
        // 嘗試其他日期格式
        if (rowDate && String(rowDate).replace(/[^0-9]/g, '').startsWith(dateStr.replace(/-/g, ''))) {
          targetRow = row;
          break;
        }
      }

      if (!targetRow) {
        // 若找不到精確日期，返回最近一筆
        targetRow = rows[rows.length - 1] || [];
      }

      const result = {};
      headers.forEach((header, idx) => {
        result[header] = targetRow[idx] || '';
      });

      return {
        success: true,
        source: 'LKC1958_June_1',
        data: {
          mc: result['司儀'] || result['領會'] || '',
          choir: result['詩班'] || '',
          usher: result['招待/停車'] || result['招待'] || '',
          loveAgape: result['愛宴同工'] || '',
          chairman: result['主席'] || result['主理'] || '',
          worship: result['領會'] || '',
          communion: result['聖餐'] || '',
          songLeader: result['領詩'] || '',
          raw: result
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
      const month = d.getMonth() + 1;
      const quarter = Math.ceil(month / 3);

      const scheduleData = await this.call('getSchedule', { year, quarter });

      let thisWeekData = null;
      if (Array.isArray(scheduleData)) {
        for (const row of scheduleData) {
          const rowDate = row['日期'] || row[0];
          if (rowDate && String(rowDate).includes(date)) {
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
      const songsData = await this.call('getSongs', { startDate, endDate });
      return {
        success: true,
        source: 'LKworship',
        data: Array.isArray(songsData) ? songsData : []
      };
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
      const data = await this.call('load', {});
      if (!data) throw new Error('無資料返回');

      const events = Array.isArray(data) ? data : (data.events || data.data || []);

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

  // 從行事曆找特定日期的資料
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

    // 活動預告 - 未來 3 個月
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
  // ==========================================
  async fetchAttendance(date) {
    try {
      const data = await new Promise((resolve, reject) => {
        if (!google || !google.script || !google.script.run) {
          reject(new Error('Google Apps Script 環境未載入'));
          return;
        }
        google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(reject)
          .getAttendanceStats({
            type: 'sunday',
            mode: 'single',
            date: date,
            baseSheet: 'Attendance',
            targetGroups: ['台語', '華語', '兒教']
          });
      });

      return {
        success: true,
        source: 'LKC_Attendance',
        data: {
          taiwanese: {
            male: data['台語']?.['出席人數']?.['男'] || 0,
            female: data['台語']?.['出席人數']?.['女'] || 0,
            newMale: data['台語']?.['新朋友']?.['男'] || 0,
            newFemale: data['台語']?.['新朋友']?.['女'] || 0,
            total: (data['台語']?.['出席人數']?.['男'] || 0) + (data['台語']?.['出席人數']?.['女'] || 0)
          },
          mandarin: {
            male: data['華語']?.['出席人數']?.['男'] || 0,
            female: data['華語']?.['出席人數']?.['女'] || 0,
            newMale: data['華語']?.['新朋友']?.['男'] || 0,
            newFemale: data['華語']?.['新朋友']?.['女'] || 0,
            total: (data['華語']?.['出席人數']?.['男'] || 0) + (data['華語']?.['出席人數']?.['女'] || 0)
          },
          children: {
            male: data['兒教']?.['出席人數']?.['男'] || 0,
            female: data['兒教']?.['出席人數']?.['女'] || 0,
            total: (data['兒教']?.['出席人數']?.['男'] || 0) + (data['兒教']?.['出席人數']?.['女'] || 0)
          },
          raw: data
        }
      };
    } catch (err) {
      console.error('[LKC_Attendance] 錯誤:', err);
      return { success: false, source: 'LKC_Attendance', error: err.message };
    }
  },

  // ==========================================
  // LKGroup - 小組
  // ==========================================
  async fetchSmallGroups(date) {
    try {
      const groups = CONFIG.TW_GROUPS;
      const results = {};

      // 並行請求所有小組
      const promises = groups.map(async (groupName) => {
        try {
          const data = await this.call('getStats', {
            groupName: groupName,
            groupCode: '',
            startDate: 'RAW_MODE'
          });

          if (Array.isArray(data) && data.length > 0) {
            // 找最近日期的紀錄
            const recent = data[data.length - 1];
            results[groupName] = {
              date: recent['日期'] || '',
              attendance: recent['出席人數'] || 0,
              newFriends: recent['新朋友'] || 0
            };
          } else {
            results[groupName] = { date: '', attendance: 0, newFriends: 0 };
          }
        } catch (e) {
          results[groupName] = { date: '', attendance: 0, newFriends: 0, error: e.message };
        }
      });

      await Promise.all(promises);

      return {
        success: true,
        source: 'LKGroup',
        data: results
      };
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
      calendar: results[0].status === 'fulfilled' ? results[0].value : { success: false, error: results[0].reason?.message },
      service: results[1].status === 'fulfilled' ? results[1].value : { success: false, error: results[1].reason?.message },
      worship: results[2].status === 'fulfilled' ? results[2].value : { success: false, error: results[2].reason?.message },
      attendance: results[3].status === 'fulfilled' ? results[3].value : { success: false, error: results[3].reason?.message },
      smallGroups: results[4].status === 'fulfilled' ? results[4].value : { success: false, error: results[4].reason?.message }
    };
  }
};
