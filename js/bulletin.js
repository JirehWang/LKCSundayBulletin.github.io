// 資料模型與狀態管理 - 教會週報管理系統

const BulletinModel = {

  // 預設資料結構
  defaultData() {
    return {
      date: '',  // YYYY-MM-DD
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      // 台語主日禮拜程序
      taiwanese: {
        presider: '',
        mc: '',           // 司會者
        pianist: '',      // 司琴者
        callToWorship: '', // 宣召 經文
        openingHymn: '',  // 序樂後聖詩 號碼
        apostlesCreed: true, // 使徒信經 固定
        responsivePsalm: '', // 啟應文第 X 篇
        prayer1Note: '',   // 祈禱 備註
        scripture: '',     // 聖經 經文
        choirSong: '',     // 讚美 (聖歌隊)
        sermonTitle: '',   // 講道 題目
        responseHymn: '', // 回應聖詩 號碼
        goldenVerse: '',  // 金句 經文
        offeringNote: '', // 奉獻 備註
        doxologyHymn: '', // 頌榮 號碼
        bankAccount: CONFIG.BANK_ACCOUNT
      },

      // 華語主日禮拜程序
      mandarin: {
        presider: '',
        mc: '',           // 司會者
        scripture: '',    // 聖經 經文
        sermonTitle: '',  // 講道 題目
        upcomingPreview: '' // 活動預告 (文字)
      },

      // 服事人員
      ministry: {
        thisWeek: {
          date: '',
          tw: {
            presider: '',    // 主理
            mc: '',          // 司會
            pianist: '',     // 司琴
            usher: '',       // 招待.司獻
            newcomerCare: '', // 新家人關懷
            flower: '',      // 獻花
            preMeetingSong: '', // 會前領唱
            choir: '',       // 獻詩(聖歌隊)
            soundControl: '', // 音控
            sundaySchoolA: '' // 成人主日學A
          },
          zh: {
            presider: '',    // 主理
            mc: '',          // 司會
            worship: '',     // 敬拜
            usher: '',       // 招待.司獻
            newcomerCare: '', // 新家人關懷
            sundaySchoolB: '' // 成人主日學B
          }
        },
        nextWeek: {
          date: '',
          tw: {
            presider: '',
            mc: '',
            pianist: '',
            usher: '',
            newcomerCare: '',
            flower: '',
            preMeetingSong: '',
            choir: '',
            soundControl: '',
            sundaySchoolA: ''
          },
          zh: {
            presider: '',
            mc: '',
            worship: '',
            usher: '',
            newcomerCare: '',
            sundaySchoolB: ''
          }
        }
      },

      // 聚會統計
      attendance: {
        // 主日禮拜
        twService: 0,
        zhService: 0,
        choir: 0,
        // 主日學
        sundaySchool: {
          '幼小班': 0,
          '初小班': 0,
          '中小班': 0,
          '高小班': 0,
          '青少年班': 0,
          '成人A班': 0,
          '成人B班': 0
        },
        // 其他聚會
        bibleStudy: 0,
        weeklyMeeting: 0,
        morningPrayer: 0,
        // 各小組
        smallGroups: {
          '葡萄樹A': 0, '葡萄樹B': 0, '恩典團契': 0, '橄欖樹': 0,
          '松年團契': 0, '學青': 0, '棕樹A': 0, '棕樹B': 0,
          '香柏樹': 0, '提摩太': 0, '以斯帖': 0,
          '芥菜種A': 0, '芥菜種B': 0, '芥菜種C': 0,
          '恩典幸福小組': 0, '棕樹幸福小組': 0
        },
        // 奉獻
        twOffering: 0,
        zhOffering: 0,
        zhOffering2: 0,
        sundaySchoolOffering: 0
      },

      // 活動預告
      events: [
        // { date: '', name: '', description: '' }
      ],

      // 本會消息
      announcements: ['', '', '', '', '', '', '', '', '', ''],

      // 關懷代禱
      prayer: {
        homeRest: '',   // 在家調養
        hospital: '',   // 住院
        other: ''       // 其他
      },

      // 奉獻報告
      offeringReport: {
        monthlyItems: [  // 月定奉獻明細
          // { name: '', amount: '' }
        ],
        special: '',      // 特別奉獻
        thanksgiving: '', // 感恩奉獻
        notes: ''
      }
    };
  },

  // 當前狀態
  _current: null,

  // 初始化
  init(date) {
    this._current = this.defaultData();
    if (date) this._current.date = date;
    return this._current;
  },

  // 取得當前資料
  get() {
    if (!this._current) this.init();
    return this._current;
  },

  // 設定資料 (部分或全部)
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

  // 合併資料
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

  // 從 API 資料更新
  applyAPIData(apiResults) {
    const { calendar, service, worship, attendance, smallGroups } = apiResults;

    // 行事曆資料
    if (calendar?.success) {
      const { taiwanese: twCal, mandarin: zhCal, upcoming } = calendar.data;

      if (twCal) {
        this.set('taiwanese.scripture', twCal.scripture || '');
        this.set('taiwanese.sermonTitle', twCal.sermonTitle || '');
        this.set('taiwanese.callToWorship', twCal.callToWorship || '');
        this.set('taiwanese.goldenVerse', twCal.goldenVerse || '');
        if (twCal.hymn) this.set('taiwanese.openingHymn', twCal.hymn);
        if (twCal.speaker) this.set('taiwanese.presider', twCal.speaker);
      }

      if (zhCal) {
        this.set('mandarin.scripture', zhCal.scripture || '');
        this.set('mandarin.sermonTitle', zhCal.sermonTitle || '');
        if (zhCal.speaker) this.set('mandarin.presider', zhCal.speaker);
      }

      if (upcoming) {
        this.set('events', upcoming.slice(0, 15).map(e => ({
          date: e.date,
          name: e.name,
          description: e.notes || e.sermonTitle || ''
        })));
      }
    }

    // 服事排班資料
    if (service?.success) {
      const d = service.data;
      this.set('ministry.thisWeek.tw.mc', d.mc || '');
      this.set('ministry.thisWeek.tw.presider', d.chairman || '');
      this.set('ministry.thisWeek.tw.choir', d.choir || '');
      this.set('ministry.thisWeek.tw.usher', d.usher || '');
      this.set('ministry.thisWeek.tw.preMeetingSong', d.songLeader || '');
    }

    // 敬拜團資料
    if (worship?.success) {
      const w = worship.data;
      this.set('ministry.thisWeek.zh.worship', w.leader || '');
      this.set('mandarin.mc', w.leader || '');
    }

    // 出席人數
    if (attendance?.success) {
      const a = attendance.data;
      this.set('attendance.twService', a.taiwanese?.total || 0);
      this.set('attendance.zhService', a.mandarin?.total || 0);
    }

    // 小組出席
    if (smallGroups?.success) {
      const sg = smallGroups.data;
      const currentGroups = this._current.attendance.smallGroups;
      for (const groupName of Object.keys(currentGroups)) {
        if (sg[groupName]) {
          currentGroups[groupName] = sg[groupName].attendance || 0;
        }
      }
    }
  }
};
