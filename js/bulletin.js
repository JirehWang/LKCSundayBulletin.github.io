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
        bibleStudy: 0, weeklyMeeting: 0, morningPrayer: 0,
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

    // LKCschedule: 講員=主理者, 講題=講道題目, 經文=聖經經文
    if (calendar?.success) {
      const { taiwanese: tw, mandarin: zh, upcoming } = calendar.data;
      if (tw) {
        this.set('taiwanese.presider',     tw.speaker      || '');
        this.set('taiwanese.sermonTitle',  tw.sermonTitle  || '');
        this.set('taiwanese.scripture',    tw.scripture    || '');
        this.set('taiwanese.callToWorship',tw.callToWorship|| '');
        this.set('taiwanese.goldenVerse',  tw.goldenVerse  || '');
        if (tw.hymn) this.set('taiwanese.openingHymn', tw.hymn);
      }
      if (zh) {
        this.set('mandarin.presider',    zh.speaker      || '');
        this.set('mandarin.sermonTitle', zh.sermonTitle  || '');
        this.set('mandarin.scripture',   zh.scripture    || '');
      }
      if (upcoming) {
        this.set('events', upcoming.slice(0, 15).map(e => ({
          date: e.date, name: e.name, description: e.notes || e.sermonTitle || ''
        })));
      }
    }

    // LKC1958: 司會者（台語 mc、華語 zhMc）、服事人員排班
    if (service?.success) {
      const d = service.data;
      // 主日程序 tab
      this.set('taiwanese.mc', d.mc   || '');
      this.set('mandarin.mc',  d.zhMc || '');
      // 服事人員 tab
      this.set('ministry.thisWeek.tw.mc',            d.mc         || '');
      this.set('ministry.thisWeek.tw.presider',      d.chairman   || '');
      this.set('ministry.thisWeek.tw.choir',         d.choir      || '');
      this.set('ministry.thisWeek.tw.usher',         d.usher      || '');
      this.set('ministry.thisWeek.tw.preMeetingSong',d.songLeader || '');
    }

    // LKworship: 司琴（台語）、敬拜團主領與配置
    if (worship?.success) {
      const w = worship.data;
      this.set('taiwanese.pianist',            w.pianist || '');
      this.set('ministry.thisWeek.zh.worship', w.leader  || '');
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
  }
};
