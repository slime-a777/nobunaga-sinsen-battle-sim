// ═══════════════════════════════════════
// 戦闘状態初期化
// ═══════════════════════════════════════
function initUnit(b) {
  // 受動スロット・特性から会心・奇策率を計算
  let critRate = 0, critBonus = 0.5, kirRate = 0, kirBonus = 0;
  let renegadeRate = 0; // 離反確率
  if (b.fixed?.name === '破竹の勢い') { critRate += 0.70; critBonus += 0.30; }
  // 水の如し：奇策確率+5%（固有戦法として持つ場合）
  if (b.fixed?.name === '水の如し') kirRate += 0.05;
  // 武田之赤備（山県昌景）: 会心+20%常時
  if (b.fixed?.name === '武田之赤備') critRate += 0.20;
  // 高橋紹運の豊後の戦陣: 洞察+属性依存バフ（initStateで付与）
  b.slots?.forEach(s => {
    if (!s) return;
    if (s.name === '血戦奮闘') critRate += 0.40;
    // 以戦養戦の離反25%常時。会心はHP50%以下の条件付きなのでここでは加算しない
    if (s.name === '以戦養戦') renegadeRate = Math.min(1.0, renegadeRate + 0.25);
    if (s.name === '赤備え隊') critRate += 0.35;
    if (s.name === '七十二の計') { kirRate += 0.50; kirBonus += 0.15; }
  });
  // 特性ボーナスを加算
  critRate  += (b.traitCritAdd || 0);
  critBonus += (b.traitCritBonusAdd || 0);
  kirRate   += (b.traitKiryakuAdd || 0);
  kirBonus  += (b.traitKiryakuBonusAdd || 0);
  // 受動型パッシブ戦法による初期ステータスボーナス
  let buBonus = 0, chiBonus = 0, toBonus = 0, spdBonus = 0;
  const allSenpo = [b.fixed, ...(b.slots||[])].filter(Boolean);
  allSenpo.forEach(s => {
    if (s.name === '百戦錬磨') { buBonus+=42; chiBonus+=42; toBonus+=42; spdBonus+=42; }
    if (s.name === '百錬成鋼') { buBonus+=35; chiBonus+=35; toBonus+=35; spdBonus+=35; }
    if (s.name === '奮起') { buBonus+=25; spdBonus+=25; }
  });
  // kyuyoRate初期化（鉄砲僧兵は全軍効果のためinitStateで処理）
  let kyuyoRate = 0;
  allSenpo.forEach(s => {
    if (s.name === '按甲休兵') kyuyoRate = Math.max(kyuyoRate, 1.40);
    if (s.name === '休養') kyuyoRate = Math.max(kyuyoRate, 1.00);
  });
  return {
    ...b, hp: b.maxHp, injured: 0, dead: 0, nanaCnt: 0, _nanaFired: false, tesseki: 0,
    bu: (b.bu||100)+buBonus, chi: (b.chi||100)+chiBonus, to: (b.to||100)+toBonus, spd: (b.spd||100)+spdBonus,
    suikouT: 0, muku: 0, heihaki: false,
    ranzuList: [], buff_atkDmg: 1.0, shichiHitCnt: 0, baritauntProtectT: 0,
    rengiT: 0,              // 連撃ターン残（確定）
    rengi50T: 0,            // 連撃ターン残（50%判定・鬼若子）
    fuusekiResist: 0,       // 封撃耐性ターン残
    kiseiDebufBu: false,    // 気勢衝天 兵刃与ダメ-30%（武勇最高者）
    kiseiDebufChi: false,   // 気勢衝天 計略与ダメ-30%（知略最高者）
    _shiroFlag: false,      // 城盗り予約フラグ
    _shiroAttacker: null,   // 城盗りフラグを付けた武将
    _shiroIsSelf: false,    // 城盗り武将のサイド
    _shiroChi: 0,           // 城盗り知略バフ量
    _shiroChiT: 0,          // 城盗り知略バフ残ターン
    confused: 0,            // 混乱ターン残（通攻が味方に誤爆）
    musaku: 0,              // 無策ターン残（能動戦法不可）
    hibi: 0,                // 疲弊ターン残（与ダメ無効）
    iatsuT: 0,              // 威圧ターン残（行動不能・確定）
    renegadeRate,           // 離反確率（通常攻撃が味方に向く）
    shochinT: 0,            // 消沈ターン残（知略依存継続ダメ104%/T）
    shochinPow: 0,          // 消沈威力（付与者の知略）
    kaisoT: 0,              // 潰走ターン残（武勇依存継続ダメ）
    kaisoPow: 0,            // 潰走威力（付与者の武勇）
    kaisoRate: 0,           // 潰走ダメ率（付与戦法ごとに異なる）
    chudokuT: 0,            // 中毒ターン残
    chudokuPow: 0,          // 中毒威力（付与者の知略）
    dousatsu: 0,            // 洞察ターン残（制御効果無効）
    yoheiHp: 0,             // 傭兵 追加兵力シールド（ダメを先に吸収）
    kaiseiT: 0,             // 回生ターン残（毎ターン回復）
    kaiseiProb: 0.50,       // 回生発動確率
    kaiseiHealRate: 66,     // 回生回復率(%)
    kaiseiDepStat: 0,       // 回生依存stat値（0=対象のchi使用）
    hajiRate: 0,            // 破陣ダメ増加率
    kyuyoRate,              // 休養確率（毎T確率で回復）
    prepName: null,         // 準備中のスロット戦法名
    prepFixed: false,       // 固有戦法の準備中フラグ
    critRate: Math.min(critRate, 1.0), critBonus,
    kiryakuRate: Math.min(kirRate, 1.0), kiryakuBonus: kirBonus,
    status: [], defeated: false,
    // 夜叉美濃（原虎胤）: 被ダメ軽減は traitBuDefReduce/traitChiDefReduce で管理（固有initで付与）
    // 武田之赤備（山県昌景）
    _takizukaDebufT: 0,
    // 越後二天（柿崎景家）
    _ekizenStack: 0,
    // 楼岸一番（蜂須賀小六）
    _rougannDebufT: 0, _rougannDebufRate: 0,
    // 疾風怒濤（甘粕景持）
    _shimoUCritT: 0,
    // 不屈の精神（一条信龍）
    _hankiPow: 0, _hankiHitCnt: 0,
    // 諏訪の光（諏訪姫）: 特になし（武勇/統率直接加算）
    // 一徹の意志（稲葉一鉄）
    _issetsuToT: 0, _issetsuToBoost: 0,
    // 形影相弔（荒木村重）: st.turnで制御
    // 湖水渡り（明智秀満）
    _kosuiT: 0, _kosuiBoostCnt: 0,
    // 勇志不抜（高力清長）: バフは dealDmg 側で被ダメ-20%として簡略化
    _yuushiBeiT: 0,
    // 傲岸不遜（斎藤義龍）
    _goumanDebufT: 0, _goumanStrikeReduce: 0,
    // 旋乾転坤（島津貴久）
    _kyokouT: 0, _kyokouPow: 0, _kyokouRate: 0,
    // 先制攻撃（河田長親）
    _senseiDebufT: 0, _senseiDebufRate: 0,
    // 密報通暁（樋口兼豊）
    _kakuranT: 0,
    // 落花啼鳥（朝倉義景）
    _rakkaAktBufT: 0, _rakkaAktBufRate: 0,
    // 満ちゆく月（南部晴政）
    _mangetsuDebufCnt: 0,
    // 積水成淵（宮部継潤）
    _shinkoRate: 0,
    // 怪力無双（真柄直隆）: prepT は f.prepT として管理
    _kairikiHajiT: 0,
    // 耐苦鍛錬（千坂景親）
    _takida: 0,
    // 月華鶴影（大祝鶴）
    _getsukaCritStacks: 0,
    // 松柏之操（まつ）
    _matsuActBoost: 0,
    // 末世の道者（大内義隆）
    _sueoAtkBufChi: false,
    // 諸行無常（瑞溪院）
    _shogyoAtkBuf: 0, _shogyoDebufT: 0,
    // 献身（仙桃院）
    _kensinT: 0, _kensinSelfDebuf: false,
    // 三楽犬（太田資正）
    _sakkoT: 0, _sankakuMarked: false,
    // 笹の才蔵（可児才蔵）
    _sasanoPrepSkip: false,
    // 洞察反撃（岡部元信）
    _dousatsuRevengeT: 0,
    // 盤石耽々: 受動被ダメ軽減（毎T増加）
    _bandokuDef: 0, _bandokuInc: 0,
  };
}

