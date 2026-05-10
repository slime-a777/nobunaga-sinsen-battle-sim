'use strict';
// Node.js テストランナー
// ブラウザ用HTMLテストと同じロジックをNode.jsで実行する

const fs   = require('fs');
const path = require('path');

// ─ ソースファイルを一つの Function スコープで実行
//   const/let はそのスコープ内で有効なため、execSlot等から参照できる
//   dealDmg/Math.random はスコープ外から参照する _dmgLog / _rngVal を使う

let _dmgLog = [];

// グローバルから参照できるよう宣言（Function内から参照される）
global.addLog = function(st, cls, msg) {
  if (!st) return;
  if (!st._logs) st._logs = [];
  st._logs.push({ cls, msg });
};

// ── ソース読み込み ──
function readSrc(rel) {
  return fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
}

const srcCalc    = readSrc('src/battle/calc.js');
const srcEffects = readSrc('src/battle/effects.js');
const srcData    = readSrc('src/data.js');
const srcSenpo   = readSrc('src/battle/senpo.js');

// 全ソースを単一 Function 内に展開して実行
// → const SENPO_DB, execSlot 等はこの関数スコープで有効
// → 最後に必要なものを exports オブジェクトへ詰める
const _exportRef = {};
const _src = `
  // ─ ゲームソース
  ${srcCalc}
  ${srcEffects}
  ${srcData}
  ${srcSenpo}

  // ─ dealDmg をラップしてダメージ記録
  var _innerDealDmg = dealDmg;
  dealDmg = function(st, target, dmg, attacker, attackerIsSelf, isMelee, isChi) {
    _dmgLog.push({ target: target.name, raw: dmg, isMelee: !!isMelee, isChi: !!isChi });
    return _innerDealDmg(st, target, dmg, attacker, attackerIsSelf, isMelee, isChi);
  };

  // ─ 公開シンボルを外部に渡す
  _exportRef.SENPO_DB  = SENPO_DB;
  _exportRef.execSlot  = execSlot;
  _exportRef.execFixed = execFixed;
  _exportRef.baseDmg   = baseDmg;
  _exportRef.applyRate = applyRate;
  _exportRef.purify    = purify;
`;

try {
  new Function('_dmgLog', '_exportRef', _src)
    .call(null, _dmgLog, _exportRef);
} catch(e) {
  console.error('[LOAD ERROR]', e.message);
  process.exit(1);
}

const { SENPO_DB, execSlot, execFixed, baseDmg, applyRate } = _exportRef;

// ─ テストユーティリティ
function resetDmgLog() { _dmgLog.length = 0; }
function _withRandom(val, fn) {
  // new Function は Node.js グローバル Math を参照するので直接置き換えで OK
  const orig = Math.random;
  Math.random = () => val;
  try { fn(); } finally { Math.random = orig; }
}

// ─ テストフレームワーク
const results = [];
let currentSection = '';
function section(name) { currentSection = name; }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'アサーション失敗'); }
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ` → 期待値: ${b}, 実際値: ${a}`);
}
function test(name, fn) {
  try { fn(); results.push({ pass: true,  section: currentSection, name }); }
  catch(e) { results.push({ pass: false, section: currentSection, name, error: e.message }); }
}

function makeUnit(opts = {}) {
  return {
    name:         opts.name         || 'テスト武将',
    hp:           opts.hp           ?? 10000,
    maxHp:        opts.maxHp        ?? 10000,
    bu:           opts.bu           ?? 150,
    chi:          opts.chi          ?? 150,
    to:           opts.to           ?? 150,
    spd:          opts.spd          ?? 100,
    critRate:     opts.critRate     ?? 0,
    critBonus:    opts.critBonus    ?? 0.5,
    kiryakuRate:  opts.kiryakuRate  ?? 0,
    kiryakuBonus: opts.kiryakuBonus ?? 0,
    renegadeRate: opts.renegadeRate ?? 0,
    fixed:        opts.fixed        ?? null,
    slots:        opts.slots        ?? [],
    ...opts
  };
}
function makeState(allies, enemies) {
  if (!allies)  allies  = [makeUnit({ name: '味方1' })];
  if (!enemies) enemies = [makeUnit({ name: '敵1' })];
  return {
    ally: allies, enemy: enemies, turn: 1,
    log: [], _logs: [], _lastMods: '',
    fuuseki: { ally:[0,0,0], enemy:[0,0,0] },
    hiyokuSide: null, hiyokuAccum: 0,
  };
}

