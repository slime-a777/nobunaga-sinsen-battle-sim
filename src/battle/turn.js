// ═══════════════════════════════════════
// メインターン処理
// ═══════════════════════════════════════
function processTurn(st, advMult) {
  st.turn++;
  // ターン開始時フラグリセット
  ['ally','enemy'].forEach(side => st[side].forEach(u => { u._mizuHealedThisTurn = false; }));
  // 行動順プレビュー（速度順）
  const turnOrder = [
    ...st.ally.map((u,i)=>({u,side:'ally',i})),
    ...st.enemy.map((u,i)=>({u,side:'enemy',i})),
  ].filter(x=>x.u.hp>0).sort((a,b)=>(b.u.spd||0)-(a.u.spd||0));
  const orderStr = turnOrder.map(x=>`${x.side==='ally'?'[自]':'[敵]'}${x.u.name}(${x.u.spd})`).join(' → ');
  addLog(st,'log-turn',`── 第${st.turn}ターン ── 行動順: ${orderStr}`);

  // 指揮戦法セットアップ（T1のみ）
  ['ally','enemy'].forEach(side => {
    st[side].forEach((me, idx) => {
      if (me.hp <= 0) return;
      execCommand(st, me, side==='ally', idx === 0);
    });
  });

  // 行動順: 速度(spd)の降順にソート。同速の場合は乱数で決定
  const order = [
    ...st.ally.map((u, idx) => ({ side:'ally',  idx })),
    ...st.enemy.map((u, idx) => ({ side:'enemy', idx })),
  ].sort((a, b) => {
    const spdA = st[a.side][a.idx].spd || 0;
    const spdB = st[b.side][b.idx].spd || 0;
    return spdB - spdA || Math.random() - 0.5; // 同速はランダム
  });
  let _unitSeq = 0;
  for (const { side, idx } of order) {
    const me = st[side][idx];
    const isSelf = side==='ally';
    if (me.hp <= 0) continue;

    _unitSeq++;

    // ─ 継続ダメージ（行動直前に発動）─
    // 火傷（戦法ごとに異なるrate: _kaenRate、デフォルト74%/T）
    if ((me._kaen||0) > 0) {
      const _kaenRate = me._kaenRate || 74;
      let d = applyRate(baseDmg(me.chi || 150, me.chi, me.hp), _kaenRate, me.chi || 150, true);
      let _kaenLabel = '';
      if ((me._kaenKirRate||0) > 0 && Math.random() < me._kaenKirRate) { d = Math.round(d * (1.5 + (me._kaenKirBonus||0))); _kaenLabel = '⚡奇策'; }
      me.injured = (me.injured||0) + Math.round(d*0.9);
      me.dead    = (me.dead||0)    + Math.round(d*0.1);
      me.hp = Math.max(0, me.hp - d);
      addLog(st, 'log-ctrl', `  火傷継続(${me.name}) [${d.toLocaleString()}]${_kaenLabel}（残${me.hp.toLocaleString()}）`);
      me._kaen--;
      if (me.hp <= 0) continue;
    }
    // 水攻め（戦法ごとに異なるrate: suikouRate、デフォルト102%/T）
    if ((me.suikouT||0) > 0) {
      const pow = me.suikouPower || 180;
      const _suikouRate = me.suikouRate || 102;
      let d = applyRate(baseDmg(pow, me.chi, me.hp), _suikouRate, pow, true);
      let _suikouLabel = '';
      if ((me.suikouKirRate||0) > 0 && Math.random() < me.suikouKirRate) { d = Math.round(d * (1.5 + (me.suikouKirBonus||0))); _suikouLabel = '⚡奇策'; }
      me.injured = (me.injured||0) + Math.round(d*0.9);
      me.dead    = (me.dead||0)    + Math.round(d*0.1);
      me.hp = Math.max(0, me.hp - d);
      addLog(st, 'log-ctrl', `  水攻め継続(${me.name}) [${d.toLocaleString()}]${_suikouLabel}（残${me.hp.toLocaleString()}）`);
      me.suikouT--;
      if (me.suikouT <= 0) me.healBlock = false;
      if (me.hp <= 0) continue;
    }
    // 中毒（85%/T）
    if ((me.chudokuT||0) > 0) {
      const pow = me.chudokuPow || 150;
      let d = applyRate(baseDmg(pow, me.chi, me.hp), 85, pow, true);
      let _chudokuLabel = '';
      if ((me.chudokuKirRate||0) > 0 && Math.random() < me.chudokuKirRate) { d = Math.round(d * (1.5 + (me.chudokuKirBonus||0))); _chudokuLabel = '⚡奇策'; }
      me.injured = (me.injured||0) + Math.round(d*0.9);
      me.dead    = (me.dead||0)    + Math.round(d*0.1);
      me.hp = Math.max(0, me.hp - d);
      addLog(st, 'log-ctrl', `  中毒継続(${me.name}) [${d.toLocaleString()}]${_chudokuLabel}（残${me.hp.toLocaleString()}）`);
      me.chudokuT--;
      if (me.hp <= 0) continue;
    }
    // 旋乾転坤（恐慌）継続ダメ
    if ((me._kyokouT||0) > 0) {
      const _kyokouBase = baseDmg(me._kyokouPow||100, me.chi, me.hp);
      const _kyokouDmg = applyRate(_kyokouBase, me._kyokouRate||34, me._kyokouPow||100, true);
      me.injured = (me.injured||0) + Math.round(_kyokouDmg*0.9);
      me.dead    = (me.dead||0)    + Math.round(_kyokouDmg*0.1);
      me.hp = Math.max(0, me.hp - _kyokouDmg);
      addLog(st, 'log-ctrl', `  旋乾転坤恐慌継続(${me.name}) [${_kyokouDmg.toLocaleString()}]（残${me.hp.toLocaleString()}）`);
      if (me.hp <= 0) continue;
    }
    // 消沈（104%/T、付与者の知略依存）
    if ((me.shochinT||0) > 0) {
      const pow = me.shochinPow || 150;
      let d = applyRate(baseDmg(pow, me.chi, me.hp), 104, pow, true);
      let _shochinLabel = '';
      if ((me.shochinKirRate||0) > 0 && Math.random() < me.shochinKirRate) { d = Math.round(d * (1.5 + (me.shochinKirBonus||0))); _shochinLabel = '⚡奇策'; }
      me.injured = (me.injured||0) + Math.round(d*0.9);
      me.dead    = (me.dead||0)    + Math.round(d*0.1);
      me.hp = Math.max(0, me.hp - d);
      addLog(st, 'log-ctrl', `  消沈継続(${me.name}) [${d.toLocaleString()}]${_shochinLabel}（残${me.hp.toLocaleString()}）`);
      me.shochinT--;
      if (me.hp <= 0) continue;
    }
    // 潰走（武勇依存、会心あり: 付与者の会心率を使用）
    if ((me.kaisoT||0) > 0) {
      const pow = me.kaisoPow || 150;
      const rate = me.kaisoRate || 94;
      const base = applyRate(baseDmg(pow, me.to, me.hp), rate);
      const cr = applyCrit(base, { critRate: me.kaisoCritRate||0, critBonus: me.kaisoCritBonus||0.5 });
      me.injured = (me.injured||0) + Math.round(cr.val*0.9);
      me.dead    = (me.dead||0)    + Math.round(cr.val*0.1);
      me.hp = Math.max(0, me.hp - cr.val);
      addLog(st, 'log-ctrl', `  潰走継続(${me.name}) [${cr.val.toLocaleString()}]${cr.label}（残${me.hp.toLocaleString()}）`);
      me.kaisoT--;
      if (me.hp <= 0) continue;
    }

    // 金城湯池: 行動前に自身を回復78%
    if (me._kinjoHealNext) {
      me._kinjoHealNext = false;
      const _kh = applyHealRate(me.hp, me.chi, 78);
      const {healed:_kha, remainHp:_khr} = applyHeal(me, _kh, st, isSelf?'ally':'enemy');
      if (_kha > 0) addLog(st,'log-heal',`  金城湯池(${me.name}) 行動前回復+${_kha.toLocaleString()}（残${_khr.toLocaleString()}）`);
    }

    // 武将行動ヘッダー（継続ダメージ後の実兵数を表示）
    addLog(st, isSelf?'log-ally':'log-enemy',
      `${_unitSeq}. ${isSelf?'自陣営':'敵陣営'}: ${me.name} 兵数${me.hp.toLocaleString()} 統率${Math.round(me.to)},知略${Math.round(me.chi + (me._shiroChi||0))},武勇${Math.round(me.bu)}`);

    const opp = isSelf ? st.enemy : st.ally;
    const allies = isSelf ? st.ally : st.enemy;
    const sideLabel = isSelf ? '[自]' : '[敵]';
    const logSide = isSelf ? 'log-ally' : 'log-enemy';

    // 千成瓢箪: 保持武将の行動時に自軍2名（または全体）を回復
    if (me.fixed?.name === '千成瓢箪' && me.hp > 0) {
      const _isTaishoU = (idx === 0);
      const _zenProb = _isTaishoU ? 0.70 : 0.35;
      const _isZen = Math.random() < _zenProb;
      const _mySide = isSelf ? 'ally' : 'enemy';
      const _healTargets = _isZen ? allies.filter(e=>e.hp>0) : allies.filter(e=>e.hp>0).slice(0,2);
      _healTargets.forEach(e=>{
        const h = applyHealRate(me.hp, me.chi, 76);
        const {healed:_ah, remainHp:_rh} = applyHeal(e, h, st, _mySide);
        if (_ah > 0) addLog(st,'log-heal',`  千成瓢箪(${me.name}→${e.name}) +${_ah.toLocaleString()}（残${_rh.toLocaleString()}）`);
        else addLog(st,'log-info',`  千成瓢箪(${me.name}→${e.name}) 回復不発（負傷兵なし）`);
      });
      if (_isZen) addLog(st,'log-heal',`  千成瓢箪 全体回復発動！（${_healTargets.length}名）${_isTaishoU?'【大将技】':''}`);
    }

    // 気勢衝天: 保持武将の行動時に敵の武勇最高・知略最高者に与ダメ-30%を付与
    const _kiseiHolder = me.slots?.some(s=>s?.name==='気勢衝天') || me.fixed?.name==='気勢衝天';
    if (_kiseiHolder && me.hp > 0 && (st.kiseiTurns||0) > 0 && st.kiseiSide === (isSelf?'ally':'enemy')) {
      opp.filter(b=>b.hp>0).forEach(b => { b.kiseiDebufBu = false; b.kiseiDebufChi = false; });
      const _oppArr = opp.filter(b=>b.hp>0);
      if (_oppArr.length) {
        const _maxBu  = _oppArr.reduce((a,b)=>(b.bu>a.bu?b:a), _oppArr[0]);
        const _maxChi = _oppArr.reduce((a,b)=>(b.chi>a.chi?b:a), _oppArr[0]);
        if (Math.random() < 0.80) {
          _maxBu.kiseiDebufBu = true;
          addLog(st,'log-ctrl',`  気勢衝天(${me.name}): ${_maxBu.name} 兵刃与ダメ-30%`);
        }
        if (Math.random() < 0.80) {
          _maxChi.kiseiDebufChi = true;
          addLog(st,'log-ctrl',`  気勢衝天(${me.name}): ${_maxChi.name} 計略与ダメ-30%`);
        }
      }
    }

    // 一領具足: T1〜2 被ダメ-12%（武勇依存）/ T3〜4 全体に傭兵付与（統率依存）
    const _ichiryoHolder = me.slots?.some(s=>s?.name==='一領具足');
    if (_ichiryoHolder && me.hp > 0 && st.ichiryo && st.ichiryo.side === (isSelf?'ally':'enemy')) {
      const _icT = st.ichiryo.turns;
      if (_icT > 2) {
        const _defPct = Math.round(Math.min(24, 12 * statScale(st.ichiryo.bu)));
        addLog(st,'log-buff',`  一領具足(${me.name}): 自軍全体 被ダメ-${_defPct}%(武勇依存) 継続中`);
      } else {
        const _yRate = 0.96 * statScale(st.ichiryo.to);
        allies.filter(a=>a.hp>0).forEach(a => {
          const _add = Math.round(a.maxHp * _yRate);
          a.yoheiHp = (a.yoheiHp||0) + _add;
          addLog(st,'log-buff',`  一領具足 傭兵(${a.name}) +${_add.toLocaleString()}（傭兵計${a.yoheiHp.toLocaleString()}）`);
        });
      }
    }

    // 電光雷轟の1ターン1回制限フラグをリセット
    me._denkaiDone = false;

    // 威圧チェック（能動・通常攻撃・突撃のみ不能。受動・指揮は準備期間として発動済み）
    let _skipAction = false;
    if ((me.iatsuT||0) > 0) {
      addLog(st,'log-ctrl',`  威圧: ${me.name} 行動不能`);
      me.iatsuT--;
      _skipAction = true;
    }
    // 麻痺チェック（30%で行動不能）
    if (!_skipAction && me.muku > 0) {
      if (Math.random() < 0.30) {
        addLog(st,'log-ctrl',`  麻痺効果が発動し、${me.name} 行動不能`);
        me.muku--;
        _skipAction = true;
      } else {
        addLog(st,'log-info',`  麻痺効果は確率により不発（${me.name} 行動可）`);
        me.muku = Math.max(0, me.muku-1);
      }
    }

    if (!_skipAction) {
    // ─ 能動戦法（固有→覚醒前伝授→覚醒後伝授の順） ─
    st._isActiveSkill = true;
    execFixed(st, me, isSelf, advMult, idx === 0, ['active']);
    (me.slots||[]).forEach(sk => {
      if (sk) execSlot(st, sk, me, isSelf, advMult, ['active']);
    });
    st._isActiveSkill = false;

    // ─ 通常攻撃（封撃チェック：通常攻撃のみ不可）─
    const myFuuseki = st.fuuseki[isSelf?'ally':'enemy'][idx];
    if (myFuuseki > 0 && !(me.fuusekiResist > 0)) {
      addLog(st,'log-ctrl',`  封撃: ${me.name} 通常攻撃不可`);
    } else {
      if (myFuuseki > 0 && me.fuusekiResist > 0) addLog(st,'log-buff',`  封撃耐性(${me.name}): 封撃を無効化`);
      // 挑発: キャスターの反対サイドが行動する場合に強制ターゲット変更（双方向）
      const actingSide = isSelf ? 'ally' : 'enemy';
      const isTaunted = st.baritaunt > 0 && st.baritauntSide && st.baritauntSide !== actingSide
                       && Math.random() < (st.baritauntProb || 1.0);

      // 乱舞の発動率リストを事前計算（重ね掛け対応：全ソースを合算して独立発動）
      let ranzuRates = [];
      if (me.fixed?.name === '七本槍筆頭') {
        const bonus = Math.min(Math.floor((me.shichiHitCnt||0) / 5) * 0.13, 0.39);
        ranzuRates.push(Math.min(0.92 + bonus, 1.0));
      }
      if ((me.ranzuList||[]).length > 0) {
        me.ranzuList.filter(r=>r.t>0).forEach(r => ranzuRates.push(r.rate));
      }

      // 1回の通常攻撃＋乱舞を実行するローカル関数
      const doOneAtk = (label) => {
        let tgt;
        if ((me.confused||0) > 0) {
          const allLive = [...st.ally,...st.enemy].filter(u=>u.hp>0&&u!==me);
          tgt = allLive.length ? allLive[Math.floor(Math.random()*allLive.length)] : null;
          if (tgt) addLog(st,'log-ctrl',`  混乱: ${me.name}→${tgt.name} ランダム攻撃`);
        } else if (isTaunted) {
          const tt = opp[st.baritauntIdx];
          tgt = tt?.hp > 0 ? tt : pickTarget(opp);
          if (tgt) addLog(st,'log-ctrl',`  罵詈雑言による挑発: ${me.name}→${tgt.name}に強制攻撃`);
        } else {
          tgt = pickTarget(opp);
        }
        if (!tgt) return;
        // 耐苦鍛錬（千坂景親）大将援護: T3まで 敵が大将に攻撃→30%で千坂が代わりに受ける
        {
          const _defTeam = isSelf ? st.enemy : st.ally;
          const _taishoUnit2 = _defTeam[0];
          if (tgt === _taishoUnit2 && st.turn <= 3) {
            const _takidaHolder2 = _defTeam.find(a => a.hp > 0 && a.fixed?.name === '耐苦鍛錬' && a !== _taishoUnit2);
            if (_takidaHolder2 && Math.random() < 0.30) {
              addLog(st, 'log-buff', `  耐苦鍛錬(${_takidaHolder2.name}): 大将${_taishoUnit2.name}への攻撃を肩代わり`);
              tgt = _takidaHolder2;
            }
          }
        }
        // 離反チェック：通常攻撃が味方に向く（混乱・挑発時は対象変更しない）
        if (!isTaunted && !((me.confused||0) > 0) && (me.renegadeRate||0) > 0 && Math.random() < me.renegadeRate) {
          const renegCandidates = allies.filter(a => a !== me && a.hp > 0);
          if (renegCandidates.length > 0) {
            tgt = renegCandidates[Math.floor(Math.random() * renegCandidates.length)];
            addLog(st, 'log-ctrl', `  離反(${me.name})→(${tgt.name}) 攻撃が味方に！`);
          }
        }
        let dmgBase = baseDmg(me.bu, tgt.to, me.hp);
        // 兵種有利：自軍有利なら自軍×advMult、敵軍×(2-advMult)（例: 1.15→0.85）
        dmgBase *= isSelf ? advMult : (2.0 - advMult);
        dmgBase *= (me.buff_atkDmg||1.0);
        // 軍神: スタック分の通常攻撃ダメ増加（通常攻撃後リセット）
        if (me.fixed?.name === '軍神' && (me.gunshinkStack||0) > 0) {
          dmgBase *= (1 + me.gunshinkStack * 0.10);
          me.gunshinkStack = 0;
        }
        let critLabel = '';
        let effectiveCritRate = me.critRate || 0;
        // 以戦養戦: HP50%以下で会心+25%
        if (me.slots?.some(s => s?.name === '以戦養戦') && me.hp < me.maxHp * 0.5) {
          effectiveCritRate = Math.min(1.0, effectiveCritRate + 0.25);
        }
        if (effectiveCritRate > 0 && Math.random() < effectiveCritRate) {
          dmgBase *= (1 + (me.critBonus||0.5)); critLabel = ' ★会心';
        }
        const fin = dealDmg(st, tgt, Math.round(dmgBase * rand4()), me, isSelf, true);
        if (fin > 0) {
          addLog(st, logSide, `  ${sideLabel} ${me.name}→${tgt.name} ${label} [${fin.toLocaleString()}]${critLabel}（残${tgt.hp.toLocaleString()}）${st._lastMods||''}`);
          st._lastMods = '';
          (st._pendingPostAttackLogs||[]).forEach(({cls, msg}) => addLog(st, cls, msg));
          st._pendingPostAttackLogs = [];
          if (me.fixed?.name === '七本槍筆頭') me.shichiHitCnt++;
          if (st.hiyokuSide && st.hiyokuSide !== (isSelf?'ally':'enemy')) st.hiyokuAccum += fin * 0.75;
          // 沈魚落雁: 通常攻撃被弾時に記録→突撃戦法発動後に処理
          if (tgt.slots?.some(s=>s?.name==='沈魚落雁') || tgt.fixed?.name==='沈魚落雁') {
            _chingyoPending.push({ attacker: me, defender: tgt });
          }
          // 古今独歩: 通常攻撃被弾時48%で反撃＋離反4%獲得
          if (tgt.fixed?.name === '古今独歩' && Math.random() < 0.48) {
            const cBase = baseDmg(tgt.bu, me.to, tgt.hp);
            const cFin = dealDmg(st, me, Math.round(applyRate(cBase, 70) * rand4()), tgt, !isSelf, true);
            if (cFin > 0) {
              addLog(st, isSelf?'log-enemy':'log-ally', `  古今独歩反撃(${tgt.name}→${me.name}) 兵刃[${cFin.toLocaleString()}]（残${me.hp.toLocaleString()}）${st._lastMods||''}`);
              st._lastMods = '';
              (st._pendingPostAttackLogs||[]).forEach(({cls, msg}) => addLog(st, cls, msg));
              st._pendingPostAttackLogs = [];
            }
            const tgtTeam = isSelf ? st.enemy : st.ally;
            const tgtIdx = tgtTeam.indexOf(tgt);
            const maxReneg = (tgtIdx === 0) ? 0.40 : 0.32;
            tgt.renegadeRate = Math.min((tgt.renegadeRate||0) + 0.04, maxReneg);
            addLog(st, 'log-buff', `  古今独歩: ${tgt.name} 離反+4%（計${Math.round(tgt.renegadeRate*100)}%）`);
          }
          // 鬼美濃: 被ダメ時35%で弱体浄化＋回復112%
          if (tgt.fixed?.name === '鬼美濃' && Math.random() < 0.35) {
            const cleared = purify(tgt, 1);
            const hb = applyHealRate(tgt.hp, tgt.to, 112);
            const _kibiSide = isSelf ? 'enemy' : 'ally';
            const {healed:_kbAh, remainHp:_kbRh} = applyHeal(tgt, hb, st, _kibiSide);
            addLog(st, 'log-heal', `  鬼美濃(${tgt.name}) 浄化[${cleared.join(',')||'なし'}]+回復+${_kbAh.toLocaleString()}（残${_kbRh.toLocaleString()}）`);
          }
          // 御旗楯無: 通常攻撃被弾時40%（統率依存）で友軍単体が反撃（兵刃94%）
          if (tgt.slots?.some(s=>s?.name==='御旗楯無') || tgt.fixed?.name==='御旗楯無') {
            const _tgtTeam = isSelf ? st.enemy : st.ally;
            const _tgtAllies = _tgtTeam.filter(a=>a.hp>0&&a!==tgt);
            const _mhCProb = Math.min(1.0, 0.40 * statScale(tgt.to||100));
            if (_tgtAllies.length > 0 && Math.random() < _mhCProb) {
              const _cu = _tgtAllies[Math.floor(Math.random()*_tgtAllies.length)];
              const _cFin = dealDmg(st, me, Math.round(applyRate(baseDmg(_cu.bu, me.to, _cu.hp), 94) * rand4()), _cu, !isSelf, true);
              if (_cFin > 0) {
                addLog(st, isSelf?'log-enemy':'log-ally', `  御旗楯無反撃(${_cu.name}→${me.name}) 兵刃[${_cFin.toLocaleString()}]（残${me.hp.toLocaleString()}）${st._lastMods||''}`);
                st._lastMods = '';
                (st._pendingPostAttackLogs||[]).forEach(({cls, msg}) => addLog(st, cls, msg));
                st._pendingPostAttackLogs = [];
              }
            }
          }
          // 腹中鱗甲: 被通攻時 反撃 兵刃52%（大将: 52%、非大将: 62%）
          if ((tgt.slots?.some(s=>s?.name==='腹中鱗甲') || tgt.fixed?.name==='腹中鱗甲') && tgt.hp > 0) {
            const _hcRate = (isSelf ? st.enemy : st.ally).indexOf(tgt) === 0 ? 52 : 62;
            const _hcFin = dealDmg(st, me, Math.round(applyRate(baseDmg(tgt.bu, me.to, tgt.hp), _hcRate) * rand4()), tgt, !isSelf, true);
            if (_hcFin > 0) {
              addLog(st, isSelf?'log-enemy':'log-ally', `  腹中鱗甲反撃(${tgt.name}→${me.name}) 兵刃[${_hcFin.toLocaleString()}]（残${me.hp.toLocaleString()}）${st._lastMods||''}`);
              st._lastMods = '';
              (st._pendingPostAttackLogs||[]).forEach(({cls, msg}) => addLog(st, cls, msg));
              st._pendingPostAttackLogs = [];
            }
          }
          // 反撃（senpo.js active type）: _hankiT > 0 の間 被通攻時 攻撃者に兵刃60%（または不屈の精神148%）
          if ((tgt._hankiT||0) > 0 && tgt.hp > 0) {
            const _hkRate = (tgt._hankiPow || 0) > 1 ? Math.round((tgt._hankiPow||1) * 100) : 60;
            const _hkFin = dealDmg(st, me, Math.round(applyRate(baseDmg(tgt.bu, me.to, tgt.hp), _hkRate) * rand4()), tgt, !isSelf, true);
            if (_hkFin > 0) {
              addLog(st, isSelf?'log-enemy':'log-ally', `  反撃(不屈の精神)(${tgt.name}→${me.name}) 兵刃[${_hkFin.toLocaleString()}]（残${me.hp.toLocaleString()}）${st._lastMods||''}`);
              st._lastMods = '';
              (st._pendingPostAttackLogs||[]).forEach(({cls, msg}) => addLog(st, cls, msg));
              st._pendingPostAttackLogs = [];
            }
            // 不屈の精神: 2回被通攻で武勇+36
            if ((tgt._hankiPow||0) > 1) {
              tgt._hankiHitCnt = (tgt._hankiHitCnt||0) + 1;
              if (tgt._hankiHitCnt >= 2) {
                tgt.bu = (tgt.bu||100) + 36;
                tgt._hankiHitCnt = 0;
                addLog(st, isSelf?'log-enemy':'log-ally', `  不屈の精神(${tgt.name}): 2被通攻→武勇+36（現在${Math.round(tgt.bu)}）`);
              }
            }
          }
          // 洞察反撃（岡部元信）: 被通攻時 攻撃者に計略304%（1回消費）
          if ((tgt._dousatsuRevengeT||0) > 0 && tgt.hp > 0) {
            const _drBase = baseDmg(tgt.chi, me.chi, tgt.hp);
            const _drFin = dealDmg(st, me, Math.round(applyRate(_drBase, 304, tgt.chi, true) * rand4()), tgt, !isSelf, false, true);
            tgt._dousatsuRevengeT = 0;
            if (_drFin > 0) {
              addLog(st, isSelf?'log-enemy':'log-ally', `  洞察反撃(${tgt.name}→${me.name}) 計略[${_drFin.toLocaleString()}]（残${me.hp.toLocaleString()}）${st._lastMods||''}`);
              st._lastMods = '';
              (st._pendingPostAttackLogs||[]).forEach(({cls, msg}) => addLog(st, cls, msg));
              st._pendingPostAttackLogs = [];
            }
          }
          // 三楽犬マーク: _sakkoT > 0 の友軍が _sankakuMarked の敵に攻撃した場合 兵刃146%追加
          if ((me._sakkoT||0) > 0 && tgt._sankakuMarked && tgt.hp > 0) {
            const _sankFin = dealDmg(st, tgt, Math.round(applyRate(baseDmg(me.bu, tgt.to, me.hp), 146) * rand4()), me, isSelf, true, false);
            if (_sankFin > 0) {
              addLog(st, logSide, `  三楽犬追加(${me.name}→${tgt.name}) 兵刃[${_sankFin.toLocaleString()}]（残${tgt.hp.toLocaleString()}）${st._lastMods||''}`);
              st._lastMods = '';
            }
          }
          // 献身: _kensinT > 0 の友軍が通攻後 追加で別敵に兵刃262%
          if ((me._kensinT||0) > 0 && tgt.hp >= 0) {
            me._kensinT = 0;
            const _kensinOpp = isSelf ? st.enemy : st.ally;
            const _kensinT2 = pickTarget(_kensinOpp.filter(o=>o.hp>0&&o!==tgt)) || pickTarget(_kensinOpp);
            if (_kensinT2 && _kensinT2.hp > 0) {
              const _ksFin = dealDmg(st, _kensinT2, Math.round(applyRate(baseDmg(me.bu, _kensinT2.to, me.hp), 262) * rand4()), me, isSelf, true, false);
              if (_ksFin > 0) {
                addLog(st, logSide, `  献身追加(${me.name}→${_kensinT2.name}) 兵刃[${_ksFin.toLocaleString()}]（残${_kensinT2.hp.toLocaleString()}）${st._lastMods||''}`);
                st._lastMods = '';
              }
            }
          }
          // 剛毅木訥: 保護対象が被ダメ時 45%で攻撃者に兵刃86%反撃＋対象を回復86%
          if (st._gokiTargets?.includes(tgt) && st._gokiHolder?.hp > 0 && Math.random() < 0.45) {
            const _gHolder = st._gokiHolder;
            const _gIsSelf = st._gokiSide === 'ally';
            const _gFin = dealDmg(st, me, Math.round(applyRate(baseDmg(_gHolder.bu, me.to, _gHolder.hp), 86) * rand4()), _gHolder, _gIsSelf, true, false);
            if (_gFin > 0) {
              addLog(st, _gIsSelf?'log-ally':'log-enemy', `  剛毅木訥反撃(${_gHolder.name}→${me.name}) 兵刃[${_gFin.toLocaleString()}]（残${me.hp.toLocaleString()}）${st._lastMods||''}`);
              st._lastMods = '';
            }
            const _gHeal = applyHealRate(_gHolder.hp, _gHolder.bu, 86);
            const {healed:_gH, remainHp:_gRH} = applyHeal(tgt, _gHeal, st, _gIsSelf?'ally':'enemy');
            if (_gH > 0) addLog(st, 'log-heal', `  剛毅木訥回復(${tgt.name}) +${_gH.toLocaleString()}（残${_gRH.toLocaleString()}）`);
          }
          // 月華鶴影: 保護対象が被ダメ時 holder が35%で敵2〜3名に兵刃102%
          if (st._getsukaGuards?.includes(tgt) && st._getsukaHolder?.hp > 0 && Math.random() < 0.35) {
            const _gtHolder = st._getsukaHolder;
            const _gtIsSelf = st._getsukaIsSelf;
            const _gtOpp = _gtIsSelf ? st.enemy : st.ally;
            const _gtCnt = Math.random() < 0.5 ? 2 : 3;
            _gtOpp.filter(o=>o.hp>0).slice(0, _gtCnt).forEach(gt=>{
              const _gtFin = dealDmg(st, gt, Math.round(applyRate(baseDmg(_gtHolder.bu, gt.to, _gtHolder.hp), 102) * rand4()), _gtHolder, _gtIsSelf, true, false);
              if (_gtFin > 0) {
                addLog(st, _gtIsSelf?'log-ally':'log-enemy', `  月華鶴影(${_gtHolder.name}→${gt.name}) 兵刃[${_gtFin.toLocaleString()}]（残${gt.hp.toLocaleString()}）${st._lastMods||''}`);
                st._lastMods = '';
              }
            });
            st._getsukaHitCount = (st._getsukaHitCount||0) + 1;
            if (st._getsukaHitCount % 4 === 0 && (_gtHolder._getsukaCritStacks||0) < 2) {
              _gtHolder.critRate = Math.min(1.0, (_gtHolder.critRate||0) + 0.25);
              _gtHolder._getsukaCritStacks = (_gtHolder._getsukaCritStacks||0) + 1;
              addLog(st, 'log-buff', `  月華鶴影(${_gtHolder.name}): 4ヒット→会心+25%（${_gtHolder._getsukaCritStacks}スタック）`);
            }
          }
          // 耐苦鍛錬（千坂景親）: 被通攻スタック管理
          if (tgt.fixed?.name === '耐苦鍛錬' && tgt.hp > 0) {
            tgt._takida = (tgt._takida||0) + 1;
            if (tgt._takida >= 5) {
              const _takOpp = isSelf ? st.enemy : st.ally;
              _takOpp.filter(o=>o.hp>0).forEach(to=>{
                const _takFin = dealDmg(st, to, Math.round(applyRate(baseDmg(tgt.bu, to.to, tgt.hp), 160) * rand4()), tgt, !isSelf, true, false);
                if (_takFin > 0) {
                  addLog(st, isSelf?'log-enemy':'log-ally', `  耐苦鍛錬反撃(${tgt.name}→${to.name}) 兵刃[${_takFin.toLocaleString()}]（残${to.hp.toLocaleString()}）${st._lastMods||''}`);
                  st._lastMods = '';
                }
              });
              tgt._takida = 0;
            }
          }
          // 鬼美濃（馬場信春）passive: 被ダメ時35%で弱体浄化+回復112%
          if (tgt.fixed?.name === '鬼美濃' && tgt.hp > 0 && Math.random() < 0.35) {
            const _kimiCleared = purify(tgt, 1);
            const _kimH = applyHealRate(tgt.hp, tgt.to, 112);
            const {healed:_kimHH, remainHp:_kimRH} = applyHeal(tgt, _kimH, st, !isSelf?'ally':'enemy');
            addLog(st, isSelf?'log-enemy':'log-ally', `  鬼美濃(${tgt.name}): 被ダメ→${_kimiCleared.length?_kimiCleared.join('・')+'浄化＋':''}回復+${_kimHH.toLocaleString()}（残${_kimRH.toLocaleString()}）`);
          }
          // 古今独歩（本多忠勝）passive: 被通攻時24-48%で攻撃者に兵刃70%＋離反+2%
          if (tgt.fixed?.name === '古今独歩' && tgt.hp > 0) {
            const _kkkProb = Math.min(1.0, 0.48 * statScale(tgt.bu||100));
            if (Math.random() < _kkkProb) {
              const _kkkFin = dealDmg(st, me, Math.round(applyRate(baseDmg(tgt.bu, me.to, tgt.hp), 70) * rand4()), tgt, !isSelf, true, false);
              if (_kkkFin > 0) {
                addLog(st, isSelf?'log-enemy':'log-ally', `  古今独歩(${tgt.name}→${me.name}) 兵刃[${_kkkFin.toLocaleString()}]（残${me.hp.toLocaleString()}）${st._lastMods||''}`);
                st._lastMods = '';
              }
              tgt._kkkRenegStacks = Math.min(tgt._kkkRenegStacks||0, 8);
              if ((tgt._kkkRenegStacks||0) < 8) {
                tgt._kkkRenegStacks = (tgt._kkkRenegStacks||0) + 1;
                tgt.renegadeRate = Math.min(1.0, (tgt.renegadeRate||0) + 0.02);
                addLog(st, 'log-buff', `  古今独歩(${tgt.name}): 離反+2%（計${Math.round(tgt.renegadeRate*100)}%、${tgt._kkkRenegStacks}スタック）`);
              }
            }
          }
          // 三河魂（徳川家康）: 保護友軍が通攻受けた時 攻撃者の全属性-2.5%（最大8重）
          if (st._mikawaMagatamaGuards?.includes(tgt) && tgt.hp > 0) {
            const _mkHolder = (isSelf?st.ally:st.enemy).find(a=>a.fixed?.name==='三河魂'&&a.hp>0);
            if (_mkHolder) {
              me._mikawaDebufStacks = (me._mikawaDebufStacks||0);
              if (me._mikawaDebufStacks < 8) {
                me._mikawaDebufStacks++;
                const _mkReduce = 0.025;
                me.bu  = Math.max(1, (me.bu||100)  - Math.round((me.bu||100)*_mkReduce));
                me.chi = Math.max(1, (me.chi||100) - Math.round((me.chi||100)*_mkReduce));
                me.to  = Math.max(1, (me.to||100)  - Math.round((me.to||100)*_mkReduce));
                me.spd = Math.max(1, (me.spd||100) - Math.round((me.spd||100)*_mkReduce));
                addLog(st, isSelf?'log-enemy':'log-ally', `  三河魂(${me.name}): 全属性-2.5%（${me._mikawaDebufStacks}スタック）`);
              }
            }
          }
          // 大太刀力士隊: 被通攻時30%で反撃100%
          if ((tgt.slots?.some(s=>s?.name==='大太刀力士隊') || tgt.fixed?.name==='大太刀力士隊') && tgt.hp > 0) {
            if (Math.random() < 0.30) {
              const _dtFin = dealDmg(st, me, Math.round(applyRate(baseDmg(tgt.bu, me.to, tgt.hp), 100) * rand4()), tgt, !isSelf, true);
              if (_dtFin > 0) {
                addLog(st, isSelf?'log-enemy':'log-ally', `  大太刀力士隊反撃(${tgt.name}→${me.name}) 兵刃[${_dtFin.toLocaleString()}]（残${me.hp.toLocaleString()}）${st._lastMods||''}`);
                st._lastMods = '';
                (st._pendingPostAttackLogs||[]).forEach(({cls, msg}) => addLog(st, cls, msg));
                st._pendingPostAttackLogs = [];
              }
            }
          }
          // 同気連枝: 通常攻撃後 攻撃者の主力属性+5（知略依存、最大5スタック）
          {
            const _doukiAlly = allies.find(a => a.hp > 0 && a.fixed?.name === '同気連枝' && a !== me);
            if (_doukiAlly) {
              const stacks = me._doukiStatStacks || 0;
              if (stacks < 5) {
                const gain = Math.round(5 * statScale(_doukiAlly.chi));
                const isPrimBu = me.bu >= me.chi;
                if (isPrimBu) me.bu += gain; else me.chi += gain;
                me._doukiStatStacks = stacks + 1;
                addLog(st, logSide, `  同気連枝(${me.name}) ${isPrimBu?'武勇':'知略'}+${gain}（${stacks+1}スタック）`);
              }
            }
          }
        }
        // 乱舞（重ね掛け対応：ranzuRatesの各エントリーが独立して発動）
        ranzuRates.forEach(ranzuRate => {
          if (ranzuRate > 0 && fin > 0) {
            const ranzuTargets = opp.filter(t => t.hp > 0 && t !== tgt).slice(0, 2);
            ranzuTargets.forEach(rTgt => {
              if ((me.hibi||0) > 0) return;
              if (rTgt.tesseki > 0) { rTgt.tesseki--; addLog(st,'log-buff',`  鉄壁発動！(${rTgt.name}) 乱舞ダメ無効`); return; }
              const rDmg = Math.max(1, Math.round(fin * ranzuRate));
              const rInjured = Math.round(rDmg * 0.9);
              const rDead = rDmg - rInjured;
              rTgt.injured = (rTgt.injured||0) + rInjured;
              rTgt.dead = (rTgt.dead||0) + rDead;
              rTgt.hp = Math.max(0, rTgt.hp - rDmg);
              addLog(st, logSide, `  乱舞(${me.name}→${rTgt.name}) [${rDmg.toLocaleString()}]（残${rTgt.hp.toLocaleString()}）`);
              if (me.fixed?.name === '七本槍筆頭') me.shichiHitCnt++;
              if (st.hiyokuSide && st.hiyokuSide !== (isSelf?'ally':'enemy')) st.hiyokuAccum += rDmg * 0.75;
            });
          }
        });
      };

      // 突撃戦法を1回実行するヘルパー
      const doStrike = () => {
        execFixed(st, me, isSelf, advMult, idx === 0, ['strike']);
        (me.slots||[]).forEach(sk => {
          if (sk) execSlot(st, sk, me, isSelf, advMult, ['strike']);
        });
      };

      // 沈魚落雁の保留リスト（突撃戦法発動後に適用）
      let _chingyoPending = [];
      const processChingyoPending = () => {
        _chingyoPending.forEach(({ attacker, defender }) => {
          if (attacker.hp <= 0) return;
          if (Math.random() < 0.36) {
            const r = Math.floor(Math.random()*3);
            if (r===0) tryCtrl(attacker, u=>{u.confused=Math.max(u.confused||0,1);}, '混乱', st) && addLog(st,'log-ctrl',`  沈魚落雁(${defender.name}): ${attacker.name}に混乱付与`);
            else if (r===1) tryCtrl(attacker, u=>{u.musaku=Math.max(u.musaku||0,1);}, '無策', st) && addLog(st,'log-ctrl',`  沈魚落雁(${defender.name}): ${attacker.name}に無策付与`);
            else tryCtrl(attacker, u=>{u.hibi=Math.max(u.hibi||0,1);}, '疲弊', st) && addLog(st,'log-ctrl',`  沈魚落雁(${defender.name}): ${attacker.name}に疲弊付与`);
          } else {
            addLog(st,'log-info',`  沈魚落雁(${defender.name}) 確率により不発`);
          }
        });
        _chingyoPending = [];
      };

      // 槍の又左: 強化全体通常攻撃（全敵＋70%、通常攻撃を置換）
      if (me.fixed?.name === '槍の又左' && me._yarixaEnhanced) {
        me._yarixaEnhanced = false;
        addLog(st, isSelf?'log-ally':'log-enemy', `  槍の又左(${me.name}): 強化全体通常攻撃発動（+70%）`);
        opp.filter(o=>o.hp>0).forEach(o => {
          const _yd = Math.round(baseDmg(me.bu, o.to, me.hp) * 1.70 * (isSelf ? advMult : (2.0-advMult)) * (me.buff_atkDmg||1.0) * rand4());
          const _ya = dealDmg(st, o, _yd, me, isSelf, true, false);
          if (_ya > 0) {
            addLog(st, isSelf?'log-ally':'log-enemy', `  槍の又左強化攻撃(${me.name}→${o.name}) [${_ya.toLocaleString()}]（残${o.hp.toLocaleString()}）${st._lastMods||''}`);
            st._lastMods = '';
            (st._pendingPostAttackLogs||[]).forEach(({cls, msg}) => addLog(st, cls, msg));
            st._pendingPostAttackLogs = [];
          }
        });
      } else {
        doOneAtk('通常攻撃');
      }
      doStrike();
      processChingyoPending();

      // 連撃: 確定連撃（東国無双の麗・前後挟撃等）または確率連撃
      if ((me.rengiT||0) > 0 || me.fixed?.name === '東国無双の麗') {
        doOneAtk('連撃');
        doStrike();
        processChingyoPending();
      } else if ((me.rengi50T||0) > 0) {
        if (Math.random() < 0.50) {
          doOneAtk('連撃(50%)');
          doStrike();
          processChingyoPending();
        } else {
          addLog(st, 'log-info', `  連撃は確率により不発`);
        }
      }
      // 全力戦闘: T5以降 70%で連撃（rengiT/rengi50T未使用の場合に追加）
      if (st.turn >= 5 && (me.rengiT||0) <= 0 && (me.rengi50T||0) <= 0) {
        const _hasZenryoku = me.slots?.some(s=>s?.name==='全力戦闘') || me.fixed?.name==='全力戦闘';
        if (_hasZenryoku) {
          if (Math.random() < 0.70) {
            doOneAtk('連撃(全力戦闘)');
            doStrike();
            processChingyoPending();
          } else {
            addLog(st, 'log-info', `  全力戦闘連撃は確率により不発`);
          }
        }
      }

    }

    // ─ 行動終了後の受動効果 ─

    // 毘沙門天: 行動後40%（武勇依存）で自軍2〜3名回復54%（武勇依存）＋敵与ダメ-9%(1T)
    if (me.slots?.some(s=>s?.name==='毘沙門天') || me.fixed?.name==='毘沙門天') {
      const _bsProb = Math.min(1.0, 0.40 * statScale(me.bu));
      if (Math.random() < _bsProb) {
        const _bsCnt = Math.random() < 0.5 ? 2 : 3;
        const _bsSide = isSelf ? 'ally' : 'enemy';
        allies.filter(a=>a.hp>0).slice(0, _bsCnt).forEach(a => {
          const _h = applyHealRate(me.hp, me.bu, 54);
          const {healed:_ah, remainHp:_rh} = applyHeal(a, _h, st, _bsSide);
          if (_ah > 0) addLog(st, 'log-heal', `  毘沙門天(${me.name}→${a.name}) 回復+${_ah.toLocaleString()}（残${_rh.toLocaleString()}）`);
        });
        opp.filter(o=>o.hp>0).slice(0, _bsCnt).forEach(t => {
          t._bishaDebuf = Math.max(t._bishaDebuf||0, 0.09);
          t._bishaDebufT = Math.max(t._bishaDebufT||0, 1);
        });
        addLog(st, 'log-buff', `  毘沙門天(${me.name}): 敵${_bsCnt}名に与ダメ-9%(1T)`);
      }
    }
    // 軍神: 友軍行動時に60%（武勇依存）で溜め獲得（通攻+10%/スタック、最大12回）
    const _actingSide = isSelf ? 'ally' : 'enemy';
    st[_actingSide].forEach(holder => {
      if (holder.hp <= 0 || holder.fixed?.name !== '軍神' || holder === me) return;
      const _gsProb = Math.min(1.0, 0.60 * statScale(holder.bu));
      if (Math.random() < _gsProb) {
        holder.gunshinkStack = Math.min(12, (holder.gunshinkStack||0) + 1);
        addLog(st, 'log-buff', `  軍神(${holder.name}) 溜め獲得 [×${holder.gunshinkStack}]`);
      }
    });

    // 比翼連理: 大将（idx===0）の行動後に発動（保持サイドの大将が発動者）
    if (idx === 0 && st.hiyokuSide && st.hiyokuSide === (isSelf?'ally':'enemy')) {
      const hSide = st.hiyokuSide;
      const holder = st[hSide].find(b => b.hp > 0 && b.fixed?.name === '比翼連理');
      const taisho = st[hSide][0];
      const logCls = hSide === 'ally' ? 'log-ally' : 'log-enemy';
      if (holder && taisho && st.hiyokuAccum > 0) {
        const savedAccum = st.hiyokuAccum;
        if (Math.random() < 0.80) {
          st.hiyokuAccum = 0;
          const oppArr = hSide === 'ally' ? st.enemy : st.ally;
          const t = pickTarget(oppArr);
          if (t) {
            const base = baseDmg(taisho.chi, t.chi, taisho.hp);
            let d = Math.round((base*0.92 + savedAccum*0.3) * rand4());
            const kr = applyKiryaku(d, taisho, st, hSide==='ally');
            d = kr.val;
            const actualDmg = dealDmg(st, t, d, taisho, hSide==='ally', false, true);
            const sl = hSide === 'ally' ? '[自]' : '[敵]';
            addLog(st, logCls, `  ${sl} 比翼連理(${taisho.name}→${t.name}) 計略[${actualDmg.toLocaleString()}]${kr.label}（残${t.hp.toLocaleString()}） 蓄積:${Math.round(savedAccum).toLocaleString()}${st._lastMods||''}`);
            st._lastMods = '';
            (st._pendingPostAttackLogs||[]).forEach(({cls, msg}) => addLog(st, cls, msg));
            st._pendingPostAttackLogs = [];
          }
        } else {
          addLog(st, logCls, `  比翼連理 確率により不発（蓄積継続: ${Math.round(savedAccum).toLocaleString()}）`);
        }
      }
    }
    } // end !_skipAction

    // ─ 受動・兵種戦法（行動不能・封撃時でも発動） ─
    if (me.hp > 0) {
      execFixed(st, me, isSelf, advMult, idx === 0, ['passive']);
      (me.slots||[]).forEach(sk => {
        if (sk) execSlot(st, sk, me, isSelf, advMult, ['passive']);
      });
    }
  }

  // ─ 指揮戦法の継続効果 ─
  // 一領具足: ターンカウンタ管理
  if (st.ichiryo && st.ichiryo.turns > 0) {
    st.ichiryo.turns--;
    if (st.ichiryo.turns <= 0) {
      addLog(st, 'log-info', `  一領具足: 効果終了`);
      st.ichiryo = null;
    }
  }

  if (st.kiseiTurns > 0) {
    st.kiseiTurns--;
    if (st.kiseiTurns <= 0) {
      ['ally','enemy'].forEach(side => st[side].forEach(b => { b.kiseiDebufBu = false; b.kiseiDebufChi = false; }));
      addLog(st, 'log-info', `  気勢衝天: 効果終了`);
    }
  }

  // 新生（織田信長）大将技：敵軍総兵力35%以下で自身が毎T回復
  ['ally','enemy'].forEach(side => {
    const idx = st[side].findIndex(b => b.hp > 0 && b.fixed?.name === '新生');
    if (idx !== 0) return;
    const u = st[side][idx];
    const oppSide = side === 'ally' ? 'enemy' : 'ally';
    const oppMaxHp = st[oppSide].reduce((s,b)=>s+b.maxHp, 0);
    const oppCurHp = st[oppSide].reduce((s,b)=>s+Math.max(0,b.hp), 0);
    if (oppMaxHp > 0 && oppCurHp / oppMaxHp <= 0.35) {
      const h = applyHealRate(u.hp, u.chi, 80);
      const {healed:_ah, remainHp:_rh} = applyHeal(u, h, st, side);
      if (_ah > 0) addLog(st,'log-heal',`  新生・大将技(${u.name}) 敵残35%以下→自己回復 +${_ah.toLocaleString()}（残${_rh.toLocaleString()}）`);
    }
  });

  // 以戦養戦: 5T目に離反+25%追加
  if (st.turn === 5) {
    ['ally','enemy'].forEach(side => {
      st[side].forEach(me => {
        if (me.slots?.some(s => s?.name === '以戦養戦')) {
          me.renegadeRate = Math.min(1.0, (me.renegadeRate||0) + 0.25);
          addLog(st,'log-ctrl',`  以戦養戦: 5T目 ${me.name} 離反+25%（計${Math.round(me.renegadeRate*100)}%）`);
        }
      });
    });
    // 死中求活: 5T目 敵全体 兵刃125%+スタック×12%
    ['ally','enemy'].forEach(side => {
      const isSelf_sck = side === 'ally';
      const opp_sck = isSelf_sck ? st.enemy : st.ally;
      st[side].forEach(me => {
        const _hasSCK = me.slots?.some(s=>s?.name==='死中求活') || me.fixed?.name==='死中求活';
        if (!_hasSCK || me.hp <= 0) return;
        const stacks = me._sckStack || 0;
        const rate = 125 + stacks * 12;
        const logSide_sck = isSelf_sck ? 'log-ally' : 'log-enemy';
        opp_sck.filter(o=>o.hp>0).forEach(t=>{
          const r = {dmg: Math.round(applyRate(baseDmg(me.bu,t.to,me.hp),rate)*rand4())};
          const cr = applyCrit(r.dmg, me);
          const actual = dealDmg(st,t,cr.val,me,isSelf_sck,true,false);
          addLog(st,logSide_sck,`  [${isSelf_sck?'自':'敵'}] 死中求活・5T発動(${me.name}→${t.name}) 兵刃[${actual.toLocaleString()}]${cr.label} (${rate}% ×${stacks}スタック)（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
          st._lastMods = '';
        });
        (st._pendingPostAttackLogs||[]).forEach(({cls, msg}) => addLog(st, cls, msg));
        st._pendingPostAttackLogs = [];
      });
    });
  }

  // 回生：ターンカウンタの減算のみ（発動はdealDmg内で実施）
  ['ally','enemy'].forEach(side => {
    st[side].forEach(me => {
      if (me.hp > 0 && (me.kaiseiT||0) > 0) me.kaiseiT--;
    });
  });

  // 休養（毎T kyuyoRate確率で回復60%）
  ['ally','enemy'].forEach(side => {
    st[side].forEach(me => {
      if (me.hp > 0 && (me.kyuyoRate||0) > 0) {
        if (Math.random() < me.kyuyoRate) {
          const h = applyHealRate(me.hp, me.chi, 60);
          const {healed:_ah, remainHp:_rh} = applyHeal(me, h, st, side);
          if (_ah > 0) addLog(st, 'log-heal', `  休養(${me.name}) +${_ah.toLocaleString()}（残${_rh.toLocaleString()}）`);
        }
      }
    });
  });

  // 封撃ターン・デバフターン減少
  ['ally','enemy'].forEach((side, _si) => {
    st.fuuseki[side] = st.fuuseki[side].map(v => Math.max(0, v-1));
    st[side].forEach((me, _mi) => {
      if (me._shintyo > 0) me._shintyo--;
      if (me._chiryaku > 0) me._chiryaku--;
      if (me._kichoDebuf > 0) me._kichoDebuf--;
      if ((me._jubaiT||0) > 0) { me._jubaiT--; if (me._jubaiT <= 0) { me._jubai = 0; me._jubaiT = 0; } }
      if (me.confused > 0) me.confused--;
      if (me.musaku > 0) me.musaku--;
      if (me.hibi > 0) me.hibi--;
      if ((me.iatsuT||0) > 0) me.iatsuT--;
      if ((me._gounoDebufT||0) > 0) me._gounoDebufT--;
      if (me.dousatsu > 0) me.dousatsu--;
      if (me.rengiT > 0) me.rengiT--;
      if ((me.rengi50T||0) > 0) me.rengi50T--;
      if (me.fuusekiResist > 0) me.fuusekiResist--;
      // 毘沙門天デバフ（与ダメ-9%）ターン減少
      if ((me._bishaDebufT||0) > 0) { me._bishaDebufT--; if (me._bishaDebufT <= 0) me._bishaDebuf = 0; }
      // 傭兵: ターン末シールド残量表示（ゼロになったらクリア）
      if ((me.yoheiHp||0) > 0) {
        addLog(st, 'log-info', `  傭兵残量(${me.name}): ${me.yoheiHp.toLocaleString()}`);
      }
      // 城盗り知略バフタイマー
      if ((me._shiroChiT||0) > 0) {
        me._shiroChiT--;
        if (me._shiroChiT <= 0) {
          addLog(st, 'log-info', `  城盗り知略バフ消失(${me.name}): 知略-${me._shiroChi||0}`);
          me._shiroChi = 0;
        }
      }
      // 霹靂一撃・麻痺ボーナス会心タイマー
      if ((me._rekirikiCritT||0) > 0) {
        me._rekirikiCritT--;
        if (me._rekirikiCritT <= 0) {
          me.critRate = Math.max(0, (me.critRate||0) - 0.50);
          addLog(st, 'log-info', `  会心上昇効果消失(${me.name}): 会心-50%（残${Math.round((me.critRate||0)*100)}%）`);
        }
      }
      // 勇猛無比: 会心+25% タイマー
      if ((me._yuumouCritT||0) > 0) {
        me._yuumouCritT--;
        if (me._yuumouCritT <= 0) {
          me.critRate = Math.max(0, (me.critRate||0) - 0.25);
          addLog(st, 'log-info', `  勇猛無比会心消失(${me.name}): 会心-25%（残${Math.round((me.critRate||0)*100)}%）`);
        }
      }
      // 猛撃: 会心+15% タイマー
      if ((me._mogekiCritT||0) > 0) {
        me._mogekiCritT--;
        if (me._mogekiCritT <= 0) {
          me.critRate = Math.max(0, (me.critRate||0) - 0.15);
          addLog(st, 'log-info', `  猛撃会心消失(${me.name}): 会心-15%（残${Math.round((me.critRate||0)*100)}%）`);
        }
      }
      // 電光石火: 統率+48 タイマー
      if ((me._dengkouToT||0) > 0) {
        me._dengkouToT--;
        if (me._dengkouToT <= 0) {
          me.to = Math.max(0, (me.to||100) - 48);
          addLog(st, 'log-info', `  電光石火統率消失(${me.name}): 統率-48（現在${Math.round(me.to)}）`);
        }
      }
      // 金城湯池: 被ダメ-15% タイマー
      if ((me._kinjoDefT||0) > 0) me._kinjoDefT--;
      // 秋水一色: 計略与ダメ+20% タイマー
      if ((me._shuusuiBufT||0) > 0) { me._shuusuiBufT--; if (me._shuusuiBufT <= 0) { me._shuusuiBuf = 0; addLog(st,'log-info',`  秋水一色バフ消失(${me.name})`); } }
      // 融通自在: 能動発動率+12% タイマー
      if ((me._yuuzuuBufT||0) > 0) { me._yuuzuuBufT--; if (me._yuuzuuBufT <= 0) { me._yuuzuuBuf = 0; addLog(st,'log-info',`  融通自在バフ消失(${me.name})`); } }
      // 反撃: 1Tフラグ（不屈の精神は2T）
      if ((me._hankiT||0) > 0) me._hankiT--;
      // 武田之赤備: 統率デバフタイマー（_takizukaDebufT）は _toDebufT を共用
      // 越後二天: ekizenStack は消えない（永続スタック）
      // 楼岸一番デバフ
      if ((me._rougannDebufT||0) > 0) { me._rougannDebufT--; if (me._rougannDebufT <= 0) me._rougannDebufRate = 0; }
      // 疾風怒濤: 会心+45% タイマー
      if ((me._shimoUCritT||0) > 0) {
        me._shimoUCritT--;
        if (me._shimoUCritT <= 0) {
          me.critRate = Math.max(0, (me.critRate||0) - 0.45);
          addLog(st, 'log-info', `  疾風怒濤会心消失(${me.name}): 会心-45%（残${Math.round((me.critRate||0)*100)}%）`);
        }
      }
      // 一徹の意志: 統率+150 タイマー
      if ((me._issetsuToT||0) > 0) {
        me._issetsuToT--;
        if (me._issetsuToT <= 0 && (me._issetsuToBoost||0) > 0) {
          me.to = Math.max(0, (me.to||100) - me._issetsuToBoost);
          addLog(st, 'log-info', `  一徹の意志統率消失(${me.name}): 統率-${me._issetsuToBoost}（現在${Math.round(me.to)}）`);
          me._issetsuToBoost = 0;
        }
      }
      // 湖水渡り: 奇策+65% タイマー
      if ((me._kosuiT||0) > 0) {
        me._kosuiT--;
        if (me._kosuiT <= 0) {
          me.kiryakuRate = Math.max(0, (me.kiryakuRate||0) - 0.65);
          addLog(st, 'log-info', `  湖水渡り奇策消失(${me.name}): 奇策-65%（残${Math.round((me.kiryakuRate||0)*100)}%）`);
        }
      }
      // 勇志不抜: 被ダメ-20% タイマー
      if ((me._yuushiBeiT||0) > 0) me._yuushiBeiT--;
      // 傲岸不遜デバフ
      if ((me._goumanDebufT||0) > 0) { me._goumanDebufT--; if (me._goumanDebufT <= 0) me._goumanStrikeReduce = 0; }
      // 旋乾転坤デバフタイマー
      if ((me._kyokouT||0) > 0) me._kyokouT--;
      // 先制攻撃デバフ
      if ((me._senseiDebufT||0) > 0) { me._senseiDebufT--; if (me._senseiDebufT <= 0) me._senseiDebufRate = 0; }
      // 密報通暁: 撹乱タイマー
      if ((me._kakuranT||0) > 0) me._kakuranT--;
      // 落花啼鳥バフ
      if ((me._rakkaAktBufT||0) > 0) { me._rakkaAktBufT--; if (me._rakkaAktBufT <= 0) me._rakkaAktBufRate = 0; }
      // 怪力無双: 破陣タイマー
      if ((me._kairikiHajiT||0) > 0) {
        me._kairikiHajiT--;
        if (me._kairikiHajiT <= 0 && (me.hajiRate||0) > 0) {
          me.hajiRate = Math.max(0, me.hajiRate - 0.46);
          addLog(st, 'log-info', `  怪力無双破陣消失(${me.name}): 破陣-46%（残${Math.round(me.hajiRate*100)}%）`);
        }
      }
      // 諸行無常デバフ
      if ((me._shogyoDebufT||0) > 0) me._shogyoDebufT--;
      // 献身: selfDebuf リセット
      if (me._kensinSelfDebuf) me._kensinSelfDebuf = false;
      // 三楽犬: 先攻フラグ・マークのリセット（ターン末）
      if ((me._sakkoT||0) > 0) {
        me._sakkoT--;
        if (me._sakkoT <= 0) me.spd = Math.max(0, (me.spd||100) - 200);
      }
      if (me._sankakuMarked) me._sankakuMarked = false;
      // 一触即発・統率デバフタイマー
      if ((me._toDebufT||0) > 0) {
        me._toDebufT--;
        if (me._toDebufT <= 0 && (me._toDebuf||0) > 0) {
          me.to = (me.to || 100) + me._toDebuf;
          addLog(st, 'log-info', `  統率デバフ消失(${me.name}): 統率+${me._toDebuf}回復（現在${Math.round(me.to)}）`);
          me._toDebuf = 0;
        }
      }
      // 湖北仁義の1T離反解除
      if (me._reneg1T) {
        me._reneg1T = false;
        me.renegadeRate = Math.max(0, (me.renegadeRate||0) - 0.15);
      }
      // 非常の器・尼御台の休養1T後リセット
      if (me._kyuyo1T) { me._kyuyo1T = false; me.kyuyoRate = 0; }
      // 無想掃討: 兵刃与ダメ+50% タイマー
      if ((me._musouBufT||0) > 0) { me._musouBufT--; if (me._musouBufT <= 0) me._musouBufRate = 0; }
      // 夢幻泡影: 与ダメ+15% タイマー
      if ((me._mugenBufT||0) > 0) { me._mugenBufT--; if (me._mugenBufT <= 0) me._mugenBufRate = 0; }
      // 風林火山【風】: 兵刃与ダメ+22% タイマー
      if ((me._furinBufT||0) > 0) { me._furinBufT--; if (me._furinBufT <= 0) me._furinBuf = 0; }
      // 風林火山【山】: 兵刃被ダメ-22% タイマー
      if ((me._furinDefBufT||0) > 0) { me._furinDefBufT--; if (me._furinDefBufT <= 0) me._furinDefBuf = 0; }
      // 冷徹無情: 能動発動率+10% タイマー
      if ((me._reitetsuBufT||0) > 0) { me._reitetsuBufT--; if (me._reitetsuBufT <= 0) me._reitetsuBuf = 0; }
      // 斗星北天: 統率+50・知略+50 タイマー
      if ((me._starBufT||0) > 0) {
        me._starBufT--;
        if (me._starBufT <= 0) {
          me.to = Math.max(0, (me.to||100) - (me._toStarBuf||0)); me._toStarBuf = 0;
          me.chi = Math.max(0, (me.chi||100) - (me._chiStarBuf||0)); me._chiStarBuf = 0;
          addLog(st, 'log-info', `  斗星北天バフ消失(${me.name}): 統率・知略+50効果終了`);
        }
      }
      // 破陣乱舞: 破陣+46% タイマー
      if ((me._hajiRateT||0) > 0) {
        me._hajiRateT--;
        if (me._hajiRateT <= 0) {
          me.hajiRate = Math.max(0, (me.hajiRate||0) - 0.46);
          addLog(st, 'log-info', `  破陣乱舞破陣消失(${me.name}): 破陣-46%（残${Math.round((me.hajiRate||0)*100)}%）`);
        }
      }
      // 破陣乱舞: 追加兵刃フラグ（1T限り）
      if (me._haijinRanbuT) me._haijinRanbuT = 0;
      if ((me.ranzuList||[]).length > 0) {
        me.ranzuList = me.ranzuList.map(r=>({...r, t:r.t-1}));
        const hasAtkDmgBuff = me.ranzuList.some(r => r.t > 0 && r.atkDmg);
        if (!hasAtkDmgBuff) me.buff_atkDmg = 1.0;
        me.ranzuList = me.ranzuList.filter(r=>r.t>0);
      }
      // 盤石耽々: 毎ターン被ダメ軽減+4%（統率依存）
      if (me.hp > 0 && (me._bandokuInc||0) > 0) {
        me._bandokuDef = Math.min(0.90, me._bandokuDef + me._bandokuInc);
      }
      // 軍神大将技: 毎ターン追加1回溜め獲得（大将のみ）
      if (_mi === 0 && me.fixed?.name === '軍神' && me.hp > 0) {
        me.gunshinkStack = Math.min(12, (me.gunshinkStack||0) + 1);
        addLog(st, 'log-buff', `  軍神・大将技(${me.name}) ターン溜め+1 [×${me.gunshinkStack}]`);
      }
    });
  });
  if (st.baritaunt > 0) {
    st.baritaunt--;
    if (st.baritaunt === 0 && st.baritauntSide) {
      const casterTeam = st[st.baritauntSide];
      if (casterTeam[st.baritauntIdx]) casterTeam[st.baritauntIdx].baritauntProtect = false;
      st.baritauntSide = null;
    }
  }
  // 同気連枝: マーク状態をターン末にクリア（1ターン持続）
  st._doukiMarked = []; st._doukiHolder = null;

  // 負傷兵の自然死（各ターン終了時に負傷兵の10%が死亡兵へ）
  ['ally','enemy'].forEach(side => {
    st[side].forEach(b => {
      if ((b.injured||0) > 0) {
        const todie = Math.round(b.injured * 0.1);
        b.injured -= todie;
        b.dead += todie;
      }
    });
  });

  // 戦死判定
  ['ally','enemy'].forEach(side => {
    st[side].forEach(b => {
      if (b.hp<=0 && !b.defeated) {
        b.defeated = true; b.hp = 0;
        addLog(st,'log-warn',`  ▶ ${b.name} 撃破！`);
      }
    });
  });

  // 勝敗判定：大将（idx=0）の兵数が0になったら敗北
  const allyAlive = st.ally[0].hp > 0;
  const enemyAlive = st.enemy[0].hp > 0;
  if (!allyAlive || !enemyAlive) {
    const winner = !allyAlive ? '敵軍' : '自軍';
    const loserName = !allyAlive ? st.ally[0].name : st.enemy[0].name;
    addLog(st,'log-result', winner==='自軍'
      ? `🎌 自軍の勝利！（敵大将 ${loserName} 撃破）`
      : `💀 敵軍の勝利！（自軍大将 ${loserName} 撃破）`);
    st.result = winner;
    return winner;
  }
  return null;
}
