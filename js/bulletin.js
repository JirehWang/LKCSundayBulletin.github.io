// 資料模型與狀態管理 - 教會週報管理系統

const BulletinModel = {

  defaultData() {
    return {
      date: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      taiwanese: {
        presider: '',
        mc: '', pianist: '',
        callToWorship: '', openingHymn: '',
        apostlesCreed: true,
        responsivePsalm: '', prayer1Note: '',
        scripture: '', choirSong: '', sermonTitle: '',
        responseHymn: '', goldenVerse: '',
        offeringNote: '', doxologyHymn: '',
        bankAccount: CONFIG.BANK_ACCOUNT
      },

      mandarin: {
        presider: '',
        mc: '',
        scripture: '', sermonTitle: '',
        upcomingPreview: ''
      },

      ministry: {
        thisWeek: {
          date: '',
          tw: { presider:'', mc:'', pianist:'', usher:'', newcomerCare:'', flower:'', preMeetingSong:'', choir:'', soundControl:'', sundaySchoolA:'' },
          zh: { presider:'', mc:'', worship:'', usher:'', newcomerCare:'', sundaySchoolB:'' }
        },
        nextWeek: {
          date: '',
          tw: { presider:'', mc:'', pianist:'', usher:'', newcomerCare:'', flower:'', preMeetingSong:'', choir:'', soundControl:'', sundaySchoolA:'' },
          zh: { presider:'', mc:'', worship:'', usher:'', newcomerCare:'', sundaySchoolB:'' }
        }
      },

      attendance: {
        twService: 0, zhService: 0, choir: 0,
        sundaySchool: { '幼小班':0, '初小班':0, '中小班':0, '高小班':0, '青少年班':0, '成人A班':0, '成人B班':0 },
        morningPrayer: 0, thursdayPrayer: 0,
        smallGroups: {
          '葡萄樹A':0, '葡萄樹B':0, '恩典團契':0, '橄欖樹':0, '松年團契':0, '學青':0,
          '棕樹A':0, '棕樹B':0, '香柏樹':0, '提摩太':0, '以斯帖':0,
          '芥菜種A':0, '芥菜種B':0, '芥菜種C':0, '恩典幸福小組':0, '棕樹幸福小組':0
        },
        twOffering: 0, zhOffering: 0, zhOffering2: 0, sundaySchoolOffering: 0
      },

      events: [],
      announcements: ['', '', '', '', '', '', '', '', '', ''],
      prayer: { homeRest: '', hospital: '', other: '' },
      offeringReport: { monthlyItems: [], special: '', thanksgiving: '', notes: '' }
    };
  },

  _current: null,

  init(date) {
    this._current = this.defaultData();
    if (date) this._current.date = date;
    return this._current;
  },

  get() {
    if (!this._current) this.init();
    return this._current;
  },

  set(path, value) {
    if (!this._current) this.init();
    const keys = path.split('.');
    let obj = this._current;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this._current.updatedAt = new Date().toISOString();
  },

  merge(data) {
    if (!this._current) this.init();
    this._deepMerge(this._current, data);
    this._current.updatedAt = new Date().toISOString();
  },

  _deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this._deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  },

  applyAPIData(apiResults) {
    const { calendar, service, worship, attendance, smallGroups } = apiResults;

    if (calendar?.success) {
      const { taiwanese: tw, mandarin: zh, upcoming } = calendar.data;
      if (tw) {
        this.set('taiwanese.presider',     tw.speaker      || '');
        this.set('taiwanese.sermonTitle',  tw.sermonTitle  || '');
        this.set('taiwanese.scripture',    tw.scripture    || '');
        this.set('taiwanese.callToWorship',tw.callToWorship|| '');
        this.set('taiwanese.goldenVerse',  tw.goldenVerse  || '');
        if (tw.hymn) this.set('taiwanese.openingHymn', tw.hymn);
        this.set('ministry.thisWeek.tw.presider', tw.speaker || '');
      }
      if (zh) {
        this.set('mandarin.presider',    zh.speaker      || '');
        this.set('mandarin.sermonTitle', zh.sermonTitle  || '');
        this.set('mandarin.scripture',   zh.scripture    || '');
        this.set('ministry.thisWeek.zh.presider', zh.speaker || '');
      }
      if (upcoming) {
        this.set('events', upcoming.slice(0, 15).map(e => ({
          date: e.date, name: e.name, description: e.notes || e.sermonTitle || ''
        })));
      }
    }

    if (service?.success) {
      const d = service.data;
      this.set('taiwanese.mc',      d.mc      || '');
      this.set('taiwanese.pianist', d.pianist || '');
      this.set('mandarin.mc',       d.zhMc    || '');
      this.set('ministry.thisWeek.tw.mc',            d.mc           || '');
      this.set('ministry.thisWeek.tw.pianist',       d.pianist      || '');
      this.set('ministry.thisWeek.tw.choir',         d.choir        || '');
      this.set('ministry.thisWeek.tw.usher',         d.usher        || '');
      this.set('ministry.thisWeek.tw.preMeetingSong',d.songLeader   || '');
      this.set('ministry.thisWeek.tw.soundControl',  d.soundControl || '');
      this.set('ministry.thisWeek.tw.newcomerCare',  d.newcomerCare || '');
      this.set('ministry.thisWeek.zh.mc',            d.zhMc         || '');
    }

    if (worship?.success) {
      this.set('ministry.thisWeek.zh.worship', worship.data.leader || '');
    }

    if (attendance?.success) {
      const a = attendance.data;
      this.set('attendance.twService', a.taiwanese?.total || 0);
      this.set('attendance.zhService', a.mandarin?.total  || 0);
    }

    if (smallGroups?.success) {
      const sg = smallGroups.data;
      const cur = this._current.attendance.smallGroups;
      for (const g of Object.keys(cur)) {
        if (sg[g]) cur[g] = sg[g].attendance || 0;
      }
    }
  },

  applyNextWeekAPIData(apiResults) {
    const { calendar, service, worship } = apiResults;

    if (calendar?.success) {
      const { taiwanese: tw, mandarin: zh } = calendar.data;
      if (tw) this.set('ministry.nextWeek.tw.presider', tw.speaker || '');
      if (zh) this.set('ministry.nextWeek.zh.presider', zh.speaker || '');
    }

    if (service?.success) {
      const d = service.data;
      this.set('ministry.nextWeek.tw.mc',            d.mc           || '');
      this.set('ministry.nextWeek.tw.pianist',       d.pianist      || '');
      this.set('ministry.nextWeek.tw.choir',         d.choir        || '');
      this.set('ministry.nextWeek.tw.usher',         d.usher        || '');
      this.set('ministry.nextWeek.tw.preMeetingSong',d.songLeader   || '');
      this.set('ministry.nextWeek.tw.soundControl',  d.soundControl || '');
      this.set('ministry.nextWeek.tw.newcomerCare',  d.newcomerCare || '');
      this.set('ministry.nextWeek.zh.mc',            d.zhMc         || '');
    }

    if (worship?.success) {
      this.set('ministry.nextWeek.zh.worship', worship.data.leader || '');
    }
  }
};