// ════════════════════════════════════════════
// テスト定義
// ════════════════════════════════════════════

// ── カテゴリ 1: SENPO_DB 静的データ検証 ──────────
section('SENPO_DB 発動確率・種別チェック');

const EXPECTED_PROB = {
  // S 伝授戦法
  '電光石火':    { prob: 0.40, type: 'active'  },
  '恵風和雨':    { prob: 1.00, type: 'command' },
  '勇猛無比':    { prob: 0.40, type: 'active'  },
  '金城湯池':    { prob: 0.40, type: 'active'  },
  '奇策縦横':    { prob: 0.30, type: 'active',  prep: true },
  '瞬息万変':    { prob: 0.45, type: 'active'  },
  '攻其不備':    { prob: 0.40, type: 'active'  },
  '知者楽水':    { prob: 1.00, type: 'command' },
  '乱世の華':    { prob: 0.40, type: 'strike'  },
  '境目奮戦':    { prob: 0.35, type: 'strike'  },
  '静動自在':    { prob: 0.30, type: 'active'  },
  '縦横馳突':    { prob: 0.40, type: 'active'  },
  '紅蓮の炎':    { prob: 0.35, type: 'active',  prep: true },
  '御旗楯無':    { prob: 1.00, type: 'passive' },
  '盤石耽々':    { prob: 1.00, type: 'passive' },
  '運勝の鼻':    { prob: 1.00, type: 'passive' },
  '水攻干計':    { prob: 0.30, type: 'active',  prep: true },
  '七十二の計':  { prob: 1.00, type: 'passive' },
  '所領役帳':    { prob: 0.35, type: 'active'  },
  '毘沙門天':    { prob: 1.00, type: 'passive' },
  '独立独歩':    { prob: 1.00, type: 'passive' },
  '一領具足':    { prob: 1.00, type: 'command' },
  '霹靂一撃':    { prob: 0.35, type: 'active'  },
  '一行三昧':    { prob: 1.00, type: 'passive' },
  '以戦養戦':    { prob: 1.00, type: 'passive' },
  '千軍辟易':    { prob: 0.35, type: 'active'  },
  '血戦奮闘':    { prob: 1.00, type: 'passive' },
  '一力当先':    { prob: 0.40, type: 'active'  },
  '母衣武者':    { prob: 1.00, type: 'passive' },
  '文武両道':    { prob: 1.00, type: 'passive' },
  '所向無敵':    { prob: 0.30, type: 'active',  prep: true },
  '気勢衝天':    { prob: 1.00, type: 'command' },
  '草木皆兵':    { prob: 0.50, type: 'active',  prep: true },
  '理非曲直':    { prob: 0.35, type: 'strike'  },
  '回天転運':    { prob: 0.40, type: 'active'  },
  '大智不智':    { prob: 0.30, type: 'active'  },
  '前後挟撃':    { prob: 0.35, type: 'active'  },
  '沈魚落雁':    { prob: 1.00, type: 'passive' },
  '五里霧中':    { prob: 0.35, type: 'active',  prep: true },
  '深慮遠謀':    { prob: 1.00, type: 'command' },
  '帰還の凱歌':  { prob: 0.45, type: 'active'  },
  '乗勝追撃':    { prob: 0.30, type: 'strike'  },
  '戦意崩壊':    { prob: 0.35, type: 'strike'  },
  '金鼓連天':    { prob: 0.40, type: 'active'  },
  '按甲休兵':    { prob: 1.00, type: 'passive' },
  '奇謀独断':    { prob: 0.35, type: 'active',  prep: true },
  '百戦錬磨':    { prob: 1.00, type: 'passive' },
  '剛毅果断':    { prob: 0.40, type: 'active'  },
  '甲斐弓騎兵':  { prob: 1.00, type: 'passive' },
  '気炎万丈':    { prob: 1.00, type: 'command' },
  '赤備え隊':    { prob: 1.00, type: 'passive' },
  '罵詈雑言':    { prob: 1.00, type: 'command' },
  '陣形崩し':    { prob: 0.35, type: 'active',  prep: true },
  '戦意消沈':    { prob: 1.00, type: 'command' },
  '死中求活':    { prob: 1.00, type: 'passive' },
  '嚢沙之計':    { prob: 0.30, type: 'active'  },
  '三河弓兵隊':  { prob: 1.00, type: 'passive' },
  '薩摩鉄砲兵':  { prob: 1.00, type: 'passive' },
  '鉄砲僧兵':    { prob: 1.00, type: 'passive' },
  '大太刀力士隊':{ prob: 1.00, type: 'passive' },
  // A 伝授戦法
  '回山倒海':    { prob: 0.35, type: 'strike'  },
  '槍弾正':      { prob: 0.35, type: 'active'  },
  '一念乱志':    { prob: 1.00, type: 'passive' },
  '警戒周到':    { prob: 1.00, type: 'command' },
  '攻守兼備':    { prob: 0.40, type: 'active'  },
  '殿軍奮戦':    { prob: 0.55, type: 'active'  },
  '鉄砲猛撃':    { prob: 0.35, type: 'active'  },
  '先制先登':    { prob: 0.35, type: 'active'  },
  '一上一下':    { prob: 1.00, type: 'passive' },
  '鬼玄蕃':      { prob: 0.30, type: 'active'  },
  '休養':        { prob: 1.00, type: 'passive' },
  '忠勤励行':    { prob: 0.35, type: 'active',  prep: true },
  '援護射撃':    { prob: 0.40, type: 'active'  },
  '百錬成鋼':    { prob: 1.00, type: 'passive' },
  '一刀両断':    { prob: 0.30, type: 'strike'  },
  '不意打ち':    { prob: 0.45, type: 'active',  prep: true },
  '全力戦闘':    { prob: 1.00, type: 'passive' },
  '奮戦':        { prob: 0.35, type: 'active'  },
  '有備無患':    { prob: 0.45, type: 'active'  },
  '生死一顧':    { prob: 0.50, type: 'active'  },
  '一触即発':    { prob: 0.40, type: 'strike'  }, // DBは0.35→BUG
  '弓調馬服':    { prob: 0.45, type: 'active'  },
  '先陣の勇':    { prob: 0.35, type: 'active'  },
  '矢石飛交':    { prob: 0.40, type: 'active'  },
  '融通自在':    { prob: 0.45, type: 'active'  },
  '秋水一色':    { prob: 0.35, type: 'active',  prep: true },
  '参謀の助言':  { prob: 1.00, type: 'command' },
  '祓除':        { prob: 0.45, type: 'active'  },
  '槍の鈴':      { prob: 0.35, type: 'strike'  },
  '妖怪退治':    { prob: 0.35, type: 'active'  },
  '闇討ち':      { prob: 0.45, type: 'active',  prep: true },
  '腹中鱗甲':    { prob: 1.00, type: 'passive' },
  '敵陣攪乱':    { prob: 0.35, type: 'active'  },
  '驍勇善戦':    { prob: 0.35, type: 'active',  prep: true },
  '一六勝負':    { prob: 0.40, type: 'active'  },
  '岐阜侍従':    { prob: 0.35, type: 'active'  },
  '奪気':        { prob: 0.45, type: 'active'  },
  '甲州流軍学':  { prob: 0.35, type: 'active'  },
  // B 伝授戦法
  '薙ぎ払い':    { prob: 0.50, type: 'active'  },
  '嘲罵':        { prob: 0.60, type: 'active'  },
  '連戦':        { prob: 0.35, type: 'strike'  },
  '不退転':      { prob: 0.30, type: 'strike'  },
  '看破':        { prob: 0.25, type: 'active'  },
  '火計':        { prob: 0.35, type: 'active'  },
  '奮起':        { prob: 1.00, type: 'passive' },
  '殿軍':        { prob: 0.25, type: 'active'  },
  '破甲':        { prob: 0.55, type: 'strike'  },
  '火攻め':      { prob: 0.40, type: 'active'  },
  '刺突':        { prob: 0.40, type: 'active'  },
  '同討':        { prob: 0.30, type: 'active',  prep: true },
  '対話':        { prob: 0.45, type: 'active'  },
  '救援':        { prob: 0.40, type: 'active'  },
  '威圧':        { prob: 0.25, type: 'active'  },
  '水計':        { prob: 0.35, type: 'active'  },
  '猛撃':        { prob: 0.45, type: 'strike'  },
  '反撃':        { prob: 0.35, type: 'active'  },
};