function initState(build) {
  // 比翼連理保持者がどちらのサイドにいるか特定
  const hiyokuSide = build.ally.some(b=>b.fixed?.name==='比翼連理') ? 'ally'
                   : build.enemy.some(b=>b.fixed?.name==='比翼連理') ? 'enemy' : null;
  const st = {
    turn: 0,
    ally:  build.ally.map(initUnit),
    enemy: build.enemy.map(initUnit),
    // 共有フラグ
    fuuseki: { ally:[0,0,0], enemy:[0,0,0] }, // 封撃ターン残（通常攻撃のみ不可）
    fuusekiAppliedTurn: { ally:[0,0,0], enemy:[0,0,0] }, // 封撃付与ターン（同ターン消化スキップ用）
    baritaunt: 0,        // 挑発 残ターン数
    baritauntProb: 0,    // 挑発 発動確率（戦法ごとに異なる: 罵詈雑言90%等）
    baritauntIdx: 0,     // 挑発をかけた武将のインデックス
    baritauntSide: null, // 挑発をかけたサイド（'ally'/'enemy'）
    kiseiSide: null,     // 気勢衝天 保持サイド
    kiseiTurns: 0,       // 気勢衝天 残ターン数
    ichiryo: null,       // 一領具足 状態 { turns, side, bu, to }
    hiyokuAccum: 0,     // 比翼連理 蓄積量
    hiyokuSide,         // 比翼連理保持サイド
    log: [],
    result: null,
  };

  // 鬼若子：第1ターン開始前に連撃4Tと統率増加を付与
  ['ally','enemy'].forEach(side => {
    const idx = st[side].findIndex(b => b.fixed?.name === '鬼若子');
    if (idx < 0) return;
    const u = st[side][idx];
    const isTaisho = idx === 0;
    const myTeam = st[side];
    // 大将技あり: 3名確率70%、なし: 3名確率40%（それ以外は2名）
    const cnt = Math.random() < (isTaisho ? 0.70 : 0.40) ? 3 : 2;
    const toGain = Math.round(18 * statScale(u.to));
    // ランダムにcnt名を選択して連撃4T・統率+18付与（全員確定、per-target 50%ロールなし）
    const shuffled = [...myTeam].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, Math.min(cnt, myTeam.filter(t=>t.hp>0).length));
    chosen.forEach(t => {
      t.rengi50T = 4;
      t.to = (t.to || 100) + toGain;
    });
    if (chosen.length > 0)
      addLog(st,'log-buff',`  鬼若子(開戦前): ${chosen.map(t=>t.name).join('・')}に連撃4T・統率+${toGain}付与${isTaisho?'【大将技】':''}`);
  });

  // 三河弓兵隊：全軍統率+20、回生3T付与
  ['ally','enemy'].forEach(side => {
    const holder = st[side].find(b => b.slots?.some(s => s?.name === '三河弓兵隊'));
    if (!holder) return;
    st[side].forEach(t => {
      t.to = (t.to || 100) + 20;
      t.kaiseiT = Math.max(t.kaiseiT || 0, 3);
      // 酒井忠次装備時のみ統率依存で確率増加、それ以外は35%固定
      t.kaiseiProb = holder.name === '酒井忠次'
        ? Math.min(1.0, 0.35 * statScale(holder.to || 100))
        : 0.35;
      t.kaiseiHealRate = 65;
      t.kaiseiDepStat = holder.to || 100;
    });
    addLog(st,'log-buff',`  三河弓兵隊(開戦前): ${side==='ally'?'味方':'敵'}全軍統率+20・回生3T付与`);
  });

  // 僧兵：全軍兵刃被ダメ-20%×statScale(統率)
  ['ally','enemy'].forEach(side => {
    const holder = st[side].find(b => b.slots?.some(s => s?.name === '僧兵'));
    if (!holder) return;
    const reduce = 0.20 * statScale(holder.to || 100);
    st[side].forEach(t => {
      t.traitBuDefReduce = (t.traitBuDefReduce || 0) + reduce;
    });
    addLog(st,'log-buff',`  僧兵(開戦前): ${side==='ally'?'味方':'敵'}全軍兵刃被ダメ-${Math.round(reduce*100)}%付与`);
  });

  // 鉄砲僧兵：自軍全体に統率+12・知略+12、T1/2/5/6に休養48%（統率依存）付与
  ['ally','enemy'].forEach(side => {
    const holder = st[side].find(b => b.slots?.some(s => s?.name === '鉄砲僧兵'));
    if (!holder) return;
    st[side].forEach(t => {
      t.to  = (t.to  || 100) + 12;
      t.chi = (t.chi || 100) + 12;
      t._teppoMonkKyuyo = 0.48;
    });
    addLog(st,'log-buff',`  鉄砲僧兵(開戦前): ${side==='ally'?'味方':'敵'}全軍統率+12・知略+12・T1/2/5/6に休養48%付与`);
  });

  // 夜叉美濃（原虎胤）: 兵刃・計略被ダメ-35%常時
  ['ally','enemy'].forEach(side => {
    const holder = st[side].find(b => b.fixed?.name === '夜叉美濃');
    if (!holder) return;
    holder.traitBuDefReduce  = (holder.traitBuDefReduce  || 0) + 0.35;
    holder.traitChiDefReduce = (holder.traitChiDefReduce || 0) + 0.35;
    addLog(st,'log-buff',`  夜叉美濃(${holder.name}): 兵刃・計略被ダメ-35%`);
  });

  // 盤石耽々: 被ダメ-9%(統率依存)、毎T+4%(統率依存)スタック
  ['ally','enemy'].forEach(side => {
    st[side].forEach(u => {
      const has = u.slots?.some(s => s?.name === '盤石耽々') || u.fixed?.name === '盤石耽々';
      if (!has) return;
      u._bandokuDef = Math.min(0.90, 0.09 * statScale(u.to || 100));
      u._bandokuInc = 0.04 * statScale(u.to || 100);
      addLog(st, 'log-buff', `  盤石耽々(${u.name}): 被ダメ-${Math.round(u._bandokuDef*100)}%（毎T+${Math.round(u._bandokuInc*100)}%増加）`);
    });
  });

  return st;
}

function addLog(st, cls, msg){ st.log.push({cls, msg}); }
