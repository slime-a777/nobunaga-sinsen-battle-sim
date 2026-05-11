// ═══════════════════════════════════════
// 浄化処理：弱体状態をn個解除する
// ═══════════════════════════════════════
function purify(unit, n) {
  const candidates = [
    { key:'muku',       label:'麻痺',       clear: u => { u.muku = 0; } },
    { key:'suikouT',    label:'水攻め',     clear: u => { u.suikouT = 0; u.healBlock = false; } },
    { key:'_kaen',      label:'火傷',       clear: u => { u._kaen = 0; } },
    { key:'confused',   label:'混乱',       clear: u => { u.confused = 0; } },
    { key:'musaku',     label:'無策',       clear: u => { u.musaku = 0; } },
    { key:'hibi',       label:'疲弊',       clear: u => { u.hibi = 0; } },
    { key:'iatsuT',     label:'威圧',       clear: u => { u.iatsuT = 0; } },
    { key:'shochinT',   label:'消沈',       clear: u => { u.shochinT = 0; u.shochinPow = 0; } },
    { key:'kaisoT',     label:'潰走',       clear: u => { u.kaisoT = 0; u.kaisoPow = 0; u.kaisoRate = 0; } },
    { key:'chudokuT',   label:'中毒',       clear: u => { u.chudokuT = 0; u.chudokuPow = 0; } },
    { key:'_kichoDebuf',label:'帰蝶デバフ', clear: u => { u._kichoDebuf = 0; } },
    { key:'_jubai',     label:'被ダメ増加', clear: u => { u._jubai = 0; u._jubaiT = 0; } },
    { key:'_shintyo',   label:'与ダメ低下', clear: u => { u._shintyo = 0; } },
    { key:'_gounoDebufT',label:'計略与ダメ低下', clear: u => { u._gounoDebufT = 0; } },
    { key:'kiseiDebufBu',  label:'気勢デバフ(兵刃)', clear: u => { u.kiseiDebufBu = false; } },
    { key:'kiseiDebufChi', label:'気勢デバフ(計略)', clear: u => { u.kiseiDebufChi = false; } },
  ];
  const cleared = [];
  for (const d of candidates) {
    if (cleared.length >= n) break;
    const v = unit[d.key];
    if (v && v !== false && v > 0 || v === true) { // boolean(kiseiDebuf系)も対応
      d.clear(unit);
      cleared.push(d.label);
    }
  }
  return cleared; // 解除した状態名の配列
}

// 制御効果付与ヘルパー：洞察中なら無効化
function tryCtrl(target, apply, label, st) {
  if ((target.dousatsu||0) > 0) {
    addLog(st, 'log-buff', `  洞察(${target.name}): 制御無効 [${label}]`);
    return false;
  }
  apply(target);
  return true;
}

function pickTarget(arr) {
  const live = arr.filter(a=>a.hp>0);
  if (!live.length) return null;
  return live[Math.floor(Math.random()*live.length)];
}