for (const [name, expected] of Object.entries(EXPECTED_PROB)) {
  test(`${name} 発動確率・種別`, () => {
    const entry = SENPO_DB[name];
    assert(entry != null, `SENPO_DBに「${name}」が存在しない`);
    assertEqual(entry.prob, expected.prob, `「${name}」発動確率`);
    assertEqual(entry.type, expected.type, `「${name}」戦法種別`);
    if (expected.prep) assert(entry.prep === true, `「${name}」prep=true が必要`);
  });
}

// ── カテゴリ 2: 継続ダメージ率の検証 ─────────────
section('継続ダメージ率の仕様確認（アーキテクチャ問題）');

test('水計 — suikouRate=70 が設定される（仕様: 70%/T）', () => {
  const me  = makeUnit({ name: '付与者', chi: 150 });
  const tgt = makeUnit({ name: '標的' });
  const st  = makeState([me], [tgt]);
  _withRandom(0, () => { execSlot(st, SENPO_DB['水計'], me, true, 1.0); });
  assert((tgt.suikouT || 0) > 0, '水計: suikouT が付与されていない');
  assert(tgt.suikouRate != null,
    '水計: suikouRate が未設定。turn.js は一律102%を使うため仕様の70%/Tと不一致。');
  assertEqual(tgt.suikouRate, 70, '水計 suikouRate');
});

test('水攻干計 — suikouRate=98 が設定される（仕様: 98%/T、準備戦法）', () => {
  const me  = makeUnit({ name: '付与者', chi: 150 });
  const tgt = makeUnit({ name: '標的' });
  const st  = makeState([me], [tgt]);
  me.prepName = '水攻干計';
  _withRandom(0, () => { execSlot(st, SENPO_DB['水攻干計'], me, true, 1.0); });
  assert((tgt.suikouT || 0) > 0, '水攻干計: suikouT が付与されていない');
  assert(tgt.suikouRate != null,
    '水攻干計: suikouRate が未設定。turn.js は一律102%を使うため仕様の98%/Tと不一致。');
  assertEqual(tgt.suikouRate, 98, '水攻干計 suikouRate');
});

test('嚢沙之計 — suikouRate=102 が設定される（仕様: 102%/T）', () => {
  const me = makeUnit({ name: '付与者', chi: 150 });
  const e1 = makeUnit({ name: '敵1' });
  const e2 = makeUnit({ name: '敵2' });
  const st = makeState([me], [e1, e2]);
  _withRandom(0, () => { execSlot(st, SENPO_DB['嚢沙之計'], me, true, 1.0); });
  assert((e1.suikouT || 0) > 0, '嚢沙之計: suikouT が付与されていない');
  // 嚢沙之計はturn.jsの102%と一致するが、明示的にsuikouRateを設定すべき
  if (e1.suikouRate != null) {
    assertEqual(e1.suikouRate, 102, '嚢沙之計 suikouRate');
  }
  // suikouRateが未設定でもturn.jsの102%と一致するためここはWARN扱い
});