function dealDmg(st, target, dmg, attacker, attackerIsSelf, isMelee=false, isChi=false) {
  // 疲弊: 攻撃者のあらゆる与ダメが0
  if ((attacker.hibi||0) > 0) {
    addLog(st, 'log-ctrl', `    疲弊により ${target.name}に0ダメージ（残${target.hp.toLocaleString()}）`);
    return 0;
  }
  // 鉄壁チェック
  if (target.tesseki > 0) {
    target.tesseki--;
    addLog(st,'log-buff',`  鉄壁発動！(${target.name}) ダメ無効`);
    return 0;
  }

  let finalDmg = dmg;
  // バフ/デバフ修正をまとめて記録するリスト { label, pct }
  const mods = [];
  const applyMod = (label, newVal) => {
    if (newVal === finalDmg) return;
    const pct = Math.round((newVal - finalDmg) / finalDmg * 100);
    const sign = pct >= 0 ? '+' : '';
    mods.push(`${label}(${sign}${pct}%)`);
    finalDmg = newVal;
  };

  // 一領具足: T1〜2 対象サイドの被ダメ-12%（武勇依存）
  if (st.ichiryo && (st.ichiryo.turns||0) > 2) {
    const _tSide = attackerIsSelf ? 'enemy' : 'ally';
    if (_tSide === st.ichiryo.side)
      applyMod(`一領具足防御`, Math.round(finalDmg * (1 - Math.min(0.24, 0.12 * statScale(st.ichiryo.bu)))));
  }
  // 知者楽水防御（統率依存: 被ダメ-24%）
  if (target._chiryaku > 0)
    applyMod(`知者楽水防御`, Math.round(finalDmg * (1 - 0.24 * statScale(target._chiryaku_to||100))));
  // ─ 与ダメ修正（同種乗算・バフ/デバフ間加算） ─
  // 同種バフ: buffNet = 1-(1-b1)*(1-b2)*... 同種デバフも同様。バフ/デバフ間は加算で合成
  const _atkBuffRates  = [];  // 与ダメバフ各増加率 (e.g. 0.30 = +30%)
  const _atkDebufRates = [];  // 与ダメデバフ各減少率の大きさ (e.g. 0.28 = -28%)
  const _atkModLabels  = [];

  // 深慮遠謀: 攻撃者に与ダメ-28%（知略依存）
  if (attacker._shintyo > 0) {
    const r = Math.min(1, 0.28 * statScale(attacker._shintyo_chi||100));
    _atkDebufRates.push(r); _atkModLabels.push(`深慮遠謀-${Math.round(r*100)}%`);
  }
  // 楼岸一番デバフ: 攻撃者に与ダメ-30%
  if ((attacker._rougannDebufT||0) > 0) {
    _atkDebufRates.push(0.30); _atkModLabels.push(`楼岸一番-30%`);
  }
  // 傲岸不遜デバフ: 対象への攻撃（全兵刃として簡略化）-30%
  if (isMelee && (attacker._goumanDebufT||0) > 0) {
    const r = attacker._goumanStrikeReduce || 0.30;
    _atkDebufRates.push(r); _atkModLabels.push(`傲岸不遜-${Math.round(r*100)}%`);
  }
  // 満ちゆく月デバフ: 攻撃者の次N回与ダメ-40%
  if ((attacker._mangetsuDebufCnt||0) > 0) {
    _atkDebufRates.push(0.40); _atkModLabels.push(`満ちゆく月-40%`);
    attacker._mangetsuDebufCnt--;
  }
  // 先制攻撃デバフ: 対象が受ける能動戦法被ダメ+30%
  if ((target._senseiDebufT||0) > 0 && st._isActiveSkill) {
    _atkBuffRates.push(0.30); _atkModLabels.push(`先制攻撃+30%`);
  }
  // 落花啼鳥バフ: 攻撃者の能動戦法与ダメ+75%
  if ((attacker._rakkaAktBufT||0) > 0 && st._isActiveSkill) {
    _atkBuffRates.push(attacker._rakkaAktBufRate || 0.75); _atkModLabels.push(`落花啼鳥+75%`);
  }
  // 無想掃討: 攻撃者の兵刃与ダメ+50%
  if (isMelee && (attacker._musouBufT||0) > 0) {
    _atkBuffRates.push(attacker._musouBufRate||0.50); _atkModLabels.push(`無想掃討+${Math.round((attacker._musouBufRate||0.50)*100)}%`);
  }
  // 夢幻泡影: 攻撃者の与ダメ+15%
  if ((attacker._mugenBufT||0) > 0) {
    _atkBuffRates.push(attacker._mugenBufRate||0.15); _atkModLabels.push(`夢幻泡影+${Math.round((attacker._mugenBufRate||0.15)*100)}%`);
  }
  // 新生: 攻撃者の与ダメ+14%
  if ((attacker._shinseiAtkBuf||0) > 0) {
    _atkBuffRates.push(attacker._shinseiAtkBuf); _atkModLabels.push(`新生+${Math.round(attacker._shinseiAtkBuf*100)}%`);
  }
  // 風林火山【風】: 攻撃者の兵刃与ダメ+22%
  if (isMelee && (attacker._furinBuf||0) > 0) {
    _atkBuffRates.push(attacker._furinBuf); _atkModLabels.push(`風林火山(風)+${Math.round(attacker._furinBuf*100)}%`);
  }
  // 越後流軍学: 攻撃者の能動戦法発動率は prob check 側で適用。ここでは何もしない
  // 冷徹無情: 攻撃者の能動発動率バフは prob check 側で適用
  // 諸行無常バフ: 攻撃者の与ダメ+24%（T1〜3）
  if ((attacker._shogyoAtkBuf||0) > 0) {
    _atkBuffRates.push(attacker._shogyoAtkBuf); _atkModLabels.push(`諸行無常+${Math.round(attacker._shogyoAtkBuf*100)}%`);
  }
  // 諸行無常デバフ: 攻撃者の与ダメ-56%（T4以降）
  if ((attacker._shogyoDebufT||0) > 0) {
    _atkDebufRates.push(0.56); _atkModLabels.push(`諸行無常-56%`);
  }
  // 気勢衝天: 兵刃/計略最高者に与ダメ-30%（武勇依存）
  if (!isChi && attacker.kiseiDebufBu) {
    const r = Math.min(1, 0.30 * statScale(st.kiseiBu||100));
    _atkDebufRates.push(r); _atkModLabels.push(`気勢衝天-${Math.round(r*100)}%`);
  }
  if (isChi && attacker.kiseiDebufChi) {
    const r = Math.min(1, 0.30 * statScale(st.kiseiBu||100));
    _atkDebufRates.push(r); _atkModLabels.push(`気勢衝天-${Math.round(r*100)}%`);
  }
  // 毘沙門天: 攻撃者の与ダメ-9%（1T）
  if ((attacker._bishaDebuf||0) > 0) {
    _atkDebufRates.push(attacker._bishaDebuf); _atkModLabels.push(`毘沙門天-${Math.round(attacker._bishaDebuf*100)}%`);
  }
  // 剛の武者: 攻撃者の計略与ダメ-75%
  if (isChi && (attacker._gounoDebufT||0) > 0) {
    _atkDebufRates.push(0.75); _atkModLabels.push(`剛の武者-75%`);
  }
  // 帰蝶デバフ: 攻撃者の与ダメ低下
  if ((attacker._kichoDebuf||0) > 0) {
    const r = Math.min(1, attacker._kichoDebuf);
    _atkDebufRates.push(r); _atkModLabels.push(`帰蝶-${Math.round(r*100)}%`);
  }
  // 破陣: 攻撃者の与ダメ増加
  if ((attacker.hajiRate||0) > 0) {
    _atkBuffRates.push(attacker.hajiRate); _atkModLabels.push(`破陣+${Math.round(attacker.hajiRate*100)}%`);
  }
  // 特性: 攻撃者の与ダメ倍率（全体・兵刃・計略）
  const _tAtk = attacker.traitAtkMult || 1;
  if (_tAtk > 1) { _atkBuffRates.push(_tAtk - 1); _atkModLabels.push(`特性与ダメ+${Math.round((_tAtk-1)*100)}%`); }
  else if (_tAtk < 1) { _atkDebufRates.push(1 - _tAtk); _atkModLabels.push(`特性与ダメ-${Math.round((1-_tAtk)*100)}%`); }
  if (isMelee) {
    const _tBu = attacker.traitBuAtkMult || 1;
    if (_tBu > 1) { _atkBuffRates.push(_tBu - 1); _atkModLabels.push(`特性兵刃+${Math.round((_tBu-1)*100)}%`); }
    else if (_tBu < 1) { _atkDebufRates.push(1 - _tBu); _atkModLabels.push(`特性兵刃-${Math.round((1-_tBu)*100)}%`); }
  }
  if (isChi) {
    const _tChi = attacker.traitChiAtkMult || 1;
    if (_tChi > 1) { _atkBuffRates.push(_tChi - 1); _atkModLabels.push(`特性計略+${Math.round((_tChi-1)*100)}%`); }
    else if (_tChi < 1) { _atkDebufRates.push(1 - _tChi); _atkModLabels.push(`特性計略-${Math.round((1-_tChi)*100)}%`); }
    // 秋水一色: 計略与ダメ+20%
    if ((attacker._shuusuiBuf||0) > 0) {
      _atkBuffRates.push(attacker._shuusuiBuf); _atkModLabels.push(`秋水一色+${Math.round(attacker._shuusuiBuf*100)}%`);
    }
  }
  // 与ダメ修正を一括適用（同種乗算・バフ/デバフ間加算）
  if (_atkBuffRates.length > 0 || _atkDebufRates.length > 0) {
    const _buffNet  = _atkBuffRates.reduce( (acc, r) => acc + r, 0);
    const _debufNet = _atkDebufRates.reduce((acc, r) => acc + r, 0);
    const _netMult  = Math.max(0, 1 + _buffNet - _debufNet);
    const _netPct   = Math.round((_netMult - 1) * 100);
    const _sign = _netPct >= 0 ? '+' : '';
    applyMod(`与ダメ[${_atkModLabels.join('・')}]→${_sign}${_netPct}%`, Math.round(finalDmg * _netMult));
  }

  // ─ 被ダメ修正（目標の被ダメ軽減・増加） ─
  // 罵詈雑言: 通常攻撃・突撃の被ダメ50%カット（能動戦法は対象外）
  if (isMelee && target.baritauntProtect && !st._isActiveSkill)
    applyMod(`罵詈雑言防御`, Math.round(finalDmg * 0.5));
  // 御旗楯無: 被ダメ時40%（武勇依存）で被ダメ-40%（知略依存）軽減
  const _hasMihata = target.slots?.some(s=>s?.name==='御旗楯無') || target.fixed?.name==='御旗楯無';
  if (_hasMihata) {
    const _mhProb = Math.min(1.0, 0.40 * statScale(target.bu||100));
    if (Math.random() < _mhProb) {
      const _mhReduce = Math.min(0.80, 0.40 * statScale(target.chi||100));
      applyMod(`御旗楯無`, Math.round(finalDmg * (1 - _mhReduce)));
    }
  }
  // 十面埋伏: 防御側の被ダメ+18%（_jubai は増加率の合計値）
  if ((target._jubai||0) > 0)
    applyMod(`十面埋伏`, Math.round(finalDmg * (1 + target._jubai)));
  // 特性: 防御側の被ダメ軽減（全体・兵刃・計略）
  if ((target.traitDefReduce||0) > 0)
    applyMod(`特性被ダメ軽減`, Math.round(finalDmg * (1 - target.traitDefReduce)));
  if (isMelee && (target.traitBuDefReduce||0) > 0)
    applyMod(`特性兵刃被ダメ軽減`, Math.round(finalDmg * (1 - target.traitBuDefReduce)));
  if (isChi && (target.traitChiDefReduce||0) > 0)
    applyMod(`特性計略被ダメ軽減`, Math.round(finalDmg * (1 - target.traitChiDefReduce)));
  // 盤石耽々: 被ダメ軽減（統率依存、毎T増加）
  if ((target._bandokuDef||0) > 0)
    applyMod(`盤石耽々`, Math.round(finalDmg * (1 - target._bandokuDef)));
  // 風林火山【山】: 被ダメ-22%
  if (isMelee && (target._furinDefBuf||0) > 0)
    applyMod(`風林火山(山)`, Math.round(finalDmg * (1 - target._furinDefBuf)));
  // 金城湯池: 自身被ダメ-15%（1T）
  if ((target._kinjoDefT||0) > 0)
    applyMod(`金城湯池防御`, Math.round(finalDmg * 0.85));
  // 勇志不抜: 被ダメ-20%（簡略化: 肩代わりは省略）
  if ((target._yuushiBeiT||0) > 0)
    applyMod(`勇志不抜防御`, Math.round(finalDmg * 0.80));
  // 献身: 仙桃院の被ダメ+20%（自身のターンに付与）
  if (target._kensinSelfDebuf)
    applyMod(`献身自己デバフ`, Math.round(finalDmg * 1.20));
  // 警戒周到: 対象サイドの全体被ダメ-22%（知略依存）
  const _tgtSide = attackerIsSelf ? 'enemy' : 'ally';
  if (st._keikaiSide && st._keikaiSide === _tgtSide && (st._keikaiTurns||0) > 0) {
    const _keiReduce = Math.min(0.60, 0.22 * statScale(st._keikaiChi||100));
    applyMod(`警戒周到防御`, Math.round(finalDmg * (1 - _keiReduce)));
  }

  // バフ/デバフ修正を st._lastMods に格納（攻撃ログ側で1行に統合して表示）
  if (mods.length > 0) {
    const totalPct = Math.round((finalDmg - dmg) / dmg * 100);
    const totalSign = totalPct >= 0 ? '+' : '';
    st._lastMods = ` ※修正[${mods.join('・')}]→${finalDmg.toLocaleString()}(計${totalSign}${totalPct}%)`;
  } else {
    st._lastMods = '';
  }

  // 猪武者特性：兵刃ダメ与時60%で会心率+1%・会心ダメ率+1%（最大6スタック）
  if (isMelee && finalDmg > 0 && (attacker._inobuCnt||0) < 6) {
    const _hasInobu = attacker.fixed?.name === '猪武者' || attacker.slots?.some(s => s?.name === '猪武者')
      || (attacker.activeTraits && attacker.activeTraits.includes('猪武者'));
    if (_hasInobu) {
      if (Math.random() < 0.60) {
        attacker._inobuCnt = (attacker._inobuCnt || 0) + 1;
        attacker.critRate = Math.min(1.0, (attacker.critRate || 0) + 0.01);
        attacker.critBonus = (attacker.critBonus || 0.5) + 0.01;
        (st._pendingPostAttackLogs = st._pendingPostAttackLogs||[]).push({cls:'log-buff', msg:`  猪武者(${attacker.name}) 会心+1%・会心ダメ+1% [${attacker._inobuCnt}スタック]（会心${Math.round((attacker.critRate||0)*100)}%・ダメ率${Math.round((attacker.critBonus||0.5)*100)}%）`});
      } else {
        (st._pendingPostAttackLogs = st._pendingPostAttackLogs||[]).push({cls:'log-info', msg:`  猪武者(${attacker.name}) 確率により不発`});
      }
    }
  }

  // 傭兵シールド: ダメージをHPより先に吸収（重ね掛け可能）
  if ((target.yoheiHp||0) > 0 && finalDmg > 0) {
    const _yAbsorb = Math.min(target.yoheiHp, finalDmg);
    target.yoheiHp -= _yAbsorb;
    finalDmg -= _yAbsorb;
    mods.push(`傭兵吸収(-${_yAbsorb.toLocaleString()})`);
    if (finalDmg <= 0) {
      st._lastMods = ` ※傭兵吸収[${_yAbsorb.toLocaleString()}]（傭兵残${target.yoheiHp.toLocaleString()}）`;
      return 0;
    }
  }

  // 負傷兵・死亡兵の分割（ダメージの9割が負傷、1割が死亡）
  const injuredGain = Math.round(finalDmg * 0.9);
  const deadGain = finalDmg - injuredGain;
  target.injured = (target.injured || 0) + injuredGain;
  target.dead = (target.dead || 0) + deadGain;
  target.hp = Math.max(0, target.hp - finalDmg);

  // 回生：ダメージを受けるたびに発動（kaiseiT > 0の間）
  if (target.hp > 0 && (target.kaiseiT || 0) > 0 && finalDmg > 0) {
    const _kProb = target.kaiseiProb ?? 0.50;
    const _kRate = target.kaiseiHealRate ?? 66;
    const _kStat = (target.kaiseiDepStat || 0) > 0 ? target.kaiseiDepStat : (target.chi || 100);
    if (Math.random() < _kProb) {
      const h = applyHealRate(target.hp, _kStat, _kRate);
      const tgtSide = attackerIsSelf ? 'enemy' : 'ally';
      const {healed: _kaiseiH, remainHp: _kaiseiRH} = applyHeal(target, h, st, tgtSide);
      if (_kaiseiH > 0) (st._pendingPostAttackLogs = st._pendingPostAttackLogs||[]).push({cls:'log-heal', msg:`  回生(${target.name}) ダメ受け→+${_kaiseiH.toLocaleString()}（残${_kaiseiRH.toLocaleString()}）`});
    }
  }

  // 同気連枝: マーク済み攻撃者からのダメ時に被攻撃者を回復（80%*statScale(知略)、回復量28%*statScale）
  if (finalDmg > 0 && st._doukiMarked?.includes(attacker) && st._doukiHolder?.hp > 0) {
    const prob = Math.min(1.0, 0.80 * statScale(st._doukiHolder.chi));
    if (Math.random() < prob) {
      const healRate = Math.min(1.0, 0.28 * statScale(st._doukiHolder.chi));
      const healAmt  = Math.round(finalDmg * healRate);
      const tgtSide  = attackerIsSelf ? 'enemy' : 'ally';
      const { healed: _dkH, remainHp: _dkRH } = applyHeal(target, healAmt, st, tgtSide);
      if (_dkH > 0) {
        (st._pendingPostAttackLogs = st._pendingPostAttackLogs||[]).push({
          cls: 'log-heal',
          msg: `  同気連枝(${st._doukiHolder.name}→${target.name}) 回復+${_dkH.toLocaleString()}（残${_dkRH.toLocaleString()}）`
        });
      }
    }
  }

  // 死中求活: 被兵刃ダメ時 武勇+5（最大10回）
  if (isMelee && finalDmg > 0 && target.hp > 0) {
    const _hasSCK = target.slots?.some(s=>s?.name==='死中求活') || target.fixed?.name==='死中求活';
    if (_hasSCK && (target._sckStack||0) < 10) {
      target._sckStack = (target._sckStack||0) + 1;
      target.bu = (target.bu||100) + 5;
      (st._pendingPostAttackLogs = st._pendingPostAttackLogs||[]).push({cls:'log-buff', msg:`  死中求活(${target.name}) 被兵刃→武勇+5 [${target._sckStack}スタック]（武勇${Math.round(target.bu)}）`});
    }
  }

  // 城盗り: 計略ダメージを与えた時、対象に城盗りフラグがあれば追加計略106%を発動
  if (isChi && finalDmg > 0 && target._shiroFlag && target._shiroAttacker?.hp > 0) {
    const shiroAtk = target._shiroAttacker;
    const shiroIsSelf = target._shiroIsSelf;
    target._shiroFlag = false;
    target._shiroAttacker = null;
    target._shiroIsSelf = false;
    const shiroChi = shiroAtk.chi + (shiroAtk._shiroChi || 0);
    const base2 = baseDmg(shiroChi, target.chi, shiroAtk.hp);
    let d2 = applyRate(base2, 106, shiroChi, true);
    const kr2 = applyKiryaku(d2, shiroAtk, st, shiroIsSelf);
    d2 = kr2.val;
    const actualShiro = dealDmg(st, target, d2, shiroAtk, shiroIsSelf, false, true);
    const shiroLogCls = shiroIsSelf ? 'log-ally' : 'log-enemy';
    // 城盗りログはトリガーした計略ダメのログの後に表示（pending機構を使用）
    const _shiroMsg = `  城盗り発動(${shiroAtk.name}→${target.name}) 計略[${actualShiro.toLocaleString()}]${kr2.label}（残${target.hp.toLocaleString()}）${st._lastMods||''}`;
    (st._pendingPostAttackLogs = st._pendingPostAttackLogs||[]).push({cls: shiroLogCls, msg: _shiroMsg});
    st._lastMods = '';
  }

  return finalDmg;
}

// 回復処理（負傷兵プールからのみ回復可能）
// 戻り値: { healed: 回復量, remainHp: 回復後のHP }
function applyHeal(target, h, st=null, side=null) {
  if (target.healBlock) return { healed: 0, remainHp: target.hp };
  const healable = Math.min(h, target.injured || 0);
  if (healable <= 0) return { healed: 0, remainHp: target.hp };
  target.injured -= healable;
  target.hp = Math.min(target.maxHp - (target.dead || 0), target.hp + healable);
  // 水の如し: 1T1度の回復時に奇策確率+5%
  if (st && side && target.fixed?.name === '水の如し' && !target._mizuHealedThisTurn) {
    target._mizuHealedThisTurn = true;
    target.kiryakuRate = Math.min(1.0, (target.kiryakuRate || 0) + 0.05);
    addLog(st, side === 'ally' ? 'log-ally' : 'log-enemy', `  水の如し(${target.name}) 回復→奇策+5%（計${Math.round(target.kiryakuRate*100)}%）`);
  }
  return { healed: healable, remainHp: target.hp };
}