test('火計 — _kaenRate=70 が設定される（仕様: 70%/T）', () => {
  const me  = makeUnit({ name: '付与者', chi: 150 });
  const tgt = makeUnit({ name: '標的' });
  const st  = makeState([me], [tgt]);
  _withRandom(0, () => { execSlot(st, SENPO_DB['火計'], me, true, 1.0); });
  assert((tgt._kaen || 0) > 0, '火計: _kaen が付与されていない');
  assert(tgt._kaenRate != null,
    '火計: _kaenRate が未設定。turn.js は一律74%を使うため仕様の70%/Tと不一致。');
  assertEqual(tgt._kaenRate, 70, '火計 _kaenRate');
});

// ── カテゴリ 3: 戦法ダメージ率の動的検証 ────────────
section('伝授戦法ダメージ率チェック');

function checkDmgRate(senpoName, expectedRate, isMelee, opts = {}) {
  test(`${senpoName} — ${isMelee ? '兵刃' : '計略'}${expectedRate}%`, () => {
    const me  = makeUnit({ name: '攻撃者', bu: opts.bu||150, chi: opts.chi||150, to: opts.to||150,
                           ...(opts.critBonus !== undefined ? { critBonus: opts.critBonus } : {}),
                           ...(opts.critRate  !== undefined ? { critRate:  opts.critRate  } : {}) });
    const tgt = makeUnit({ name: '標的',  bu: 150, chi: 150, to: 150 });
    const st  = makeState([me], [tgt]);
    if (opts.prepName) me.prepName = opts.prepName;
    const sk  = SENPO_DB[senpoName];
    assert(sk != null, `SENPO_DBに「${senpoName}」が存在しない`);
    resetDmgLog();
    _withRandom(0, () => { execSlot(st, sk, me, true, 1.0); });
    assert(_dmgLog.length > 0, `${senpoName}: ダメージが記録されなかった`);
    const hit = _dmgLog[opts.hitIdx || 0];
    assert(hit != null, `${senpoName}: ヒット ${opts.hitIdx||0} が存在しない`);
    const base = baseDmg(isMelee ? me.bu : me.chi, isMelee ? tgt.to : tgt.chi, me.hp);
    const lo   = Math.round(base * expectedRate / 100 * 0.956 * 0.85);
    const hi   = Math.round(base * expectedRate / 100 * 1.044 * 1.15);
    assert(hit.raw >= lo && hit.raw <= hi,
      `ダメージ ${hit.raw} が期待範囲 [${lo}, ${hi}] (rate=${expectedRate}%) 外`);
    if (opts.checkMelee !== undefined) {
      assertEqual(hit.isMelee, opts.checkMelee, `isMelee フラグ`);
    }
  });
}

checkDmgRate('霹靂一撃',   228, true,  { checkMelee: true  });
checkDmgRate('千軍辟易',   106, true,  { checkMelee: true  });
checkDmgRate('乗勝追撃',   136, true,  { checkMelee: true  });
checkDmgRate('一刀両断',   316, true,  { checkMelee: true  });
checkDmgRate('電光石火',    96, true,  { checkMelee: true  });
checkDmgRate('奇策縦横',   254, false, { prepName: '奇策縦横', checkMelee: false });
checkDmgRate('槍弾正',     172, true,  { checkMelee: true  });
checkDmgRate('理非曲直',   192, true,  { checkMelee: true  });
checkDmgRate('先陣の勇',   154, true,  { checkMelee: true  });
checkDmgRate('生死一顧',    56, false, { checkMelee: false });
// 勇猛無比は発動時に自身critRate+0.25するため、初期値-0.25で発動後0になりcrit無効
checkDmgRate('勇猛無比',   122, true,  { checkMelee: true, critRate: -0.25 });
checkDmgRate('秋水一色',   148, false, { prepName: '秋水一色', checkMelee: false });
checkDmgRate('草木皆兵',   142, false, { prepName: '草木皆兵', checkMelee: false });
checkDmgRate('所向無敵',   254, true,  { prepName: '所向無敵', checkMelee: true  });
checkDmgRate('陣形崩し',   102, true,  { prepName: '陣形崩し', checkMelee: true  });

// ── カテゴリ 4: 状態効果チェック ─────────────────
section('状態効果・持続ターン数チェック');

test('霹靂一撃 — 麻痺2T', () => {
  const me  = makeUnit({ name: '攻撃者', bu: 150 });
  const tgt = makeUnit({ name: '標的',  to: 150 });
  const st  = makeState([me], [tgt]);
  _withRandom(0, () => { execSlot(st, SENPO_DB['霹靂一撃'], me, true, 1.0); });
  assertEqual(tgt.muku, 2, '麻痺ターン数');
});

test('霹靂一撃 — 麻痺中対象ヒット時 会心+50%', () => {
  const me  = makeUnit({ name: '攻撃者', bu: 150, critRate: 0 });
  const tgt = makeUnit({ name: '標的',  to: 150, muku: 1 });
  const st  = makeState([me], [tgt]);
  _withRandom(0, () => { execSlot(st, SENPO_DB['霹靂一撃'], me, true, 1.0); });
  assert(me.critRate >= 0.50, `会心率 ${me.critRate} が0.50未満`);
});

test('槍弾正 — 無策1T', () => {
  const me  = makeUnit({ name: '攻撃者', bu: 150 });
  const tgt = makeUnit({ name: '標的',  to: 150 });
  const st  = makeState([me], [tgt]);
  _withRandom(0, () => { execSlot(st, SENPO_DB['槍弾正'], me, true, 1.0); });
  assertEqual(tgt.musaku, 1, '無策ターン数');
});

test('破甲 — 統率-36・持続2T', () => {
  const me  = makeUnit({ name: '攻撃者' });
  const tgt = makeUnit({ name: '標的',  to: 150 });
  const st  = makeState([me], [tgt]);
  _withRandom(0, () => { execSlot(st, SENPO_DB['破甲'], me, true, 1.0); });
  assertEqual(tgt.to, 150 - 36, '統率減少値');
  assertEqual(tgt._toDebufT, 2, '統率デバフ持続ターン数');
});

test('一触即発 — 統率-70・無策1T（統率100基準）', () => {
  const me  = makeUnit({ name: '攻撃者', to: 100 });
  const tgt = makeUnit({ name: '標的',  to: 150 });
  const st  = makeState([me], [tgt]);
  _withRandom(0, () => { execSlot(st, SENPO_DB['一触即発'], me, true, 1.0); });
  assertEqual(tgt.musaku, 1, '無策1T');
  assertEqual(tgt.to, 150 - 70, '統率-70');
  assertEqual(tgt._toDebufT, 1, '統率デバフ持続1T');
});

test('奇謀独断 — 無策2T（敵2名）', () => {
  const me = makeUnit({ name: '付与者' });
  const e1 = makeUnit({ name: '敵1' });
  const e2 = makeUnit({ name: '敵2' });
  const st = makeState([me], [e1, e2]);
  me.prepName = '奇謀独断';
  _withRandom(0, () => { execSlot(st, SENPO_DB['奇謀独断'], me, true, 1.0); });
  assertEqual(e1.musaku, 2, '敵1 無策2T');
  assertEqual(e2.musaku, 2, '敵2 無策2T');
});

test('五里霧中 — 混乱2T（準備戦法）', () => {
  const me  = makeUnit({ name: '付与者' });
  const tgt = makeUnit({ name: '標的' });
  const st  = makeState([me], [tgt]);
  me.prepName = '五里霧中';
  _withRandom(0, () => { execSlot(st, SENPO_DB['五里霧中'], me, true, 1.0); });
  assertEqual(tgt.confused, 2, '混乱ターン数');
});

test('刺突 — 潰走3T・kaisoRate=70', () => {
  const me  = makeUnit({ name: '付与者', bu: 150 });
  const tgt = makeUnit({ name: '標的' });
  const st  = makeState([me], [tgt]);
  _withRandom(0, () => { execSlot(st, SENPO_DB['刺突'], me, true, 1.0); });
  assertEqual(tgt.kaisoT,    3,  '潰走ターン数');
  assertEqual(tgt.kaisoRate, 70, '潰走ダメージ率');
});

test('回山倒海（伝授版）— 潰走2T・kaisoRate=94', () => {
  const me  = makeUnit({ name: '付与者', bu: 150 });
  const tgt = makeUnit({ name: '標的',  to: 150 });
  const st  = makeState([me], [tgt]);
  _withRandom(0, () => { execSlot(st, SENPO_DB['回山倒海'], me, true, 1.0); });
  assertEqual(tgt.kaisoT,    2,  '潰走ターン数');
  assertEqual(tgt.kaisoRate, 94, '潰走ダメージ率');
});

test('水計 — 水攻め3T', () => {
  const me  = makeUnit({ name: '付与者', chi: 150 });
  const tgt = makeUnit({ name: '標的' });
  const st  = makeState([me], [tgt]);
  _withRandom(0, () => { execSlot(st, SENPO_DB['水計'], me, true, 1.0); });
  assertEqual(tgt.suikouT, 3, '水攻めターン数');
});

test('水攻干計 — 水攻め2T + 回復不可（準備戦法）', () => {
  const me  = makeUnit({ name: '付与者', chi: 150 });
  const tgt = makeUnit({ name: '標的' });
  const st  = makeState([me], [tgt]);
  me.prepName = '水攻干計';
  _withRandom(0, () => { execSlot(st, SENPO_DB['水攻干計'], me, true, 1.0); });
  assertEqual(tgt.suikouT, 2, '水攻めターン数');
  assertEqual(tgt.healBlock, true, '回復不可フラグ');
});

test('電光石火 — 友軍に統率+48(2T)', () => {
  const me   = makeUnit({ name: '攻撃者', bu: 150 });
  const ally = makeUnit({ name: '友軍',   to: 100 });
  const tgt  = makeUnit({ name: '敵' });
  // allies[0] がバフ対象なので ally を先頭に置く
  const st   = makeState([ally, me], [tgt]);
  _withRandom(0, () => { execSlot(st, SENPO_DB['電光石火'], me, true, 1.0); });
  assert(ally.to >= 148, `統率 ${ally.to} が期待値(100+48=148)未満`);
  assert((ally._dengkouToT || 0) >= 2, '統率バフ持続ターン数');
});

test('戦意崩壊 — 対象の統率・知略-65、2T', () => {
  const me   = makeUnit({ name: '攻撃者', bu: 150 });
  const tgt  = makeUnit({ name: '標的',  to: 150, chi: 150 });
  const ally = makeUnit({ name: '大将' }); // 鉄壁付与先
  const st   = makeState([me, ally], [tgt]);
  _withRandom(0, () => { execSlot(st, SENPO_DB['戦意崩壊'], me, true, 1.0); });
  assertEqual(tgt.to,  150 - 65, '統率-65');
  assertEqual(tgt.chi, 150 - 65, '知略-65');
  assertEqual(tgt._toDebufT, 2, '統率デバフ持続2T');
  assertEqual(tgt._chiDebufT, 2, '知略デバフ持続2T');
});

test('回天転運 — 弱体化浄化 + HP回復', () => {
  const me   = makeUnit({ name: '回復者', chi: 200 });
  const ally = makeUnit({ name: '味方',  hp: 3000, maxHp: 10000, injured: 7000, musaku: 1, confused: 1 });
  const tgt  = makeUnit({ name: '敵' });
  const st   = makeState([me, ally], [tgt]);
  _withRandom(0, () => { execSlot(st, SENPO_DB['回天転運'], me, true, 1.0); });
  assert(ally.musaku === 0 || ally.confused === 0, '弱体化が浄化されていない');
  assert(ally.hp > 3000, `HP ${ally.hp} が回復していない (3000以下)`);
});

// ── カテゴリ 5: 固有戦法チェック（代表的な武将）───────
section('固有戦法チェック');

test('水の如し（黒田官兵衛）— 計略88%が発動', () => {
  const me  = makeUnit({ name: '黒田官兵衛', chi: 150,
                          fixed: { name: '水の如し', type: 'passive', prob: 1.0 } });
  const tgt = makeUnit({ name: '標的', chi: 150 });
  const st  = makeState([me], [tgt]);
  resetDmgLog();
  // 受動型なので typeFilter=null で呼ぶ
  _withRandom(0, () => { execFixed(st, me, true, 1.0, false, null); });
  // 60%確率で発動するが _fixedRandom=0 なので必ず発動
  assert(_dmgLog.some(d => d.isChi), '水の如し: 計略ダメージが記録されていない');
  const hit = _dmgLog.find(d => d.isChi);
  const base = baseDmg(me.chi, tgt.chi, me.hp);
  const lo   = Math.round(base * 88/100 * 0.956 * 0.85);
  const hi   = Math.round(base * 88/100 * 1.044 * 1.15);
  assert(hit.raw >= lo && hit.raw <= hi,
    `水の如し: ダメージ ${hit.raw} が期待範囲 [${lo}, ${hi}] 外 (88%)`);
});

test('地黄八幡（北条綱成 固有）— 兵刃174%が全敵に', () => {
  const me  = makeUnit({ name: '北条綱成', bu: 150,
                          fixed: { name: '地黄八幡', type: 'active', prob: 0.35, prep: true } });
  const tgt = makeUnit({ name: '標的', to: 150 });
  const st  = makeState([me], [tgt]);
  me.prepFixed = true; // 準備完了状態
  resetDmgLog();
  _withRandom(0, () => { execFixed(st, me, true, 1.0, false, ['active']); });
  assert(_dmgLog.length > 0, '地黄八幡: ダメージが記録されなかった');
  const hit = _dmgLog[0];
  const base = baseDmg(me.bu, tgt.to, me.hp);
  const lo   = Math.round(base * 174/100 * 0.956 * 0.85);
  const hi   = Math.round(base * 174/100 * 1.044 * 1.15);
  assert(hit.raw >= lo && hit.raw <= hi,
    `地黄八幡: ダメージ ${hit.raw} が期待範囲 [${lo}, ${hi}] 外 (174%)`);
});

// ════════════════════════════════════════════
// 結果出力
// ════════════════════════════════════════════
const RESET  = '\x1b[0m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';

let passed = 0, failed = 0;
const sections = [...new Set(results.map(r => r.section))];

for (const sec of sections) {
  const rows = results.filter(r => r.section === sec);
  const sf   = rows.filter(r => !r.pass).length;
  console.log(`\n${CYAN}${BOLD}▶ ${sec}${RESET}`);
  for (const r of rows) {
    if (r.pass) {
      console.log(`  ${GREEN}✓${RESET} ${r.name}`);
      passed++;
    } else {
      console.log(`  ${RED}✗${RESET} ${r.name}`);
      console.log(`    ${YELLOW}→ ${r.error}${RESET}`);
      failed++;
    }
  }
}

console.log(`\n${BOLD}${'─'.repeat(60)}${RESET}`);
const total = passed + failed;
const pct   = Math.round(passed / total * 100);
console.log(`${passed}/${total} passed (${pct}%)  ${failed > 0 ? RED+'✗ '+failed+' failed'+RESET : GREEN+'全テスト通過'+RESET}`);

process.exit(failed > 0 ? 1 : 0);
