// ═══════════════════════════════════════
// 戦法効果実行
// ═══════════════════════════════════════
function execFixed(st, me, isSelf, advMult, isTaisho=false, typeFilter=null) {
  const f = me.fixed;
  if (typeFilter && f && !typeFilter.includes(f.type)) return;

  // 準備完了: 前ターンに準備していた固有戦法は今ターン確定発動
  const isPrepped = me.prepFixed;
  if (isPrepped) me.prepFixed = false; // 準備状態をクリア

  // 無策: 能動型固有戦法を発動不可（準備完了の場合はスキップしない）
  if (!isPrepped && f?.type === 'active' && (me.musaku||0) > 0) {
    addLog(st,'log-ctrl',`  無策: ${me.name} 固有戦法不発`);
    return;
  }
  // 混乱: 全行動の対象を両軍全体から最大3名（自身含む）ランダム選択
  const confused = (me.confused||0) > 0;
  if (confused) addLog(st,'log-ctrl',`  混乱中(${me.name}): 対象がランダム（最大3名、自身含む）`);
  const _allLiveInclSelf = [...st.ally,...st.enemy].filter(u=>u.hp>0);
  const _allLiveExclSelf = _allLiveInclSelf.filter(u=>u!==me);
  // 混乱時: 自身含む全生存者からシャッフル→最大3名（全体攻撃の対象上限）
  const confusedPool = _allLiveInclSelf.slice().sort(()=>Math.random()-0.5).slice(0,3);
  const opp = confused ? confusedPool : (isSelf ? st.enemy : st.ally);
  const allies = confused ? _allLiveExclSelf : (isSelf ? st.ally : st.enemy);
  if (!f) return;

  // 準備が必要な能動固有戦法の共通ゲート（地黄八幡・十面埋伏・梟雄の計 等）
  if (f.type === 'active' && f.prep) {
    if (!isPrepped) {
      // 笹の才蔵: 前回撃破した場合 準備不要確定発動
      if (f.name === '笹の才蔵' && me._sasanoPrepSkip) {
        me._sasanoPrepSkip = false;
        addLog(st, isSelf?'log-ally':'log-enemy', `  [${isSelf?'自':'敵'}] 笹の才蔵: 準備省略（撃破ボーナス）`);
        // 発動率チェックなしで通す
      } else if (f.name === '怪力無双') {
        // 怪力無双: 2T準備が必要（_kairikiPrepT で管理）
        if ((me._kairikiPrepT||0) === 0) {
          // 発動率チェック
          let fprob = f.prob || 0.75;
          if ((me._matsuActBoost||0) > 0) fprob = Math.min(1.0, fprob + me._matsuActBoost);
          if (Math.random() > fprob) return;
          me._kairikiPrepT = 2;
          addLog(st, isSelf?'log-ally':'log-enemy', `  [${isSelf?'自':'敵'}] ${me.name} 【怪力無双】準備中…(残2T)`);
          return;
        } else {
          me._kairikiPrepT--;
          if (me._kairikiPrepT > 0) {
            addLog(st, isSelf?'log-ally':'log-enemy', `  [${isSelf?'自':'敵'}] ${me.name} 【怪力無双】準備中…(残${me._kairikiPrepT}T)`);
            return;
          }
          // prepT が 0 になった → 発動
        }
      } else {
        // 発動率チェック
        let fprob = f.prob || 0.35;
        const _fbaseProb = fprob;
        const _fboosts = [];
        if (me.slots?.some(s => s?.name==='一行三昧') || me.fixed?.name==='一行三昧') {
          fprob = Math.min(1.0, fprob + 0.14); _fboosts.push('一行三昧+14%');
        }
        if (me.slots?.some(s => s?.name==='一上一下') || me.fixed?.name==='一上一下') {
          fprob = Math.min(1.0, fprob + 0.12); _fboosts.push('一上一下+12%');
        }
        if ((me._matsuActBoost||0) > 0) { fprob = Math.min(1.0, fprob + me._matsuActBoost); _fboosts.push(`松柏之操+${Math.round(me._matsuActBoost*100)}%`); }
        if (Math.random() > fprob) return;
        if (_fboosts.length > 0) addLog(st, 'log-ctrl', `  発動率ブースト(${me.name}固有): ${Math.round(_fbaseProb*100)}%→${Math.round(fprob*100)}% [${_fboosts.join('、')}]`);
        // 撹乱: 能動発動時に計略152%を受ける
        if ((me._kakuranT||0) > 0) {
          const _kakuranDmg = applyRate(baseDmg(150, me.chi, me.hp), 152, 150, true);
          dealDmg(st, me, _kakuranDmg, me, isSelf, false, true);
          addLog(st, isSelf?'log-ally':'log-enemy', `  撹乱(${me.name}): 能動発動→計略[${_kakuranDmg.toLocaleString()}]受けた`);
        }
        // 運勝の鼻：75%の確率で準備省略
        const hasUnshoBana = me.slots?.some(s => s?.name === '運勝の鼻');
        if (!hasUnshoBana || Math.random() >= 0.75) {
          me.prepFixed = true;
          addLog(st, isSelf?'log-ally':'log-enemy', `  [${isSelf?'自':'敵'}] ${me.name} 【${f.name}】準備中…`);
          return;
        }
        addLog(st, isSelf?'log-ally':'log-enemy', `  [${isSelf?'自':'敵'}] 運勝の鼻: 準備省略！`);
      }
    }
    // isPrepped=true または 運勝の鼻スキップ時 → 下の個別ハンドラへ続く
  }

  // 非prep能動固有戦法の共通発動ゲート（一行三昧等のブーストを適用）
  if (f.type === 'active' && !f.prep && !isPrepped) {
    const _baseP = f.prob || 0;
    const _boosts = [];
    let _prob = _baseP;
    if (me.slots?.some(s=>s?.name==='一行三昧')||me.fixed?.name==='一行三昧') { _prob=Math.min(1,_prob+0.14); _boosts.push('一行三昧+14%'); }
    if (me.slots?.some(s=>s?.name==='一上一下')||me.fixed?.name==='一上一下') { _prob=Math.min(1,_prob+0.12); _boosts.push('一上一下+12%'); }
    if ((me._matsuActBoost||0)>0) { _prob=Math.min(1,_prob+me._matsuActBoost); _boosts.push(`松柏之操+${Math.round(me._matsuActBoost*100)}%`); }
    if ((me._yuuzuuBuf||0)>0) { _prob=Math.min(1,_prob+me._yuuzuuBuf); _boosts.push(`融通自在+${Math.round(me._yuuzuuBuf*100)}%`); }
    if ((me._bungoActBoost||0)>0) { _prob=Math.min(1,_prob+me._bungoActBoost); _boosts.push(`豊後の戦陣+${Math.round(me._bungoActBoost*100)}%`); }
    if ((me._reitetsuBuf||0)>0) { _prob=Math.min(1,_prob+me._reitetsuBuf); _boosts.push(`冷徹無情+${Math.round(me._reitetsuBuf*100)}%`); }
    if ((me._echigoActBoost||0)>0) { _prob=Math.min(1,_prob+me._echigoActBoost); _boosts.push(`越後流軍学+${Math.round(me._echigoActBoost*100)}%`); }
    if ((f._probBonus||0)>0) { _prob=Math.min(1,_prob+f._probBonus); _boosts.push(`固有率ボーナス+${Math.round(f._probBonus*100)}%`); }
    if (Math.random() > _prob) return;
    if (_boosts.length > 0) addLog(st, 'log-ctrl', `  発動率ブースト(${me.name}固有): ${Math.round(_baseP*100)}%→${Math.round(_prob*100)}% [${_boosts.join('、')}]`);
    // 撹乱: 能動発動時に計略152%を受ける
    if ((me._kakuranT||0) > 0) {
      const _kakuranDmg = applyRate(baseDmg(150, me.chi, me.hp), 152, 150, true);
      dealDmg(st, me, _kakuranDmg, me, isSelf, false, true);
      addLog(st, isSelf?'log-ally':'log-enemy', `  撹乱(${me.name}): 能動発動→計略[${_kakuranDmg.toLocaleString()}]受けた`);
    }
  }

  // 百万一心（毛利元就）: 敵の能動戦法発動時に30-50%で阻止＋計略100%
  if (f.type === 'active' && st._hyakumanHolder?.hp > 0 && st._hyakumanIsSelf !== isSelf) {
    if (Math.random() < (st._hyakumanProb||0.30)) {
      const hm = st._hyakumanHolder;
      const _hmDmg = Math.round(applyRate(baseDmg(hm.chi, me.chi, hm.hp), 100, hm.chi, true));
      dealDmg(st, me, _hmDmg, hm, st._hyakumanIsSelf, false, true);
      addLog(st, isSelf?'log-ally':'log-enemy', `  百万一心(${hm.name}): ${me.name}の能動戦法を阻止！計略[${_hmDmg.toLocaleString()}]（残${me.hp.toLocaleString()}）`);
      return;
    }
  }

  // 水の如し（黒田官兵衛）: 毎T行動前に48%（知略依存）で奇策+5%獲得（最大8回）
  // 毎T行動前に60%（大将技+15%）で敵1体に計略88%（1〜2回）
  if (f.name === '水の如し') {
    const sl = isSelf ? '[自]' : '[敵]';
    // 奇策積み上げ: 48%（知略依存）、最大8スタック
    const maxKiryakuStack = 8;
    const curStack = me._mizuKiryakuStack || 0;
    if (curStack < maxKiryakuStack) {
      const kirProb = Math.min(1.0, 0.48 * statScale(me.chi));
      if (Math.random() < kirProb) {
        me._mizuKiryakuStack = curStack + 1;
        me.kiryakuRate = Math.min(1.0, (me.kiryakuRate || 0) + 0.05);
        addLog(st, isSelf?'log-ally':'log-enemy', `  水の如し(${me.name}) 奇策+5%獲得（${me._mizuKiryakuStack}スタック・計${Math.round(me.kiryakuRate*100)}%）`);
      }
    }
    // 計略攻撃: 60%（大将技+15%）で敵1体に計略88%×1〜2回
    const dmgProb = isTaisho ? 0.75 : 0.60;
    if (Math.random() < dmgProb) {
      const times = Math.random()<0.5?1:2;
      for (let t=0;t<times;t++){
        const tgt = pickTarget(opp);
        if (!tgt) break;
        const base = baseDmg(me.chi, tgt.chi, me.hp);
        let fin = applyRate(base, 88, me.chi, true);
        const kr = applyKiryaku(fin, me, st, isSelf);
        fin = kr.val;
        const actualDmg = dealDmg(st, tgt, fin, me, isSelf, false, true);
        addLog(st, isSelf?'log-ally':'log-enemy', `  ${sl} 水の如し(${me.name}→${tgt.name}) 計略[${actualDmg.toLocaleString()}]${kr.label}（残${tgt.hp.toLocaleString()}）${st._lastMods||''}`);
        st._lastMods = '';
        if (st.hiyokuSide && st.hiyokuSide !== (isSelf?'ally':'enemy')) st.hiyokuAccum += actualDmg*0.75;
      }
    }
  }
  // 帰蝶の舞（帰蝶）受動型：奇数Tに統率・知略デバフ、偶数Tに混乱
  else if (f.name === '帰蝶の舞') {
    const prob = st.turn % 2 === 1 ? Math.min(1.0, 0.40 * statScale(me.chi)) : Math.min(1.0, 0.38 * statScale(me.chi));
    if (Math.random() < prob) {
      opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
        if (st.turn % 2 === 1) {
          // 奇数T: 統率・知略-22%低下（バフ係数として記録）
          t._kichoDebuf = (t._kichoDebuf||0) + 0.22;
          addLog(st,isSelf?'log-ally':'log-enemy',`  帰蝶の舞(${t.name}) 統率・知略-22%低下`);
        } else {
          // 偶数T: 混乱1T付与
          tryCtrl(t, u => { u.confused = Math.max(u.confused||0, 1); }, '混乱', st);
          addLog(st,isSelf?'log-ally':'log-enemy',`  帰蝶の舞(${t.name}) 混乱1T付与`);
        }
      });
    }
  }
  // 相模の獅子（北条氏康）自軍2〜3名に85%で鉄壁×2付与。鉄壁中の対象には代わりに計略178%
  else if (f.name === '相模の獅子') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const cnt = Math.random() < 0.5 ? 2 : 3;
    const prob = 0.85; // Lv10値
    allies.filter(a=>a.hp>0).slice(0, cnt).forEach(a=>{
      if ((a.tesseki||0) > 0) {
        // 鉄壁中の場合: 代わりに敵1名に計略178%
        const t = pickTarget(opp);
        if (t) {
          const base = baseDmg(me.chi, t.chi, me.hp);
          const kr = applyKiryaku(applyRate(base, 178, me.chi, true), me, st, isSelf);
          const actualDmg = dealDmg(st, t, kr.val, me, isSelf, false, true);
          addLog(st, logS, `  [${isSelf?'自':'敵'}] 相模の獅子(${me.name}→${t.name}) 鉄壁中→計略[${actualDmg.toLocaleString()}]${kr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
          st._lastMods = '';
        }
      } else if (Math.random() < prob) {
        a.tesseki = (a.tesseki||0) + 2;
        addLog(st,'log-buff',`  相模の獅子(${a.name}) 鉄壁×2付与`);
      } else {
        addLog(st,'log-info',`  相模の獅子(${a.name}) 鉄壁付与失敗`);
        // 大将技: 付与失敗時に回復40%
        if (isTaisho) {
          const h = applyHealRate(me.hp, me.chi, 40);
          const {healed:_ah, remainHp:_rh} = applyHeal(a, h, st, isSelf?'ally':'enemy');
          if (_ah > 0) addLog(st,'log-heal',`  相模の獅子・大将技(${a.name}) 失敗時回復+${_ah.toLocaleString()}（残${_rh.toLocaleString()}）`);
        }
      }
    });
  }
  // 地黄八幡（北条綱成）準備1T後 敵全体 兵刃174%＋封撃・無策（大将技：確率44%）
  else if (f.name === '地黄八幡') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const giveProb = Math.min(1.0, (isTaisho ? 0.44 : 0.36) * statScale(me.bu)); // 武勇依存
    opp.filter(o=>o.hp>0).forEach(t=>{
      const d = applyRate(baseDmg(me.bu, t.to, me.hp), 174);
      const cr = applyCrit(d, me);
      const actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 地黄八幡(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${isTaisho?'【大将技】':''}${st._lastMods||''}`);
      st._lastMods = '';
      if (Math.random() < giveProb) { t.musaku = Math.max(t.musaku||0, 1); addLog(st,'log-ctrl',`    無策1T付与`); }
      if (Math.random() < giveProb) {
        const oppSide = isSelf ? 'enemy' : 'ally';
        const ti = st[oppSide].indexOf(t);
        if (ti >= 0) { st.fuuseki[oppSide][ti] = Math.max(st.fuuseki[oppSide][ti]||0, 1); st.fuusekiAppliedTurn[oppSide][ti] = st.turn; }
        addLog(st,'log-ctrl',`    封撃1T付与`);
      }
    });
  }
  // 十面埋伏（竹中半兵衛）準備1T後 敵全体 被ダメ+18%(2T)＋計略138%（大将技：5T以降永続）
  else if (f.name === '十面埋伏') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const jubaiDur = (isTaisho && st.turn >= 5) ? 999 : 2; // 大将技：5T目以降は解除不可
    opp.filter(o=>o.hp>0).forEach(t=>{
      t._jubai = (t._jubai||0) + 0.18;
      t._jubaiT = jubaiDur;
      addLog(st,'log-ctrl',`  十面埋伏(${t.name}) 被ダメ+18%（${jubaiDur>=999?'永続':'2T'}）${isTaisho&&st.turn>=5?'【大将技】':''}`);
    });
    opp.filter(o=>o.hp>0).forEach(t=>{
      const base = baseDmg(me.chi, t.chi, me.hp);
      const d = applyRate(base, 138, me.chi, false); // 知略依存の記載なし
      const kr = applyKiryaku(d, me);
      const actualDmg = dealDmg(st, t, kr.val, me, isSelf, false, true);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 十面埋伏(${me.name}→${t.name}) 計略[${actualDmg.toLocaleString()}]${kr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    });
  }
  // 梟雄の計（松永久秀）準備1T後 敵2〜3名 計略128%＋55%で中毒（中毒中は疲弊に変更）・火傷
  else if (f.name === '梟雄の計') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const cnt = Math.random() < 0.5 ? 2 : 3;
    opp.filter(o=>o.hp>0).slice(0, cnt).forEach(t=>{
      const base = baseDmg(me.chi, t.chi, me.hp);
      const d = applyRate(base, 128, me.chi, true);
      const kr = applyKiryaku(d, me);
      const actualDmg = dealDmg(st, t, kr.val, me, isSelf, false, true);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 梟雄の計(${me.name}→${t.name}) 計略[${actualDmg.toLocaleString()}]${kr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      if (Math.random() < 0.55) {
        // 中毒状態中の場合は疲弊に変更
        if ((t.chudokuT||0) > 0) {
          tryCtrl(t, u=>{ u.hibi = Math.max(u.hibi||0, 2); }, '疲弊', st);
          addLog(st,'log-ctrl',`    梟雄の計: 中毒中→疲弊2T付与`);
        } else {
          tryCtrl(t, u=>{ u.chudokuT = Math.max(u.chudokuT||0, 2); u.chudokuPow = me.chi; u.chudokuRate = 96; u.chudokuKirRate = me.kiryakuRate||0; u.chudokuKirBonus = me.kiryakuBonus||0; }, '中毒', st);
          addLog(st,'log-ctrl',`    梟雄の計: 中毒2T(96%/T)付与`);
        }
      }
      if (Math.random() < 0.55) {
        t._kaen = (t._kaen||0) + 2; t._kaenRate = 96;
        addLog(st,'log-ctrl',`    梟雄の計: 火傷2T(96%/T)付与`);
      }
    });
  }
  // 時は今（明智光秀）敵2名に5種の継続状態から1種を3T付与（未付与優先）
  // 継続ダメージ56%/T（知略依存、潰走のみ武勇依存）。奇策・会心も発動する
  else if (f.name === '時は今') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 時は今(${me.name}→${t.name})`);
      if ((t.dousatsu||0) > 0) {
        addLog(st,'log-buff',`  洞察(${t.name}): 時は今の制御効果を無効`);
        return;
      }
      const states = [
        { label:'火傷',   has: ()=>(t._kaen||0)>0,
          apply: ()=>{ t._kaen = Math.max(t._kaen||0, 3); t._kaenRate = 56; t._kaenKirRate = me.kiryakuRate||0; t._kaenKirBonus = me.kiryakuBonus||0; } },
        { label:'水攻め', has: ()=>(t.suikouT||0)>0,
          apply: ()=>{ t.suikouT = Math.max(t.suikouT||0, 3); t.suikouPower = me.chi; t.suikouRate = 56; t.suikouKirRate = me.kiryakuRate||0; t.suikouKirBonus = me.kiryakuBonus||0; } },
        { label:'中毒',   has: ()=>(t.chudokuT||0)>0,
          apply: ()=>{ t.chudokuT = Math.max(t.chudokuT||0, 3); t.chudokuPow = me.chi; t.chudokuRate = 56; t.chudokuKirRate = me.kiryakuRate||0; t.chudokuKirBonus = me.kiryakuBonus||0; } },
        { label:'消沈',   has: ()=>(t.shochinT||0)>0,
          apply: ()=>{ t.shochinT = Math.max(t.shochinT||0, 3); t.shochinPow = me.chi; t.shochinRate = 56; t.shochinKirRate = me.kiryakuRate||0; t.shochinKirBonus = me.kiryakuBonus||0; } },
        { label:'潰走',   has: ()=>(t.kaisoT||0)>0,
          apply: ()=>{ t.kaisoT = Math.max(t.kaisoT||0, 3); t.kaisoPow = me.bu; t.kaisoRate = 56; t.kaisoCritRate = me.critRate||0; t.kaisoCritBonus = me.critBonus||0.5; } },
      ];
      const absent = states.filter(s => !s.has());
      const pool = absent.length > 0 ? absent : states;
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      chosen.apply();
      addLog(st, 'log-ctrl', `    時は今: ${t.name}に${chosen.label}(56%/T)3T付与`);
    });
  }
  // かかれ柴田（柴田勝家）自身の弱体2個浄化＋敵全体に兵刃154%
  else if (f.name === 'かかれ柴田') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const cleared = purify(me, 2);
    if (cleared.length > 0) addLog(st,'log-heal',`  かかれ柴田: ${me.name} 浄化[${cleared.join(',')}]`);
    opp.filter(o=>o.hp>0).forEach(t=>{
      const d = applyRate(baseDmg(me.bu, t.to, me.hp), 154);
      const cr = applyCrit(d, me);
      const actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] かかれ柴田(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    });
  }
  // 信義貫徹（浅井長政）1T間離反15%獲得＋敵2名に兵刃156%（大将技：友軍単体にも離反付与）
  else if (f.name === '信義貫徹' || f.name === '湖北仁義') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    me.renegadeRate = Math.min(1.0, (me.renegadeRate||0) + 0.15);
    me._reneg1T = true;
    addLog(st,'log-buff',`  湖北仁義: ${me.name} 離反+15%(計${Math.round(me.renegadeRate*100)}%)`);
    if (isTaisho) {
      const ally2 = allies.filter(a=>a.hp>0&&a!==me)[0];
      if (ally2) {
        ally2.renegadeRate = Math.min(1.0, (ally2.renegadeRate||0) + 0.15);
        ally2._reneg1T = true;
        addLog(st,'log-buff',`  湖北仁義・大将技: ${ally2.name} 離反+15%(計${Math.round(ally2.renegadeRate*100)}%)`);
      }
    }
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
      const d = applyRate(baseDmg(me.bu, t.to, me.hp), 156);
      const cr = applyCrit(d, me);
      const actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 湖北仁義(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    });
  }
  // 電光雷轟（立花道雪）通攻後、対象とランダム敵1体に麻痺2T。対象が麻痺中なら雷鳴（全体兵刃52%、大将技60%）。1ターン1回まで
  else if (f.name === '電光雷轟') {
    if (me._denkaiDone) return; // 1ターン1回制限
    if (Math.random() > 0.65) return;
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const sl = isSelf ? '[自]' : '[敵]';
    const t1 = pickTarget(opp);
    const others = opp.filter(o => o.hp > 0 && o !== t1);
    const t2 = others.length ? others[Math.floor(Math.random() * others.length)] : null;
    const tgts = [t1, t2].filter(Boolean);
    me._denkaiDone = true; // 同ターン内の再発動を禁止
    tgts.forEach(t => {
      const wasParalyzed = (t.muku || 0) > 0;
      tryCtrl(t, u => { u.muku = Math.max(u.muku || 0, 2); }, '麻痺', st);
      addLog(st, logS, `  ${sl} 電光雷轟(${me.name}→${t.name}) 麻痺2T付与`);
      // 対象が麻痺中だった場合、独立して雷鳴発動
      if (wasParalyzed) {
        const raineiRate = isTaisho ? 60 : 52;
        opp.filter(o => o.hp > 0).forEach(tgt => {
          const d = applyRate(baseDmg(me.bu, tgt.to, me.hp), raineiRate);
          const cr = applyCrit(d, me);
          const actualDmg = dealDmg(st, tgt, cr.val, me, isSelf, true, false);
          addLog(st, logS, `  ${sl} 電光雷轟・雷鳴(${me.name}→${tgt.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}（残${tgt.hp.toLocaleString()}）${isTaisho?'【大将技】':''}${st._lastMods||''}`);
          st._lastMods = '';
        });
      }
    });
  }
  // 海道一（今川義元）通攻後、ランダム敵単体に兵刃134%＋計略134%を2回。自身の統率-6%分だけ武勇/知略増加（最大8回）
  else if (f.name === '海道一') {
    if (Math.random() > 0.70) return;
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const sl = isSelf ? '[自]' : '[敵]';
    for (let i = 0; i < 2; i++) {
      const t = pickTarget(opp);
      if (!t) break;
      const bd = applyRate(baseDmg(me.bu, t.to, me.hp), 134);
      const bcr = applyCrit(bd, me);
      const bActual = dealDmg(st, t, bcr.val, me, isSelf, true, false);
      addLog(st, logS, `  ${sl} 海道一${i+1}回目・兵刃(${me.name}→${t.name}) [${bActual.toLocaleString()}]${bcr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      const cd = applyRate(baseDmg(me.chi, t.chi, me.hp), 134, me.chi, true);
      const cActual = dealDmg(st, t, cd, me, isSelf, false, true);
      addLog(st, logS, `  ${sl} 海道一${i+1}回目・計略(${me.name}→${t.name}) [${cActual.toLocaleString()}]（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    }
    const kaidoCount = (me._kaidoCount || 0);
    if (kaidoCount < 8) {
      const delta = Math.round(me.to * 0.06);
      const toPrev = me.to, buPrev = me.bu, chiPrev = me.chi;
      me.to = Math.max(1, me.to - delta);
      me.bu += delta;
      me.chi += delta;
      me._kaidoCount = kaidoCount + 1;
      const toPct  = Math.round((me.to  - toPrev)  / toPrev  * 100);
      const buPct  = Math.round((me.bu  - buPrev)  / buPrev  * 100);
      const chiPct = Math.round((me.chi - chiPrev) / chiPrev * 100);
      addLog(st, 'log-buff', `  海道一: ${me.name} 統率 ${toPrev}→${me.to}(${toPct}%) / 武勇 ${buPrev}→${me.bu}(+${buPct}%) / 知略 ${chiPrev}→${me.chi}(+${chiPct}%)（${me._kaidoCount}回目）`);
    }
    if (isTaisho && st.turn === 5) {
      me.critRate = Math.min(1.0, (me.critRate || 0) + 0.12);
      me.kiryakuRate = Math.min(1.0, (me.kiryakuRate || 0) + 0.12);
      addLog(st, 'log-buff', `  海道一・大将技: ${me.name} 会心+12%・奇策+12%`);
    }
  }
  // 剛の武者（甘利虎泰）通攻後、対象に兵刃246%＋2T間 対象の計略与ダメ-75%デバフ
  else if (f.name === '剛の武者') {
    if (Math.random() > 0.35) return;
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const sl = isSelf ? '[自]' : '[敵]';
    const t = pickTarget(opp);
    if (t) {
      const d = applyRate(baseDmg(me.bu, t.to, me.hp), 246);
      const cr = applyCrit(d, me);
      const actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
      t._gounoDebufT = Math.max(t._gounoDebufT || 0, 2);
      addLog(st, logS, `  ${sl} 剛の武者(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）＋計略与ダメ-75%(2T)${st._lastMods||''}`);
      st._lastMods = '';
    }
  }
  else if (f.name === '掃疑平乱') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    me.ranzuList = me.ranzuList || []; me.ranzuList.push({t:2, rate:0.78});
    addLog(st, 'log-buff', `  掃疑平乱: ${me.name} 乱舞78%(2T)付与`);
    const ally2 = (isSelf ? st.ally : st.enemy).filter(a => a.hp > 0 && a !== me)[0];
    if (ally2) {
      ally2.ranzuList = ally2.ranzuList || []; ally2.ranzuList.push({t:2, rate:0.78});
      addLog(st, 'log-buff', `  掃疑平乱: ${ally2.name} 乱舞78%(2T)付与`);
    }
    if (st.turn >= 5) {
      const spdBoost = Math.round((me.spd||100) * 0.20);
      me.spd = (me.spd||100) + spdBoost;
      me._souheiSpdBoost = (me._souheiSpdBoost||0) + spdBoost;
      me._souheiSpdT = Math.max(me._souheiSpdT||0, 2);
      addLog(st, 'log-buff', `  掃疑平乱・5T以降: ${me.name} 速度+${spdBoost}(+20%, 2T)`);
      if (ally2) {
        const spdBoost2 = Math.round((ally2.spd||100) * 0.20);
        ally2.spd = (ally2.spd||100) + spdBoost2;
        ally2._souheiSpdBoost = (ally2._souheiSpdBoost||0) + spdBoost2;
        ally2._souheiSpdT = Math.max(ally2._souheiSpdT||0, 2);
        addLog(st, 'log-buff', `  掃疑平乱・5T以降: ${ally2.name} 速度+${spdBoost2}(+20%, 2T)`);
      }
    }
  }
  // 天下御免（前田慶次）通攻後、対象に兵刃188%。敵大将命中で混乱2T
  else if (f.name === '天下御免') {
    if (Math.random() > 0.65) return;
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const t = pickTarget(opp);
    if (t) {
      const d = applyRate(baseDmg(me.bu, t.to, me.hp), 188);
      const cr = applyCrit(d, me);
      const actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 天下御免(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      const oppArr = isSelf ? st.enemy : st.ally;
      const isTaishoTarget = oppArr.indexOf(t) === 0;
      if (isTaishoTarget) {
        if ((t.confused || 0) > 0) {
          // 既に混乱中: 主要属性吸収
          const absorb = Math.round(30 * statScale(me.bu));
          me.bu += absorb;
          addLog(st, 'log-buff', `  天下御免: ${t.name}から主要属性${absorb}吸収`);
        } else {
          tryCtrl(t, u => { u.confused = Math.max(u.confused||0, 2); }, '混乱', st);
          addLog(st, 'log-ctrl', `  天下御免: ${t.name}(大将)に混乱2T付与`);
        }
      }
    }
  }
  // 鬼小島（小島弥太郎）通攻後、対象に兵刃304%。発動のたびに発動率-5%
  else if (f.name === '鬼小島') {
    if (Math.random() > (f.prob || 0.55)) return;
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const t = pickTarget(opp);
    if (t) {
      const d = applyRate(baseDmg(me.bu, t.to, me.hp), 304);
      const cr = applyCrit(d, me);
      const actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 鬼小島(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      const maxDec = 4;
      me._kojimaDecCnt = Math.min((me._kojimaDecCnt||0)+1, maxDec);
      if (me._kojimaDecCnt < maxDec) {
        f.prob = Math.max(0, (f.prob||0.55) - 0.05);
        addLog(st, 'log-info', `  鬼小島: 発動率-5%（現在${Math.round((f.prob||0)*100)}%）`);
      }
    }
  }
  // 先陣鼓舞（相馬盛胤）敵1名 兵刃242%＋友軍1名の固有発動確率+16%
  else if (f.name === '先陣鼓舞') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const t = pickTarget(opp);
    if (t) {
      const d = applyRate(baseDmg(me.bu, t.to, me.hp), 242);
      const cr = applyCrit(d, me);
      const actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 先陣鼓舞(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    }
    const a2 = allies.filter(a=>a.hp>0&&a!==me)[0];
    if (a2 && a2.fixed) {
      a2.fixed._probBonus = (a2.fixed._probBonus||0) + 0.16;
      a2._koboT = 2;
      addLog(st, 'log-buff', `  先陣鼓舞: ${a2.name} 固有発動率+16%(2T)`);
    }
  }
  // 信義貫徹ログ（湖北仁義は別ハンドラで処理済み）
  // 夜叉美濃（原虎胤）受動型: 被ダメ-35%（実処理はdealDmg内の追加チェックで行う）
  // ─ 簡易固有戦法（パターン系）
  // 弾嵐雨霞（鈴木佐大夫）敵1名 兵刃126%×2〜3回＋75%で無策or封撃1T
  else if (f.name === '弾嵐雨霞') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const t = pickTarget(opp);
    if (t) {
      const cnt = Math.random() < 0.5 ? 2 : 3;
      for (let i=0;i<cnt;i++) {
        const d = applyRate(baseDmg(me.bu, t.to, me.hp), 126);
        const cr = applyCrit(d, me);
        const actual = dealDmg(st, t, cr.val, me, isSelf, true, false);
        addLog(st, logS, `  [${isSelf?'自':'敵'}] 弾嵐雨霞(${me.name}→${t.name}) 兵刃[${actual.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
        st._lastMods = '';
        if (t.hp <= 0) break;
      }
      if (Math.random() < 0.75) {
        const oppSide = isSelf ? 'enemy' : 'ally';
        if (Math.random() < 0.5) {
          t.musaku = Math.max(t.musaku||0, 1);
          addLog(st, 'log-ctrl', `  弾嵐雨霞: ${t.name}に無策1T`);
        } else {
          const ti = st[oppSide].indexOf(t);
          if (ti >= 0) { st.fuuseki[oppSide][ti] = Math.max(st.fuuseki[oppSide][ti]||0, 1); st.fuusekiAppliedTurn[oppSide][ti] = st.turn; }
          addLog(st, 'log-ctrl', `  弾嵐雨霞: ${t.name}に封撃1T`);
        }
      }
    }
  }
  // 表裏比興（真田昌幸）敵1名 計略142%＋混乱1T
  else if (f.name === '表裏比興') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const t = pickTarget(opp);
    if (t) {
      const base = baseDmg(me.chi, t.chi, me.hp);
      const wasConfused = (t.confused||0) > 0;
      // 仕様1: 常に対象に計略142%＋混乱1T
      const d = applyRate(base, 142, me.chi, true);
      const kr = applyKiryaku(d, me, st, isSelf);
      const actual = dealDmg(st, t, kr.val, me, isSelf, false, true);
      tryCtrl(t, u=>{ u.confused = Math.max(u.confused||0, 1); }, '混乱', st);
      t._hyouriReaction = { caster: me, casterIsSelf: isSelf, used: false, turnsLeft: 2 };
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 表裏比興(${me.name}→${t.name}) 計略[${actual.toLocaleString()}]${kr.label}+混乱1T（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      // 仕様2: 対象が既に混乱中なら追加で別の敵に計略192%
      if (wasConfused) {
        const realOpp = isSelf ? st.enemy : st.ally;
        const alt = realOpp.filter(o=>o.hp>0&&o!==t)[0] || t;
        const d2 = applyRate(baseDmg(me.chi, alt.chi, me.hp), 192, me.chi, true);
        const kr2 = applyKiryaku(d2, me, st, isSelf);
        const actual2 = dealDmg(st, alt, kr2.val, me, isSelf, false, true);
        addLog(st, logS, `  [${isSelf?'自':'敵'}] 表裏比興(${me.name}→${alt.name}) 追加計略(混乱中)[${actual2.toLocaleString()}]${kr2.label}（残${alt.hp.toLocaleString()}）${st._lastMods||''}`);
        st._lastMods = '';
      }
    }
  }
  // 攻めの三左（森可成）敵1名 兵刃142%＋潰走3T
  else if (f.name === '攻めの三左') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const t = pickTarget(opp);
    if (t) {
      const d = applyRate(baseDmg(me.bu, t.to, me.hp), 142);
      const cr = applyCrit(d, me);
      const actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 攻めの三左(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      if ((t.kaisoT||0) > 0) {
        const _h = applyHealRate(me.hp, me.bu, 70);
        const {healed:_ah} = applyHeal(me, _h, st, isSelf?'ally':'enemy');
        if (_ah > 0) addLog(st, 'log-heal', `  攻めの三左(潰走対象): ${me.name} 回復+${_ah.toLocaleString()}`);
      } else {
        t.kaisoT = 3; t.kaisoPow = me.bu; t.kaisoRate = 72;
        t.kaisoCritRate = me.critRate||0; t.kaisoCritBonus = me.critBonus||0.5;
        addLog(st, 'log-ctrl', `  攻めの三左: ${t.name}に潰走3T付与`);
      }
    }
  }
  // 一舟軒（安宅冬康）友軍2名を回復152%＋52%で鉄壁1回
  else if (f.name === '一舟軒') {
    const _healSide = isSelf ? 'ally' : 'enemy';
    allies.filter(a=>a.hp>0).slice(0,2).forEach(a=>{
      const h = applyHealRate(me.hp, me.chi, 152);
      const {healed:_ah, remainHp:_rh} = applyHeal(a, h, st, _healSide);
      if (_ah > 0) addLog(st, 'log-heal', `  一舟軒(${a.name}) +${_ah.toLocaleString()}（残${_rh.toLocaleString()}）`);
      if (Math.random() < 0.52) {
        a.tesseki = (a.tesseki||0) + 1;
        addLog(st, 'log-buff', `  一舟軒(${a.name}) 鉄壁1回付与`);
      }
    });
  }
  // 仁者の沈勇（里見義堯）通攻後、敵1名 計略184%＋70%で友軍1名も同対象に計略154%
  else if (f.name === '仁者の沈勇') {
    if (Math.random() > 0.55) return;
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const t = pickTarget(opp);
    if (t) {
      const base = baseDmg(me.chi, t.chi, me.hp);
      const kr = applyKiryaku(applyRate(base, 184, me.chi, true), me, st, isSelf);
      const actual = dealDmg(st, t, kr.val, me, isSelf, false, true);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 仁者の沈勇(${me.name}→${t.name}) 計略[${actual.toLocaleString()}]${kr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      if (Math.random() < (isTaisho ? 0.90 : 0.70)) {
        const a2 = allies.filter(a=>a.hp>0&&a!==me)[0];
        if (a2) {
          const base2 = baseDmg(a2.chi, t.chi, a2.hp);
          const kr2 = applyKiryaku(applyRate(base2, 154, a2.chi, true), a2, st, isSelf);
          const actual2 = dealDmg(st, t, kr2.val, a2, isSelf, false, true);
          addLog(st, logS, `  仁者の沈勇(${a2.name}→${t.name}) 友軍援護 計略[${actual2.toLocaleString()}]${kr2.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
          st._lastMods = '';
        }
      }
    }
  }

  // 武田之赤備（山県昌景）passive: 25%（武勇依存）で赤備え突撃 敵単体 兵刃138%＋統率デバフ2T
  // 会心ダメージを与えた場合は追加+25%
  else if (f.name === '武田之赤備') {
    const _baseProb = me._critThisTurn ? 0.50 : 0.25;
    if (Math.random() < Math.min(1.0, _baseProb * statScale(me.bu))) {
      const logS = isSelf ? 'log-ally' : 'log-enemy';
      const t = pickTarget(opp);
      if (t) {
        const d = applyRate(baseDmg(me.bu, t.to, me.hp), 138);
        const cr = applyCrit(d, me);
        const actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
        addLog(st, logS, `  [${isSelf?'自':'敵'}] 武田之赤備(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
        st._lastMods = '';
        const toReduce = Math.round(0.15 * statScale(me.to) * t.to);
        t._toDebuf = (t._toDebuf||0) + toReduce;
        t._toDebufT = Math.max(t._toDebufT||0, 2);
        t.to = Math.max(1, t.to - toReduce);
        addLog(st, 'log-ctrl', `  武田之赤備: ${t.name} 統率-${toReduce}(2T)`);
      }
    }
  }
  // 越後二天（柿崎景家）strike
  else if (f.name === '越後二天') {
    if (Math.random() > 0.90) return;
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const t = pickTarget(opp);
    if (t) {
      const d = applyRate(baseDmg(me.bu, t.to, me.hp), 108);
      const cr = applyCrit(d, me);
      const actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 越後二天(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      const musaku_prob = Math.min(1.0, 0.40 + (me._ekizenStack||0) * 0.10);
      if ((t.musaku||0) > 0) {
        // 既に無策: 自己回復116%
        const h = applyHealRate(me.hp, me.bu, 116);
        const {healed:_ah, remainHp:_rh} = applyHeal(me, h, st, isSelf?'ally':'enemy');
        if (_ah > 0) addLog(st, 'log-heal', `  越後二天(自己回復): ${me.name} +${_ah.toLocaleString()}（残${_rh.toLocaleString()}）`);
      } else if (Math.random() < musaku_prob) {
        tryCtrl(t, u=>{ u.musaku = Math.max(u.musaku||0, 1); }, '無策', st);
        me._ekizenStack = Math.min(3, (me._ekizenStack||0) + 1);
        addLog(st, 'log-ctrl', `  越後二天: ${t.name} 無策1T付与（スタック${me._ekizenStack}）`);
      }
      if (Math.random() < 0.50) {
        const others = opp.filter(o=>o.hp>0&&o!==t);
        const t2 = others.length ? others[Math.floor(Math.random()*others.length)] : null;
        if (t2) {
          const d2 = applyRate(baseDmg(me.bu, t2.to, me.hp), 98);
          const cr2 = applyCrit(d2, me);
          const actual2 = dealDmg(st, t2, cr2.val, me, isSelf, true, false);
          addLog(st, logS, `  越後二天(追加)(${me.name}→${t2.name}) 兵刃[${actual2.toLocaleString()}]${cr2.label}（残${t2.hp.toLocaleString()}）${st._lastMods||''}`);
          st._lastMods = '';
        }
      }
    }
  }
  // 鬼十河（十河一存）strike
  else if (f.name === '鬼十河') {
    if (Math.random() > 0.35) return;
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const t = pickTarget(opp);
    if (t) {
      const d = applyRate(baseDmg(me.bu, t.to, me.hp), 188);
      const cr = applyCrit(d, me);
      const actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
      tryCtrl(t, u=>{ u.iatsuT = Math.max(u.iatsuT||0, 1); }, '威圧', st);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 鬼十河(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}+威圧1T（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    }
  }
  // 楼岸一番（蜂須賀小六）strike
  else if (f.name === '楼岸一番') {
    if (Math.random() > 0.40) return;
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const t = pickTarget(opp);
    if (t) {
      const isMelee = me.bu >= me.chi;
      let actualDmg;
      if (isMelee) {
        const d = applyRate(baseDmg(me.bu, t.to, me.hp), 168);
        const cr = applyCrit(d, me);
        actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
        addLog(st, logS, `  [${isSelf?'自':'敵'}] 楼岸一番(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      } else {
        const d = applyRate(baseDmg(me.chi, t.chi, me.hp), 168, me.chi, true);
        const kr = applyKiryaku(d, me, st, isSelf);
        actualDmg = dealDmg(st, t, kr.val, me, isSelf, false, true);
        addLog(st, logS, `  [${isSelf?'自':'敵'}] 楼岸一番(${me.name}→${t.name}) 計略[${actualDmg.toLocaleString()}]${kr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      }
      st._lastMods = '';
      const dur = t.hp > t.maxHp * 0.5 ? 1 : 2;
      t._rougannDebufT = Math.max(t._rougannDebufT||0, dur);
      t._rougannDebufRate = 0.30;
      addLog(st, 'log-ctrl', `  楼岸一番: ${t.name} 与ダメ-30%(${dur}T)付与`);
    }
  }
  // 疾風怒濤（甘粕景持）active
  else if (f.name === '疾風怒濤') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    // 自身+友軍1名に会心+45% 2T
    const targets_buf = [me];
    const a2 = allies.filter(a=>a.hp>0&&a!==me)[0];
    if (a2) targets_buf.push(a2);
    targets_buf.forEach(a => {
      a.critRate = Math.min(1.0, (a.critRate||0) + 0.45);
      a._shimoUCritT = Math.max(a._shimoUCritT||0, 2);
      addLog(st, 'log-buff', `  疾風怒濤(${a.name}): 会心+45%(2T)付与`);
    });
    // 敵2名に兵刃102%
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
      const d = applyRate(baseDmg(me.bu, t.to, me.hp), 102);
      const cr = applyCrit(d, me);
      const actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 疾風怒濤(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    });
  }
  // 不屈の精神（一条信龍）active
  else if (f.name === '不屈の精神') {
    me._hankiT = Math.max(me._hankiT||0, 2);
    me._hankiPow = 1.48;
    me._hankiHitCnt = 0;
    addLog(st, isSelf?'log-ally':'log-enemy', `  [${isSelf?'自':'敵'}] 不屈の精神(${me.name}): 反撃148% 2T付与`);
  }
  // 諏訪の光（諏訪姫）active
  else if (f.name === '諏訪の光') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    // HP多い順に2名を浄化+武勇・統率+36
    const sorted = [...allies.filter(a=>a.hp>0)].sort((a,b)=>b.hp-a.hp).slice(0,2);
    sorted.forEach(a => {
      const cleared = purify(a, 2);
      if (cleared.length) addLog(st, 'log-heal', `  諏訪の光(${a.name}) 浄化[${cleared.join(',')}]`);
      a.bu = (a.bu||100) + 36;
      a.to = (a.to||100) + 36;
      addLog(st, 'log-buff', `  諏訪の光(${a.name}): 武勇+36・統率+36`);
    });
  }
  // 陣前無我（佐久間信盛）active
  else if (f.name === '陣前無我') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const alliesLive = allies.filter(a=>a.hp>0);
    const minHpUnit = alliesLive.length ? alliesLive.reduce((a,b)=>a.hp<b.hp?a:b) : null;
    if (minHpUnit && minHpUnit !== me) {
      // 挑発・牽制: 敵2〜3名に
      const cnt = Math.random() < 0.5 ? 2 : 3;
      const myTeam = isSelf ? st.ally : st.enemy;
      const meIdx = myTeam.indexOf(me);
      opp.filter(o=>o.hp>0).slice(0, cnt).forEach(t => {
        tryCtrl(t, u=>{ u._kensei = true; }, '牽制', st);
        addLog(st, 'log-ctrl', `  陣前無我: ${t.name}に牽制1T付与`);
      });
    } else {
      // 自己回復258%（統率依存）
      const h = applyHealRate(me.hp, me.to, 258);
      const {healed:_ah, remainHp:_rh} = applyHeal(me, h, st, isSelf?'ally':'enemy');
      if (_ah > 0) addLog(st, 'log-heal', `  陣前無我(${me.name}) 自己回復+${_ah.toLocaleString()}（残${_rh.toLocaleString()}）`);
    }
  }
  // 一徹の意志（稲葉一鉄）active
  else if (f.name === '一徹の意志') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    // 統率+150 2T
    if ((me._issetsuToT||0) <= 0) {
      me.to = (me.to||100) + 150;
      me._issetsuToBoost = 150;
    }
    me._issetsuToT = 2;
    addLog(st, 'log-buff', `  一徹の意志(${me.name}): 統率+150(2T)（現在${Math.round(me.to)}）`);
    // 武勇最高の敵に挑発・牽制1T
    const liveOpp = opp.filter(o=>o.hp>0);
    const maxBuT = liveOpp.length ? liveOpp.reduce((a,b)=>b.bu>a.bu?b:a) : null;
    if (maxBuT) {
      tryCtrl(maxBuT, u=>{ u._kensei = true; }, '牽制', st);
      addLog(st, 'log-ctrl', `  一徹の意志: ${maxBuT.name}(武勇最高)に牽制1T`);
    }
    // 弱体化がある場合 鉄壁2回
    const weakened = ['muku','musaku','confused','hibi','iatsuT','shochinT','kaisoT'].some(k=>(me[k]||0)>0);
    if (weakened) {
      me.tesseki = (me.tesseki||0) + 2;
      addLog(st, 'log-buff', `  一徹の意志(${me.name}): 弱体化あり→鉄壁×2付与`);
    }
  }
  // 形影相弔（荒木村重）active
  else if (f.name === '形影相弔') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const t = pickTarget(opp);
    if (t) {
      if (st.turn <= 5) {
        // T1〜5: 自身→敵1名 計略192%
        const base1 = baseDmg(me.chi, t.chi, me.hp);
        const kr1 = applyKiryaku(applyRate(base1, 192, me.chi, true), me, st, isSelf);
        const actual1 = dealDmg(st, t, kr1.val, me, isSelf, false, true);
        addLog(st, logS, `  [${isSelf?'自':'敵'}] 形影相弔(${me.name}→${t.name}) 計略[${actual1.toLocaleString()}]${kr1.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
        st._lastMods = '';
        // 知略最高の友軍も同対象に計略192%
        const chiAllies = allies.filter(a=>a.hp>0&&a!==me);
        const maxChiAlly = chiAllies.length ? chiAllies.reduce((a,b)=>b.chi>a.chi?b:a) : null;
        if (maxChiAlly && t.hp > 0) {
          const base2 = baseDmg(maxChiAlly.chi, t.chi, maxChiAlly.hp);
          const kr2 = applyKiryaku(applyRate(base2, 192, maxChiAlly.chi, true), maxChiAlly, st, isSelf);
          const actual2 = dealDmg(st, t, kr2.val, maxChiAlly, isSelf, false, true);
          addLog(st, logS, `  形影相弔(${maxChiAlly.name}→${t.name}) 援護 計略[${actual2.toLocaleString()}]${kr2.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
          st._lastMods = '';
        }
      } else {
        // T6+: 同じ敵→自軍1名(ランダム)に計略192%（フレンドリーファイア）
        const friendlyTarget = pickTarget(allies);
        if (friendlyTarget) {
          const base3 = baseDmg(t.chi, friendlyTarget.chi, t.hp);
          const d3 = applyRate(base3, 192, t.chi, true);
          const actual3 = dealDmg(st, friendlyTarget, d3, t, !isSelf, false, true);
          addLog(st, logS, `  形影相弔(T6+)(${t.name}→${friendlyTarget.name}) 計略[${actual3.toLocaleString()}]（残${friendlyTarget.hp.toLocaleString()}）${st._lastMods||''}`);
          st._lastMods = '';
        }
      }
    }
  }
  // 湖水渡り（明智秀満）active
  else if (f.name === '湖水渡り') {
    const targets_buf = [me];
    const a2 = allies.filter(a=>a.hp>0&&a!==me)[0];
    if (a2) targets_buf.push(a2);
    targets_buf.forEach(a => {
      a.kiryakuRate = Math.min(1.0, (a.kiryakuRate||0) + 0.65);
      a._kosuiT = Math.max(a._kosuiT||0, 2);
      a._kosuiBoostCnt = 0;
      addLog(st, 'log-buff', `  湖水渡り(${a.name}): 奇策+65%(2T)付与`);
    });
  }
  // 勇志不抜（高力清長）active
  else if (f.name === '勇志不抜') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const isHighHp = me.hp > me.maxHp * 0.5;
    const buGain = isHighHp ? 75 : 100;
    const reneGain = isHighHp ? 0.24 : 0.32;
    me.bu = (me.bu||100) + buGain;
    me.renegadeRate = Math.min(1.0, (me.renegadeRate||0) + reneGain);
    addLog(st, 'log-buff', `  勇志不抜(${me.name}): 武勇+${buGain}・離反+${Math.round(reneGain*100)}%`);
    const buffTargets = allies.filter(a=>a.hp>0&&a!==me).slice(0,2);
    buffTargets.forEach(a => {
      a._yuushiBeiT = Math.max(a._yuushiBeiT||0, 2);
      addLog(st, 'log-buff', `  勇志不抜: ${a.name} 被ダメ-20%(2T)付与`);
    });
  }
  // 傲岸不遜（斎藤義龍）active
  else if (f.name === '傲岸不遜') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
      const d = applyRate(baseDmg(me.bu, t.to, me.hp), 118);
      const cr = applyCrit(d, me);
      const actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 傲岸不遜(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      const reduce = Math.min(0.60, 0.30 * statScale(me.to));
      t._goumanDebufT = Math.max(t._goumanDebufT||0, 2);
      t._goumanStrikeReduce = reduce;
      addLog(st, 'log-ctrl', `  傲岸不遜: ${t.name} 兵刃被ダメ-${Math.round(reduce*100)}%(2T)付与`);
    });
  }
  // 旋乾転坤（島津貴久）active
  else if (f.name === '旋乾転坤') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const cnt = Math.random() < 0.5 ? 2 : 3;
    opp.filter(o=>o.hp>0).slice(0, cnt).forEach(t=>{
      const base = baseDmg(me.chi, t.chi, me.hp);
      const kr = applyKiryaku(applyRate(base, 126, me.chi, true), me, st, isSelf);
      const actualDmg = dealDmg(st, t, kr.val, me, isSelf, false, true);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 旋乾転坤(${me.name}→${t.name}) 計略[${actualDmg.toLocaleString()}]${kr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      // 指揮/受動の合計数に応じてdmgRate増加
      const cmdPasCount = (me.slots||[]).filter(s=>s&&(s.type==='command'||s.type==='passive')).length
        + (me.fixed?.type==='command'||me.fixed?.type==='passive'?1:0);
      t._kyokouT = Math.max(t._kyokouT||0, 2);
      t._kyokouPow = me.chi;
      t._kyokouRate = 34 * cmdPasCount;
      addLog(st, 'log-ctrl', `  旋乾転坤: ${t.name} 恐慌2T付与(追加率${t._kyokouRate}%)`);
    });
  }
  // 津田流砲術（津田算長）active
  else if (f.name === '津田流砲術') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const t = pickTarget(opp);
    if (t) {
      const base = baseDmg(me.chi, t.chi, me.hp);
      const kr = applyKiryaku(applyRate(base, 188, me.chi, true), me, st, isSelf);
      const actualDmg = dealDmg(st, t, kr.val, me, isSelf, false, true);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 津田流砲術(${me.name}→${t.name}) 計略[${actualDmg.toLocaleString()}]${kr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      // [封撃, 無策, 威圧, 混乱]からランダム1つ
      const ctrlList = ['封撃','無策','威圧','混乱'];
      const chosen = ctrlList[Math.floor(Math.random()*ctrlList.length)];
      if (chosen === '封撃') {
        const oppSide = isSelf?'enemy':'ally';
        const ti = st[oppSide].indexOf(t);
        if (ti>=0) { st.fuuseki[oppSide][ti]=Math.max(st.fuuseki[oppSide][ti]||0,2); st.fuusekiAppliedTurn[oppSide][ti]=st.turn; }
        addLog(st,'log-ctrl',`  津田流砲術: ${t.name} 封撃2T`);
      } else if (chosen === '無策') {
        tryCtrl(t,u=>{u.musaku=Math.max(u.musaku||0,2);},'無策',st);
        addLog(st,'log-ctrl',`  津田流砲術: ${t.name} 無策2T`);
      } else if (chosen === '威圧') {
        tryCtrl(t,u=>{u.iatsuT=Math.max(u.iatsuT||0,2);},'威圧',st);
        addLog(st,'log-ctrl',`  津田流砲術: ${t.name} 威圧2T`);
      } else {
        tryCtrl(t,u=>{u.confused=Math.max(u.confused||0,2);},'混乱',st);
        addLog(st,'log-ctrl',`  津田流砲術: ${t.name} 混乱2T`);
      }
    }
  }
  // 先制攻撃（河田長親）active prep
  else if (f.name === '先制攻撃') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const cnt = Math.random() < 0.5 ? 2 : 3;
    opp.filter(o=>o.hp>0).slice(0, cnt).forEach(t=>{
      const base = baseDmg(me.chi, t.chi, me.hp);
      const kr = applyKiryaku(applyRate(base, 132, me.chi, true), me, st, isSelf);
      const actualDmg = dealDmg(st, t, kr.val, me, isSelf, false, true);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 先制攻撃(${me.name}→${t.name}) 計略[${actualDmg.toLocaleString()}]${kr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      t._senseiDebufT = Math.max(t._senseiDebufT||0, 2);
      t._senseiDebufRate = 0.30;
      addLog(st, 'log-ctrl', `  先制攻撃: ${t.name} 能動戦法被ダメ+30%(2T)付与`);
    });
  }
  // 密報通暁（樋口兼豊）active prep
  else if (f.name === '密報通暁') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    // 友軍1名に洞察2T
    const a2 = pickTarget(allies);
    if (a2) {
      a2.dousatsu = Math.max(a2.dousatsu||0, 2);
      addLog(st, 'log-buff', `  密報通暁: ${a2.name} 洞察2T付与`);
    }
    // 敵1名に撹乱2T
    const t = pickTarget(opp);
    if (t) {
      t._kakuranT = Math.max(t._kakuranT||0, 2);
      addLog(st, 'log-ctrl', `  密報通暁: ${t.name} 撹乱2T付与（能動発動時 計略152%受ける）`);
    }
  }
  // 三楽犬（太田資正）active
  else if (f.name === '三楽犬') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const cnt = Math.random() < 0.5 ? 2 : 3;
    const allyTargets = [...allies.filter(a=>a.hp>0)].slice(0, cnt);
    allyTargets.forEach(a => {
      a.spd = (a.spd||100) + 200;
      a._sakkoT = 1;
      addLog(st, 'log-buff', `  三楽犬: ${a.name} 速度+200(1T)付与`);
    });
    // 速度最高の敵にマーク
    const liveOpp = opp.filter(o=>o.hp>0);
    const maxSpdT = liveOpp.length ? liveOpp.reduce((a,b)=>b.spd>a.spd?b:a) : null;
    if (maxSpdT) {
      maxSpdT._sankakuMarked = true;
      addLog(st, 'log-ctrl', `  三楽犬: ${maxSpdT.name}(速度最高)をマーク`);
    }
  }
  // 笹の才蔵（可児才蔵）active prep
  else if (f.name === '笹の才蔵') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const t = pickTarget(opp);
    if (t) {
      const d = applyRate(baseDmg(me.bu, t.to, me.hp), 522);
      const cr = applyCrit(d, me);
      const hpBefore = t.hp;
      const actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 笹の才蔵(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      if (t.hp > 0) {
        t.healBlock = true;
        addLog(st, 'log-ctrl', `  笹の才蔵: ${t.name} 回復不可3T付与`);
      }
      if (t.hp <= 0) {
        me._sasanoPrepSkip = true;
        addLog(st, 'log-buff', `  笹の才蔵: ${t.name} 撃破→次T準備不要`);
      }
    }
  }
  // 洞察反撃（岡部元信）active prep
  else if (f.name === '洞察反撃') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    // 友軍2名に洞察2T
    allies.filter(a=>a.hp>0).slice(0,2).forEach(a=>{
      a.dousatsu = Math.max(a.dousatsu||0, 2);
      addLog(st, 'log-buff', `  洞察反撃: ${a.name} 洞察2T付与`);
    });
    me._dousatsuRevengeT = Math.max(me._dousatsuRevengeT||0, 2);
    addLog(st, 'log-buff', `  洞察反撃(${me.name}): 被通攻時 反撃304%(2T)付与`);
  }
  // 綱紀粛正（尼子晴久）active prep
  else if (f.name === '綱紀粛正') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const t = pickTarget(opp);
    if (t) {
      const base = baseDmg(me.chi, t.chi, me.hp);
      const kr = applyKiryaku(applyRate(base, 196, me.chi, true), me, st, isSelf);
      const actualDmg = dealDmg(st, t, kr.val, me, isSelf, false, true);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 綱紀粛正(${me.name}→${t.name}) 計略[${actualDmg.toLocaleString()}]${kr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      if (isTaisho && (t.iatsuT||0) > 0) {
        // 大将技: 既に威圧中なら疲弊2T
        tryCtrl(t, u=>{ u.hibi = Math.max(u.hibi||0, 2); }, '疲弊', st);
        addLog(st, 'log-ctrl', `  綱紀粛正・大将技: ${t.name} 既に威圧→疲弊2T付与`);
      } else {
        tryCtrl(t, u=>{ u.iatsuT = Math.max(u.iatsuT||0, 2); }, '威圧', st);
        addLog(st, 'log-ctrl', `  綱紀粛正: ${t.name} 威圧2T付与`);
      }
    }
  }
  // 落花啼鳥（朝倉義景）active prep
  else if (f.name === '落花啼鳥') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    allies.filter(a=>a.hp>0).slice(0,2).forEach(a=>{
      a.spd = (a.spd||100) + 100;
      a._rakkaAktBufT = Math.max(a._rakkaAktBufT||0, 2);
      a._rakkaAktBufRate = 0.75;
      addLog(st, 'log-buff', `  落花啼鳥: ${a.name} 速度+100(1T)・能動与ダメ+75%(2T)付与`);
    });
  }
  // 満ちゆく月（南部晴政）active prep
  else if (f.name === '満ちゆく月') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const liveOpp = opp.filter(o=>o.hp>0);
    const noKaiso = liveOpp.filter(o=>(o.kaisoT||0)===0);
    const t = noKaiso.length ? noKaiso[Math.floor(Math.random()*noKaiso.length)] : (liveOpp.length?liveOpp[Math.floor(Math.random()*liveOpp.length)]:null);
    if (t) {
      t.kaisoT = 4; t.kaisoPow = me.bu; t.kaisoRate = 108;
      t.kaisoCritRate = me.critRate||0; t.kaisoCritBonus = me.critBonus||0.5;
      addLog(st, 'log-ctrl', `  満ちゆく月: ${t.name} 潰走4T付与`);
      t._mangetsuDebufCnt = 2;
      addLog(st, 'log-ctrl', `  満ちゆく月: ${t.name} 次2回与ダメ-40%付与`);
    }
  }
  // 積水成淵（宮部継潤）active prep
  else if (f.name === '積水成淵') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const cnt_ally = Math.random() < 0.5 ? 2 : 3;
    allies.filter(a=>a.hp>0).slice(0, cnt_ally).forEach(a=>{
      a._shinkoRate = Math.max(a._shinkoRate||0, 0.22);
      addLog(st, 'log-buff', `  積水成淵: ${a.name} 心攻22%付与`);
    });
    const cnt_opp = Math.random() < 0.5 ? 2 : 3;
    opp.filter(o=>o.hp>0).slice(0, cnt_opp).forEach(t=>{
      t.suikouT = Math.max(t.suikouT||0, 2);
      t.suikouRate = 88;
      t.suikouPower = me.chi;
      t.suikouKirRate = me.kiryakuRate||0;
      t.suikouKirBonus = me.kiryakuBonus||0;
      addLog(st, 'log-ctrl', `  積水成淵: ${t.name} 水攻め2T(88%/T)付与`);
    });
  }
  // 怪力無双（真柄直隆）active prep2T
  else if (f.name === '怪力無双') {
    const logS = isSelf ? 'log-ally' : 'log-enemy';
    const cnt = isTaisho ? 3 : (Math.random() < 0.5 ? 2 : 3);
    opp.filter(o=>o.hp>0).slice(0, cnt).forEach(t=>{
      const d = applyRate(baseDmg(me.bu, t.to, me.hp), 333);
      const cr = applyCrit(d, me);
      const hpBefore = t.hp;
      const actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
      addLog(st, logS, `  [${isSelf?'自':'敵'}] 怪力無双(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}${isTaisho?'【大将技】':''}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      if (t.hp <= 0) {
        me.hajiRate = Math.min(1.0, (me.hajiRate||0) + 0.46);
        me._kairikiHajiT = Math.max(me._kairikiHajiT||0, 2);
        addLog(st, 'log-buff', `  怪力無双: ${t.name} 撃破→破陣+46%(2T)付与`);
      }
    });
  }
  // 豊後の戦陣（高橋紹運）: 自身に洞察付与＋最高属性バフ。大将技：主要属性+20
  else if (f.name === '豊後の戦陣') {
    me.dousatsu = Math.max(me.dousatsu||0, 1);
    const maxStat = Math.max(me.bu||100, me.chi||100, me.to||100);
    const isBuMax = me.bu >= me.chi && me.bu >= me.to;
    const isChiMax = !isBuMax && me.chi >= me.to;
    if (!me._bungo_applied) {
      me._bungo_applied = true;
      if (isBuMax)       { me.traitBuAtkMult  = (me.traitBuAtkMult||1)  + 0.12; }
      else if (isChiMax) { me.traitChiAtkMult = (me.traitChiAtkMult||1) + 0.12; }
      else               { /* 統率最高: 能動発動率+8%は prob check 側で適用 */ me._bungoActBoost = 0.08; }
      if (isTaisho) {
        if (isBuMax) me.bu = (me.bu||100) + 20;
        else if (isChiMax) me.chi = (me.chi||100) + 20;
        else me.to = (me.to||100) + 20;
      }
      const typeLabel = isBuMax ? '兵刃与ダメ+12%' : isChiMax ? '計略与ダメ+12%' : '能動発動率+8%';
      addLog(st, isSelf?'log-buff':'log-buff', `  豊後の戦陣(${me.name}): 洞察1T付与・${typeLabel}${isTaisho?'・主要属性+20（大将技）':''}`);
    } else {
      me.dousatsu = Math.max(me.dousatsu||0, 1);
    }
  }

  // 回山倒海（甘粕景継）strike: 通攻後 敵1名 兵刃104%＋潰走2T(94%/T)
  else if (f.name === '回山倒海') {
    if (Math.random() > 0.35) return;
    const logS = isSelf?'log-ally':'log-enemy';
    const t = pickTarget(opp);
    if (t) {
      const cr = applyCrit(applyRate(baseDmg(me.bu,t.to,me.hp),104), me);
      const actual = dealDmg(st,t,cr.val,me,isSelf,true,false);
      addLog(st,logS,`  [${isSelf?'自':'敵'}] 回山倒海(${me.name}→${t.name}) 兵刃[${actual.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods='';
      if (t.hp>0) { t.kaisoT=Math.max(t.kaisoT||0,2); t.kaisoPow=me.bu; t.kaisoRate=94; addLog(st,'log-ctrl',`  回山倒海: ${t.name} 潰走2T付与`); }
    }
  }
  // 槍弾正（保科正俊）active: 敵1名 兵刃172%＋無策1T
  else if (f.name === '槍弾正') {
    const logS = isSelf?'log-ally':'log-enemy';
    const t = pickTarget(opp);
    if (t) {
      const cr = applyCrit(applyRate(baseDmg(me.bu,t.to,me.hp),172), me);
      const actual = dealDmg(st,t,cr.val,me,isSelf,true,false);
      addLog(st,logS,`  [${isSelf?'自':'敵'}] 槍弾正(${me.name}→${t.name}) 兵刃[${actual.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods='';
      if (t.hp>0) tryCtrl(t,u=>{u.musaku=Math.max(u.musaku||0,1);},'無策',st);
    }
  }
  // 無想掃討（榊原康政）active: 敵1名 兵刃102%＋50%で別の敵1名 兵刃102%＋兵刃与ダメ+50% 2T
  else if (f.name === '無想掃討') {
    const logS = isSelf?'log-ally':'log-enemy';
    st._isActiveSkill = true;
    const t1 = pickTarget(opp);
    if (t1) {
      const cr1 = applyCrit(applyRate(baseDmg(me.bu,t1.to,me.hp),102), me);
      const a1 = dealDmg(st,t1,cr1.val,me,isSelf,true,false);
      addLog(st,logS,`  [${isSelf?'自':'敵'}] 無想掃討(${me.name}→${t1.name}) 兵刃[${a1.toLocaleString()}]${cr1.label}（残${t1.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods='';
      if (Math.random() < 0.50) {
        const others = opp.filter(o=>o.hp>0&&o!==t1);
        const t2 = others.length ? others[Math.floor(Math.random()*others.length)] : null;
        if (t2) {
          const cr2 = applyCrit(applyRate(baseDmg(me.bu,t2.to,me.hp),102), me);
          const a2 = dealDmg(st,t2,cr2.val,me,isSelf,true,false);
          addLog(st,logS,`  無想掃討(追加)(${me.name}→${t2.name}) 兵刃[${a2.toLocaleString()}]${cr2.label}（残${t2.hp.toLocaleString()}）${st._lastMods||''}`);
          st._lastMods='';
        }
      }
    }
    st._isActiveSkill = false;
    // 兵刃与ダメ+50% 2T（先行した武将数で低下: ここでは簡略化）
    me._musouBufT = 2; me._musouBufRate = 0.50;
    addLog(st,'log-buff',`  無想掃討(${me.name}): 兵刃与ダメ+50%(2T)獲得`);
  }
  // 啄木鳥（山本勘助）active: 敵1名 計略156%＋武勇最高友軍も兵刃160%＋35%で威圧1T
  else if (f.name === '啄木鳥') {
    const logS = isSelf?'log-ally':'log-enemy';
    st._isActiveSkill = true;
    const t = pickTarget(opp);
    if (t) {
      const kr = applyKiryaku(applyRate(baseDmg(me.chi,t.chi,me.hp),156,me.chi,true), me, st, isSelf);
      const actual = dealDmg(st,t,kr.val,me,isSelf,false,true);
      addLog(st,logS,`  [${isSelf?'自':'敵'}] 啄木鳥(${me.name}→${t.name}) 計略[${actual.toLocaleString()}]${kr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods='';
      const buMax = [...allies,me].filter(a=>a.hp>0).sort((a,b)=>b.bu-a.bu)[0];
      if (buMax) {
        const cr2 = applyCrit(applyRate(baseDmg(buMax.bu,t.to,buMax.hp),160), buMax);
        const a2 = dealDmg(st,t,cr2.val,buMax,isSelf,true,false);
        if (a2>0) { addLog(st,logS,`  啄木鳥(${buMax.name}→${t.name}) 援護兵刃[${a2.toLocaleString()}]${cr2.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`); st._lastMods=''; }
      }
      if (t.hp>0 && Math.random() < 0.35) tryCtrl(t,u=>{u.iatsuT=Math.max(u.iatsuT||0,1);},'威圧',st);
    }
    st._isActiveSkill = false;
  }
  // 死灰復然（内藤昌豊）active: 最低兵力友軍 回復276%＋被ダメ-18%1T＋超過分で自己回復108%
  else if (f.name === '死灰復然') {
    const _healSide = isSelf?'ally':'enemy';
    const target = [...allies,me].filter(a=>a.hp>0).sort((a,b)=>a.hp-b.hp)[0];
    if (target) {
      const h = applyHealRate(me.hp, me.chi, 276);
      const prev = target.hp;
      const {healed} = applyHeal(target,h,st,_healSide);
      addLog(st,'log-heal',`  死灰復然(${target.name}) 回復+${healed.toLocaleString()}（残${target.hp.toLocaleString()}）`);
      target._kinjoDefT = Math.max(target._kinjoDefT||0,1);
      addLog(st,'log-buff',`  死灰復然(${target.name}): 被ダメ-18%1T付与`);
      if (healed < h && target !== me) {
        const over = h - healed;
        const h2 = Math.round(over * 1.08);
        const {healed:_sh} = applyHeal(me,h2,st,_healSide);
        if (_sh>0) addLog(st,'log-heal',`  死灰復然(自己超過回復)(${me.name}) +${_sh.toLocaleString()}（残${me.hp.toLocaleString()}）`);
      }
    }
  }
  // 甲山猛虎（飯富虎昌）active: 敵2名 兵刃96%(封撃中:136%)＋封撃1T
  else if (f.name === '甲山猛虎') {
    const logS = isSelf?'log-ally':'log-enemy';
    st._isActiveSkill = true;
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t => {
      const oppSide = isSelf?'enemy':'ally';
      const ti = st[oppSide].indexOf(t);
      const isFuuseki = ti>=0 && (st.fuuseki[oppSide][ti]||0) > 0;
      const rate = isFuuseki ? 136 : 96;
      const cr = applyCrit(applyRate(baseDmg(me.bu,t.to,me.hp),rate), me);
      const actual = dealDmg(st,t,cr.val,me,isSelf,true,false);
      addLog(st,logS,`  [${isSelf?'自':'敵'}] 甲山猛虎(${me.name}→${t.name}) 兵刃[${actual.toLocaleString()}]${cr.label}${isFuuseki?'【封撃中強化】':''}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods='';
      if (t.hp>0 && ti>=0) { st.fuuseki[oppSide][ti]=Math.max(st.fuuseki[oppSide][ti]||0,1); st.fuusekiAppliedTurn[oppSide][ti]=st.turn; addLog(st,'log-ctrl',`  甲山猛虎: ${t.name} 封撃1T付与`); }
    });
    st._isActiveSkill = false;
  }
  // 夢幻泡影（お市）active: 自軍2名 回復118%＋与ダメ+15% 2T
  else if (f.name === '夢幻泡影') {
    const _healSide = isSelf?'ally':'enemy';
    const targets = [...allies,me].filter(a=>a.hp>0).slice(0,2);
    targets.forEach(a => {
      const h = applyHealRate(me.hp, me.chi, 118);
      const {healed} = applyHeal(a,h,st,_healSide);
      if (healed>0) addLog(st,'log-heal',`  夢幻泡影(${a.name}) 回復+${healed.toLocaleString()}（残${a.hp.toLocaleString()}）`);
      a._mugenBufT = Math.max(a._mugenBufT||0,2); a._mugenBufRate = 0.15;
      addLog(st,'log-buff',`  夢幻泡影(${a.name}): 与ダメ+15%(2T)付与`);
    });
  }
  // 破陣乱舞（酒井忠次）active: 自身+武勇最高友軍に破陣46%＋自身通攻に追加兵刃206%(1T)
  else if (f.name === '破陣乱舞') {
    const buMax = [...allies].filter(a=>a.hp>0).sort((a,b)=>b.bu-a.bu)[0];
    me.hajiRate = Math.max(me.hajiRate||0, 0.46);
    me._hajiRateT = Math.max(me._hajiRateT||0,1);
    addLog(st,'log-buff',`  破陣乱舞(${me.name}): 破陣+46%1T付与`);
    if (buMax) { buMax.hajiRate = Math.max(buMax.hajiRate||0,0.46); buMax._hajiRateT=Math.max(buMax._hajiRateT||0,1); addLog(st,'log-buff',`  破陣乱舞(${buMax.name}): 破陣+46%1T付与`); }
    me._haijinRanbuT = 1;
    addLog(st,'log-buff',`  破陣乱舞(${me.name}): 今T通攻に追加兵刃206%`);
  }
  // 冷徹無情（陶晴賢）active: 敵2名 兵刃142%＋HP75%以下で能動発動率+10%(最大2重)
  else if (f.name === '冷徹無情') {
    const logS = isSelf?'log-ally':'log-enemy';
    st._isActiveSkill = true;
    const threshold = (me._reitetsuCnt||0) >= 1 ? 0.50 : 0.75;
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t => {
      const hpRate = t.hp / t.maxHp;
      const bonus = Math.min(0.50, (0.25 + 0.25 * Math.min(1, t.injured / t.maxHp)));
      const rate = Math.round(142 * (1 + Math.min(bonus, 0.50)));
      const cr = applyCrit(applyRate(baseDmg(me.bu,t.to,me.hp),Math.min(rate,214)), me);
      const actual = dealDmg(st,t,cr.val,me,isSelf,true,false);
      addLog(st,logS,`  [${isSelf?'自':'敵'}] 冷徹無情(${me.name}→${t.name}) 兵刃[${actual.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods='';
      if (t.hp / t.maxHp <= threshold && (me._reitetsuCnt||0) < 2) {
        me._reitetsuCnt = (me._reitetsuCnt||0)+1;
        me._reitetsuBufT = isTaisho ? 4 : 2;
        me._reitetsuBuf = (me._reitetsuBuf||0) + 0.10;
        addLog(st,'log-buff',`  冷徹無情(${me.name}): 能動発動率+10%(${me._reitetsuCnt}重)`);
      }
    });
    st._isActiveSkill = false;
  }
  // 斗星北天（安東愛季）active: 洞察2T＋統率・知略+50＋敵2-3名に牽制
  else if (f.name === '斗星北天') {
    me.dousatsu = Math.max(me.dousatsu||0, 2);
    me.to = (me.to||100)+50; me.chi = (me.chi||100)+50;
    me._toStarBuf=50; me._chiStarBuf=50; me._starBufT=2;
    addLog(st,'log-buff',`  斗星北天(${me.name}): 洞察2T・統率+50・知略+50`);
    const cnt = Math.random()<0.5?2:3;
    opp.filter(o=>o.hp>0).slice(0,cnt).forEach(o=>{ o._牽制=true; addLog(st,'log-ctrl',`  斗星北天: ${o.name} 牽制付与`); });
  }
  // 先手必勝（板垣信方）active: 敵2名 計略134%＋被ダメ+52% 2T（次受ける能動戦法分）
  else if (f.name === '先手必勝') {
    const logS = isSelf?'log-ally':'log-enemy';
    st._isActiveSkill = true;
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t => {
      const kr = applyKiryaku(applyRate(baseDmg(me.chi,t.chi,me.hp),134,me.chi,true), me, st, isSelf);
      const actual = dealDmg(st,t,kr.val,me,isSelf,false,true);
      addLog(st,logS,`  [${isSelf?'自':'敵'}] 先手必勝(${me.name}→${t.name}) 計略[${actual.toLocaleString()}]${kr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods='';
      if (t.hp>0) { t._senseiDebufT=Math.max(t._senseiDebufT||0,2); t._senseiDebufRate=0.52; addLog(st,'log-ctrl',`  先手必勝: ${t.name} 能動被ダメ+52%(2T)付与`); }
    });
    st._isActiveSkill = false;
  }
  // 一心一徳（毛利隆元）active: 自軍2-3名 回復60%＋休養76%1T
  else if (f.name === '一心一徳') {
    const _healSide = isSelf?'ally':'enemy';
    const cnt = Math.random()<0.5?2:3;
    [...allies,me].filter(a=>a.hp>0).slice(0,cnt).forEach(a => {
      const h = applyHealRate(me.hp, me.chi, 60);
      const {healed} = applyHeal(a,h,st,_healSide);
      if (healed>0) addLog(st,'log-heal',`  一心一徳(${a.name}) 回復+${healed.toLocaleString()}（残${a.hp.toLocaleString()}）`);
      a.kyuyoRate=Math.max(a.kyuyoRate||0,0.76); a._kyuyo1T=true;
      addLog(st,'log-buff',`  一心一徳(${a.name}): 休養76%1T付与`);
    });
  }
  // 一切皆空（本願寺顕如）passive: 2T目以降に累積確率で一揆発動
  else if (f.name === '一切皆空') {
    if (st.turn < 2) return;
    me._ikkoProbAcc = Math.min(1.0, (me._ikkoProbAcc||0) + (st.turn === 2 ? 0.30 : 0.40));
    if (Math.random() > me._ikkoProbAcc) return;
    me._ikkoProbAcc = 0;
    addLog(st, isSelf?'log-ally':'log-enemy', `  一切皆空(${me.name}): 一揆発動！`);
    const _ikkoOpp = isSelf?st.enemy:st.ally;
    const _ikkoAllies = isSelf?st.ally:st.enemy;
    const IKKO_NAMES = ['本願寺顕如','鈴木佐大夫'];
    const _ikkoFriendCnt = _ikkoAllies.filter(a=>a.hp>0&&a!==me&&IKKO_NAMES.includes(a.name)).length;
    const _ikkoDmgPct = 72 + _ikkoFriendCnt * 12;
    const _ikkoAttackProb = st.turn <= 3 ? 0.80 : 0.90;
    const _ikkoCnt = Math.random() < 0.5 ? 2 : 3;
    const _ikkoAttr = Math.max(me.bu||100, me.chi||100);
    const _ikkoChi = (me.chi||100) >= (me.bu||100);
    let _ikkoTotalDmg = 0;
    _ikkoOpp.filter(o=>o.hp>0).slice(0, _ikkoCnt).forEach(t => {
      if (Math.random() > _ikkoAttackProb) return;
      const _d = applyRate(baseDmg(_ikkoAttr, 0, me.hp), _ikkoDmgPct, _ikkoAttr, _ikkoChi);
      const _actual = dealDmg(st, t, _d, me, isSelf, false, _ikkoChi);
      _ikkoTotalDmg += _actual;
      addLog(st, isSelf?'log-ally':'log-enemy', `  一切皆空(${me.name}→${t.name}) 一揆[${_actual.toLocaleString()}]（防御無視・残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    });
    if (_ikkoTotalDmg > 0) {
      const _healAmt = Math.round(_ikkoTotalDmg * 0.25);
      const _healTargets = _ikkoAllies.filter(a=>a.hp>0&&IKKO_NAMES.includes(a.name));
      const _finalHT = _healTargets.length > 0 ? _healTargets : [me];
      const _healPer = Math.round(_healAmt / _finalHT.length);
      _finalHT.forEach(a => {
        const {healed, remainHp} = applyHeal(a, _healPer, st, isSelf?'ally':'enemy');
        if (healed>0) addLog(st, 'log-heal', `  一切皆空: ${a.name} 回復+${healed.toLocaleString()}（残${remainHp.toLocaleString()}）`);
      });
    }
  }

  // 固有戦法ダメージ後のpendingログをフラッシュ（回生・城盗りなど）
  (st._pendingPostAttackLogs||[]).forEach(({cls, msg}) => addLog(st, cls, msg));
  st._pendingPostAttackLogs = [];
}

function execSlot(st, sk, me, isSelf, advMult, typeFilter=null) {
  if (!sk) return;
  if (typeFilter && !typeFilter.includes(sk.type)) return;
  const n = sk.name;
  const side = isSelf ? '自' : '敵';

  // 準備完了: 前ターンに準備していた戦法は今ターン必ず発動（無策も無視して突破）
  const isPrepped = (me.prepName === n);
  if (isPrepped) me.prepName = null; // 準備状態をクリアして発動フェーズへ進む

  // 無策: 能動戦法を発動不可（準備完了の場合はスキップしない）
  if (!isPrepped && sk.type === 'active' && (me.musaku||0) > 0) {
    addLog(st,'log-ctrl',`  無策: ${me.name} 能動戦法不発`);
    return;
  }
  // 発動率チェック（一行三昧・独立独歩ボーナス、加算方式）。準備完了の場合は確定発動
  let prob = sk.prob || 1.0;
  const _baseProb = prob;
  const _probBoosts = [];
  if (!isPrepped) {
    const _probAllies = isSelf ? st.ally : st.enemy;
    if (sk.type === 'active') {
      const hasIchigyou = me.slots?.some(s => s?.name==='一行三昧') || me.fixed?.name==='一行三昧';
      if (hasIchigyou) { prob = Math.min(1.0, prob + 0.14); _probBoosts.push('一行三昧+14%'); }
      const hasIchiJou = me.slots?.some(s => s?.name==='一上一下') || me.fixed?.name==='一上一下';
      if (hasIchiJou) { prob = Math.min(1.0, prob + 0.12); _probBoosts.push('一上一下+12%'); }
      // 融通自在バフ（個人単位）
      if ((me._yuuzuuBuf||0) > 0) { prob = Math.min(1.0, prob + me._yuuzuuBuf); _probBoosts.push(`融通自在+${Math.round(me._yuuzuuBuf*100)}%`); }
      // 豊後の戦陣: 統率最高者に能動発動率+8%
      if ((me._bungoActBoost||0) > 0) { prob = Math.min(1.0, prob + me._bungoActBoost); _probBoosts.push(`豊後の戦陣+${Math.round(me._bungoActBoost*100)}%`); }
      // 松柏之操: 大将の能動発動率+15%
      if ((me._matsuActBoost||0) > 0) { prob = Math.min(1.0, prob + me._matsuActBoost); _probBoosts.push(`松柏之操+${Math.round(me._matsuActBoost*100)}%`); }
      // 冷徹無情: 能動発動率+10%(最大2重)
      if ((me._reitetsuBuf||0) > 0) { prob = Math.min(1.0, prob + me._reitetsuBuf); _probBoosts.push(`冷徹無情+${Math.round(me._reitetsuBuf*100)}%`); }
      // 越後流軍学: 能動発動率+20%
      if ((me._echigoActBoost||0) > 0) { prob = Math.min(1.0, prob + me._echigoActBoost); _probBoosts.push(`越後流軍学+${Math.round(me._echigoActBoost*100)}%`); }
      // 撹乱: 能動発動時に計略152%を受ける
      if ((me._kakuranT||0) > 0) {
        const _kakuranOpp = isSelf ? st.enemy : st.ally;
        const _kakuranDmg = applyRate(baseDmg(150, me.chi, me.hp), 152, 150, true);
        dealDmg(st, me, _kakuranDmg, me, isSelf, false, true);
        addLog(st, isSelf?'log-ally':'log-enemy', `  撹乱(${me.name}): 能動発動→計略[${_kakuranDmg.toLocaleString()}]受けた`);
      }
    } else if (sk.type === 'strike') {
      const hasIndep = me.slots?.some(s => s?.name==='独立独歩') || me.fixed?.name==='独立独歩';
      if (hasIndep) { prob = Math.min(1.0, prob + 0.17); _probBoosts.push('独立独歩+17%'); }
    }
  }
  if (!isPrepped && Math.random() > prob) return;
  if (!isPrepped && _probBoosts.length > 0) {
    addLog(st, 'log-ctrl', `  発動率ブースト(${me.name}): ${Math.round(_baseProb*100)}%→${Math.round(prob*100)}% [${_probBoosts.join('、')}]`);
  }

  // 百万一心: 敵の能動戦法発動時に30-50%で阻止＋計略100%
  if (sk.type === 'active' && st._hyakumanHolder?.hp > 0 && st._hyakumanIsSelf !== isSelf) {
    if (Math.random() < (st._hyakumanProb||0.30)) {
      const hm = st._hyakumanHolder;
      const _hmDmg = Math.round(applyRate(baseDmg(hm.chi, me.chi, hm.hp), 100, hm.chi, true));
      dealDmg(st, me, _hmDmg, hm, st._hyakumanIsSelf, false, true);
      addLog(st, isSelf?'log-ally':'log-enemy', `  百万一心(${hm.name}): ${me.name}の能動戦法を阻止！計略[${_hmDmg.toLocaleString()}]（残${me.hp.toLocaleString()}）`);
      return;
    }
  }

  // 準備1Tが必要な戦法：初回発動時は準備フェーズへ
  if (!isPrepped && sk.prep) {
    // 運勝の鼻：75%の確率で準備をスキップして即時発動
    const hasUnshoBana = me.slots?.some(s => s?.name === '運勝の鼻');
    if (!hasUnshoBana || Math.random() >= 0.75) {
      me.prepName = n;
      addLog(st, isSelf?'log-ally':'log-enemy', `  [${side}] ${me.name} 【${n}】準備中…`);
      return;
    }
    addLog(st, isSelf?'log-ally':'log-enemy', `  [${side}] 運勝の鼻: 準備省略！`);
  }
  // 混乱: 全行動の対象を両軍全体から最大3名（自身含む）ランダム選択
  const confused = (me.confused||0) > 0;
  const _allLiveInclSelfSlot = [...st.ally,...st.enemy].filter(u=>u.hp>0);
  const _allLiveExclSelfSlot = _allLiveInclSelfSlot.filter(u=>u!==me);
  const confusedPoolSlot = _allLiveInclSelfSlot.slice().sort(()=>Math.random()-0.5).slice(0,3);
  const opp = confused ? confusedPoolSlot : (isSelf ? st.enemy : st.ally);
  const allies = confused ? _allLiveExclSelfSlot : (isSelf ? st.ally : st.enemy);

  // 槍の又左（前田利家）passive: 能動発動ごとに90%で鉄壁判定、2回ごとに次の通攻を強化
  if (sk.type === 'active' && me.fixed?.name === '槍の又左') {
    if (Math.random() < 0.90) {
      me._yarixaCheckCnt = (me._yarixaCheckCnt||0) + 1;
      addLog(st, isSelf?'log-ally':'log-enemy', `  槍の又左(${me.name}): 鉄壁判定[${me._yarixaCheckCnt}回目]`);
      if (me._yarixaCheckCnt >= 2) {
        me._yarixaCheckCnt = 0;
        me._yarixaEnhanced = true;
        addLog(st, isSelf?'log-ally':'log-enemy', `  槍の又左(${me.name}): 次の通常攻撃を強化（全体＋70%）`);
      }
    }
  }

  // 計略ダメの共通処理（奇策適用・isChi=true）
  const calcHit = (base, rate, attr, tgt, dep=true) => {
    let d = applyRate(base, rate, attr, dep);
    const kr = applyKiryaku(d, me, st, isSelf);
    d = kr.val;
    const actual = dealDmg(st, tgt, d, me, isSelf, false, true);
    if (st.hiyokuSide && st.hiyokuSide !== (isSelf?'ally':'enemy')) st.hiyokuAccum += actual * 0.75;
    return { dmg: actual, label: kr.label };
  };
  // 兵刃ダメの共通処理（会心適用・isMelee=true）
  const meleeHit = (base, rate, tgt) => {
    let d = applyRate(base, rate);
    const cr = applyCrit(d, me);
    d = cr.val;
    const actual = dealDmg(st, tgt, d, me, isSelf, true, false);
    return { dmg: actual, label: cr.label };
  };

  const logSide = isSelf ? 'log-ally' : 'log-enemy';

  if (n==='草木皆兵') {
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
      const r = calcHit(baseDmg(me.chi,t.chi,me.hp),142,me.chi,t,false);
      addLog(st,logSide,`  [${side}] 草木皆兵(${me.name}→${t.name}) 計略[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    });
    const _healSide = isSelf ? 'ally' : 'enemy';
    allies.filter(a=>a.hp>0).slice(0,2).forEach(a=>{
      const h = applyHealRate(me.hp, me.chi, 106);
      const {healed:_ah, remainHp:_rh} = applyHeal(a, h, st, _healSide);
      if (_ah > 0) addLog(st,'log-heal',`  草木皆兵回復(${a.name}) +${_ah.toLocaleString()}（残${_rh.toLocaleString()}）`);
    });
  } else if (n==='回天転運') {
    const _healSide = isSelf ? 'ally' : 'enemy';
    const w = [...allies.filter(a=>a.hp>0)].sort((a,b)=>a.hp-b.hp)[0];
    if (w) {
      const cleared = purify(w, 2);
      const h = applyHealRate(me.hp, me.chi, 260);
      const {healed:_ah, remainHp:_rh} = applyHeal(w, h, st, _healSide);
      addLog(st,'log-heal',`  回天転運(${w.name}) 弱体浄化[${cleared.join(',')||'なし'}]+${_ah.toLocaleString()}回復（残${_rh.toLocaleString()}）`);
    }
  } else if (n==='帰還の凱歌') {
    const _healSide = isSelf ? 'ally' : 'enemy';
    allies.filter(a=>a.hp>0).slice(0,2).forEach(a=>{
      const rate = a.hp/a.maxHp < 0.5 ? 172 : 132;
      const h = applyHealRate(me.hp, me.chi, rate);
      const {healed:_ah, remainHp:_rh} = applyHeal(a, h, st, _healSide);
      if (_ah > 0) addLog(st,'log-heal',`  帰還の凱歌(${a.name}) +${_ah.toLocaleString()}（残${_rh.toLocaleString()}）${rate===172?' [HP50%以下]':''}`);
    });
  } else if (n==='所領役帳') {
    const _healSide = isSelf ? 'ally' : 'enemy';
    const t = pickTarget(allies);
    if (t) {
      const h = applyHealRate(me.hp, me.chi, 212);
      const {healed:_ah, remainHp:_rh} = applyHeal(t, h, st, _healSide);
      if (_ah > 0) addLog(st,'log-heal',`  所領役帳(${t.name}) +${_ah.toLocaleString()}（残${_rh.toLocaleString()}）`);
    }
    // 回生2T: 兵力最低の自軍1名（50%確率・知略依存、回復66%・知略依存）
    const _rojiTgt = allies.filter(a=>a.hp>0).sort((a,b)=>a.hp-b.hp)[0];
    if (_rojiTgt) {
      _rojiTgt.kaiseiT = Math.max(_rojiTgt.kaiseiT||0, 2);
      _rojiTgt.kaiseiProb = Math.min(1.0, 0.50 * statScale(me.chi));
      _rojiTgt.kaiseiHealRate = 66;
      _rojiTgt.kaiseiDepStat = me.chi;
      addLog(st, 'log-buff', `  所領役帳: ${_rojiTgt.name} 回生2T付与`);
    }
  } else if (n==='有備無患') {
    const _healSide = isSelf ? 'ally' : 'enemy';
    allies.filter(a=>a.hp>0).slice(0,2).forEach(a=>{
      const h = applyHealRate(me.hp, me.chi, 108);
      const {healed:_ah, remainHp:_rh} = applyHeal(a, h, st, _healSide);
      if (_ah > 0) addLog(st,'log-heal',`  有備無患(${a.name}) +${_ah.toLocaleString()}（残${_rh.toLocaleString()}）`);
    });
  } else if (n==='嚢沙之計') {
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
      t.suikouT = 2; t.suikouRate = 102; t.suikouPower = me.chi; t.suikouKirRate = me.kiryakuRate||0; t.suikouKirBonus = me.kiryakuBonus||0;
      t._nouShaChiDebuf = (t._nouShaChiDebuf||0) + 0.30;
      t._nouShaChiDebufT = Math.max(t._nouShaChiDebufT||0, 2);
      addLog(st,'log-ctrl',`  嚢沙之計(${t.name}) 水攻め2T+計略被ダメ+30%(2T)`);
    });
  } else if (n==='霹靂一撃') {
    const t = pickTarget(opp);
    if (t) {
      const wasParalyzed = (t.muku || 0) > 0;
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),228,t);
      t.muku = 2;
      addLog(st,logSide,`  [${side}] 霹靂一撃(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）+麻痺2T${st._lastMods||''}`);
      st._lastMods = '';
      if (wasParalyzed) {
        me.critRate = Math.min(1.0, (me.critRate||0) + 0.50);
        me._rekirikiCritT = 2;
        addLog(st,logSide,`  霹靂一撃(麻痺ボーナス): ${me.name} 会心率+50%（2T）`);
      }
    }
  } else if (n==='千軍辟易') {
    const oppSide = isSelf ? 'enemy' : 'ally';
    opp.filter(o=>o.hp>0).forEach(t=>{
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),106,t);
      addLog(st,logSide,`  [${side}] 千軍辟易(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      // 封撃または無策状態の対象に35%で威圧付与
      const ti = st[oppSide].indexOf(t);
      const hasFuuseki = ti >= 0 && (st.fuuseki[oppSide][ti]||0) > 0;
      const hasMusaku  = (t.musaku||0) > 0;
      if ((hasFuuseki || hasMusaku) && Math.random() < 0.35) {
        tryCtrl(t, u => { u.iatsuT = Math.max(u.iatsuT||0, 1); }, '威圧', st);
        addLog(st,'log-ctrl',`    千軍辟易: ${t.name}に威圧1T付与`);
      }
    });
  } else if (n==='一力当先') {
    me.buff_atkDmg = 1.5;
    me.ranzuList = me.ranzuList || [];
    me.ranzuList.push({t:2, rate:0.75, atkDmg:true});
    addLog(st,'log-buff',`  一力当先(${me.name}) 通常攻撃+50%＋乱舞75%(2T)`);
  } else if (n==='水攻干計') {
    opp.filter(o=>o.hp>0).forEach(t=>{
      t.suikouT = 2; t.suikouRate = 98; t.suikouPower = me.chi; t.suikouKirRate = me.kiryakuRate||0; t.suikouKirBonus = me.kiryakuBonus||0;
      t.healBlock = true;
      addLog(st,'log-ctrl',`  水攻干計(${t.name}) 水攻め2T(98%/T)＋回復不可`);
    });
  } else if (n==='城盗り') {
    // 知略+33バフ（2T）を付与
    me._shiroChi = (me._shiroChi || 0) + 33;
    me._shiroChiT = 2;
    addLog(st, logSide, `  城盗り(${me.name}): 知略+33(2T)（計略${Math.round(me.chi + me._shiroChi)}相当）`);
    // 敵2〜3体に追加計略106%予約フラグ付与
    const _shiroCnt = Math.random() < 0.5 ? 2 : 3;
    opp.filter(o=>o.hp>0).slice(0, _shiroCnt).forEach(t => {
      t._shiroFlag = true;
      t._shiroAttacker = me;
      t._shiroIsSelf = isSelf;
      addLog(st, logSide, `  城盗り(${me.name}→${t.name}) 追加計略予約`);
    });
  } else if (n==='深慮遠謀') {
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
      t._shintyo = 3;
      t._shintyo_chi = me.chi;
      addLog(st,'log-ctrl',`  深慮遠謀(${me.name}→${t.name}) 与ダメ-28%(3T)`);
    });
  } else if (n==='前後挟撃') {
    me.rengiT = Math.max(me.rengiT||0, 1);
    const ally2 = allies.filter(a=>a.hp>0&&a!==me)[0];
    if (ally2) { ally2.rengiT = Math.max(ally2.rengiT||0, 1); }
    addLog(st,'log-buff',`  前後挟撃(${me.name}) 自身${ally2?'＋'+ally2.name:''}に連撃1T`);
  } else if (n==='縦横馳突') {
    me.rengiT = Math.max(me.rengiT||0, 1);
    me.fuusekiResist = Math.max(me.fuusekiResist||0, 1);
    addLog(st,'log-buff',`  縦横馳突(${me.name}) 連撃＋封撃耐性1T`);
  } else if (n==='大智不智') {
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
      tryCtrl(t, u=>{ u.shochinT = Math.max(u.shochinT||0, 2); u.shochinPow = me.chi; u.shochinRate = 104; u.shochinKirRate = me.kiryakuRate||0; u.shochinKirBonus = me.kiryakuBonus||0; }, '消沈', st);
      // 兵刃被ダメ+20%（2T）
      t._daichiBuDebuf = (t._daichiBuDebuf||0) + 0.20;
      t._daichiBuDebufT = Math.max(t._daichiBuDebufT||0, 2);
      addLog(st,'log-ctrl',`  大智不智(${t.name}) 消沈2T(104%/T)+兵刃被ダメ+20%(2T)付与`);
    });
  } else if (n==='紅蓮の炎') {
    opp.filter(o=>o.hp>0).forEach(t=>{
      const r = calcHit(baseDmg(me.chi,t.chi,me.hp),104,me.chi,t);
      t._kaen = (t._kaen||0) + 2; t._kaenRate = 74; t._kaenKirRate = me.kiryakuRate||0; t._kaenKirBonus = me.kiryakuBonus||0;
      addLog(st,logSide,`  [${side}] 紅蓮の炎(${me.name}→${t.name}) 計略[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）+火傷2T(74%/T)${st._lastMods||''}`);
      st._lastMods = '';
    });
  } else if (n==='所向無敵') {
    opp.filter(o=>o.hp>0).forEach(t=>{
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),254,t);
      addLog(st,logSide,`  [${side}] 所向無敵(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    });
  } else if (n==='五里霧中') {
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
      t.confused = Math.max(t.confused||0, 2);
      addLog(st,'log-ctrl',`  五里霧中(${t.name}) 混乱2T付与`);
    });
  } else if (n==='奇謀独断') {
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
      t.musaku = Math.max(t.musaku||0, 2);
      addLog(st,'log-ctrl',`  奇謀独断(${t.name}) 無策2T付与`);
    });
  } else if (n==='乗勝追撃') {
    opp.filter(o=>o.hp>0).forEach(t=>{
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),136,t);
      addLog(st,logSide,`  [${side}] 乗勝追撃(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    });
  } else if (n==='理非曲直') {
    const t = pickTarget(opp);
    if (t) {
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),192,t);
      tryCtrl(t, u=>{ u.confused = Math.max(u.confused||0, 1); }, '混乱', st);
      addLog(st,logSide,`  [${side}] 理非曲直(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）+混乱1T${st._lastMods||''}`);
      st._lastMods = '';
    }
  } else if (n==='一触即発') {
    const t = pickTarget(opp);
    if (t) {
      const toReduce = Math.round(70 * statScale(me.to || 100));
      t._toDebuf = (t._toDebuf || 0) + toReduce;
      t._toDebufT = Math.max(t._toDebufT || 0, 1);
      t.to = Math.max(1, (t.to || 100) - toReduce);
      t.musaku = Math.max(t.musaku || 0, 1);
      addLog(st,logSide,`  [${side}] 一触即発(${me.name}→${t.name}) 統率-${toReduce}（1T）＋無策1T`);
    }
  // ─ 新規S伝授戦法 ─
  } else if (n==='電光石火') {
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),96,t);
      addLog(st,logSide,`  [${side}] 電光石火(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    });
    const a2 = pickTarget(allies);
    if (a2) {
      a2.to = (a2.to||100) + 48;
      a2._dengkouToT = Math.max(a2._dengkouToT||0, 2);
      addLog(st,'log-buff',`  電光石火: ${a2.name} 統率+48(2T)`);
      // 援護: 友軍が敵1名を攻撃
      const engoTgt = pickTarget(opp);
      if (engoTgt) {
        const rE = meleeHit(baseDmg(a2.bu,engoTgt.to,a2.hp),96,engoTgt);
        addLog(st,logSide,`  電光石火援護(${a2.name}→${engoTgt.name}) 兵刃[${rE.dmg.toLocaleString()}]${rE.label}（残${engoTgt.hp.toLocaleString()}）${st._lastMods||''}`);
        st._lastMods = '';
      }
    }
  } else if (n==='勇猛無比') {
    me.critRate = Math.min(1.0, (me.critRate||0) + 0.25);
    me._yuumouCritT = 2;
    const t = pickTarget(opp);
    if (t) {
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),122,t);
      addLog(st,logSide,`  [${side}] 勇猛無比(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}+会心25%(2T)（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      // 最大2回まで再発動（速度依存60%）
      const reProb = Math.min(1.0, 0.60 * statScale(me.spd||100));
      for (let _re = 0; _re < 2; _re++) {
        if (Math.random() >= reProb) break;
        me.critRate = Math.min(1.0, (me.critRate||0) + 0.15);
        const t2 = pickTarget(opp.filter(o=>o.hp>0&&o!==t)) || pickTarget(opp);
        if (t2) {
          const r2 = meleeHit(baseDmg(me.bu,t2.to,me.hp),96,t2);
          addLog(st,logSide,`  勇猛無比(再発動${_re+1}回目)(${me.name}→${t2.name}) 兵刃[${r2.dmg.toLocaleString()}]${r2.label}（残${t2.hp.toLocaleString()}）${st._lastMods||''}`);
          st._lastMods = '';
        }
      }
    }
  } else if (n==='金城湯池') {
    const cnt = Math.random()<0.5?2:3;
    opp.filter(o=>o.hp>0).slice(0,cnt).forEach(t=>{
      tryCtrl(t, u=>{ u._kensei = true; }, '牽制', st);
      addLog(st,'log-ctrl',`  金城湯池: ${t.name}に牽制`);
    });
    // 被ダメ軽減: 知略依存(statScale)で最大30%
    const _kinjoRate = Math.min(0.30, 0.15 * statScale(me.chi||100));
    me._kinjoDefT = 1;
    me._kinjoChi = me.chi;
    addLog(st,'log-buff',`  金城湯池: ${me.name} 被ダメ-${Math.round(_kinjoRate*100)}%(1T、知略依存)`);
    // 次T前に自身回復（フラグで次T処理）
    me._kinjoHealNext = true;
    addLog(st,'log-buff',`  金城湯池: 次T行動前に自身回復78%予約`);
  } else if (n==='奇策縦横') {
    opp.filter(o=>o.hp>0).forEach(t=>{
      const r = calcHit(baseDmg(me.chi,t.chi,me.hp),254,me.chi,t);
      addLog(st,logSide,`  [${side}] 奇策縦横(${me.name}→${t.name}) 計略[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    });
  } else if (n==='瞬息万変') {
    const t = pickTarget(opp);
    if (t) {
      const r = calcHit(baseDmg(me.chi,t.chi,me.hp),162,me.chi,t);
      const wasConfused = (t.confused||0)>0;
      tryCtrl(t, u=>{ u.confused = Math.max(u.confused||0,1); }, '混乱', st);
      addLog(st,logSide,`  [${side}] 瞬息万変(${me.name}→${t.name}) 計略[${r.dmg.toLocaleString()}]${r.label}+混乱1T（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      if (wasConfused) {
        const t2 = opp.filter(o=>o.hp>0&&o!==t)[0];
        if (t2) {
          const isMelee2 = me.bu >= me.chi;
          const rate2 = 158;
          let d2 = applyRate(baseDmg(isMelee2?me.bu:me.chi, isMelee2?t2.to:t2.chi, me.hp), rate2, isMelee2?me.bu:me.chi, !isMelee2);
          if (!isMelee2) { const kr2 = applyKiryaku(d2, me, st, isSelf); d2 = kr2.val; }
          else { const cr2 = applyCrit(d2, me); d2 = cr2.val; }
          const actual2 = dealDmg(st, t2, d2, me, isSelf, isMelee2, !isMelee2);
          addLog(st, logSide, `  瞬息万変(混乱中): ${me.name}→${t2.name} 追加攻撃[${actual2.toLocaleString()}]（残${t2.hp.toLocaleString()}）${st._lastMods||''}`);
          st._lastMods = '';
        }
      }
    }
  } else if (n==='攻其不備') {
    const liveOpp = opp.filter(o=>o.hp>0);
    const lowestTo = [...liveOpp].sort((a,b)=>(a.to||100)-(b.to||100))[0];
    const lowestChi = [...liveOpp].sort((a,b)=>(a.chi||100)-(b.chi||100))[0];
    if (lowestTo) {
      const r = meleeHit(baseDmg(me.bu,lowestTo.to,me.hp),168,lowestTo);
      addLog(st,logSide,`  [${side}] 攻其不備・兵刃(${me.name}→${lowestTo.name}) [${r.dmg.toLocaleString()}]${r.label}（残${lowestTo.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    }
    if (lowestChi && lowestChi !== lowestTo) {
      const r = calcHit(baseDmg(me.chi,lowestChi.chi,me.hp),168,me.chi,lowestChi);
      addLog(st,logSide,`  [${side}] 攻其不備・計略(${me.name}→${lowestChi.name}) [${r.dmg.toLocaleString()}]${r.label}（残${lowestChi.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    } else if (lowestChi) {
      // 同一目標の場合も計略実行
      const r = calcHit(baseDmg(me.chi,lowestChi.chi,me.hp),168,me.chi,lowestChi);
      addLog(st,logSide,`  [${side}] 攻其不備・計略(${me.name}→${lowestChi.name}) [${r.dmg.toLocaleString()}]${r.label}（残${lowestChi.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    }
  } else if (n==='乱世の華') {
    const t = pickTarget(opp);
    if (t) {
      const rb = meleeHit(baseDmg(me.bu,t.to,me.hp),158,t);
      addLog(st,logSide,`  [${side}] 乱世の華・兵刃(${me.name}→${t.name}) [${rb.dmg.toLocaleString()}]${rb.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      const rc = calcHit(baseDmg(me.chi,t.chi,me.hp),158,me.chi,t);
      addLog(st,logSide,`  [${side}] 乱世の華・計略(${me.name}→${t.name}) [${rc.dmg.toLocaleString()}]${rc.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    }
  } else if (n==='境目奮戦') {
    const liveOpp = opp.filter(o=>o.hp>0);
    const lowestHpT = liveOpp.length ? liveOpp.reduce((a,b)=>a.hp<b.hp?a:b) : null;
    if (lowestHpT) {
      const r = calcHit(baseDmg(me.chi,lowestHpT.chi,me.hp),260,me.chi,lowestHpT);
      addLog(st,logSide,`  [${side}] 境目奮戦(${me.name}→${lowestHpT.name}) 計略[${r.dmg.toLocaleString()}]${r.label}（残${lowestHpT.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      const _sakaiRate = Math.min(0.60, 0.30 * statScale(me.chi||100));
      lowestHpT._healReduceT = 1;
      lowestHpT._healReduceRate = _sakaiRate;
      addLog(st,'log-ctrl',`  境目奮戦: ${lowestHpT.name} 回復効果-${Math.round(_sakaiRate*100)}%(1T、知略依存)`);
    }
  } else if (n==='静動自在') {
    // 自身より遅い友軍1名に洞察+先攻2T（そうでなければ自身に）
    const slower = allies.filter(a=>a.hp>0&&a!==me&&(a.spd||0)<(me.spd||0));
    const tgt = slower.length ? slower[slower.length-1] : me;
    tgt.dousatsu = Math.max(tgt.dousatsu||0, 2);
    tgt._senko = 2;
    addLog(st,'log-buff',`  静動自在: ${tgt.name} 洞察+先攻2T付与`);
  } else if (n==='戦意崩壊') {
    const t = pickTarget(opp);
    if (t) {
      const toReduce = 65; const chiReduce = 65;
      t._toDebuf = (t._toDebuf||0)+toReduce; t._toDebufT = Math.max(t._toDebufT||0,2);
      t._chiDebuf = (t._chiDebuf||0)+chiReduce; t._chiDebufT = Math.max(t._chiDebufT||0,2);
      t.to = Math.max(1,(t.to||100)-toReduce); t.chi = Math.max(1,(t.chi||100)-chiReduce);
      addLog(st,'log-ctrl',`  戦意崩壊: ${t.name} 統率-65・知略-65(2T)`);
      // 自軍大将に鉄壁×2
      const _mySide = isSelf ? st.ally : st.enemy;
      const taishoUnit = _mySide[0];
      if (taishoUnit && taishoUnit.hp>0) {
        const maxTesseki = me === taishoUnit ? 1 : 2; // 自身が大将なら1回
        taishoUnit.tesseki = (taishoUnit.tesseki||0) + maxTesseki;
        addLog(st,'log-buff',`  戦意崩壊: ${taishoUnit.name} 鉄壁×${maxTesseki}付与`);
      }
    }
  } else if (n==='陣形崩し') {
    const cnt = Math.random()<0.5?2:3;
    const liveOpp = opp.filter(o=>o.hp>0).slice(0,cnt);
    liveOpp.forEach(t=>{
      const buReduce = Math.round(48*statScale(me.bu||100));
      t._toDebuf=(t._toDebuf||0)+buReduce; t._toDebufT=Math.max(t._toDebufT||0,2); t.to=Math.max(1,(t.to||100)-buReduce);
      t._chiDebuf=(t._chiDebuf||0)+buReduce; t._chiDebufT=Math.max(t._chiDebufT||0,2); t.chi=Math.max(1,(t.chi||100)-buReduce);
      addLog(st,'log-ctrl',`  陣形崩し: ${t.name} 統率・知略-${buReduce}(2T)`);
    });
    liveOpp.forEach(t=>{
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),102,t);
      addLog(st,logSide,`  [${side}] 陣形崩し(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    });
  // ─ 新規A伝授戦法 ─
  } else if (n==='回山倒海') {
    const t = pickTarget(opp);
    if (t) {
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),104,t);
      addLog(st,logSide,`  [${side}] 回山倒海(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      t.kaisoT=2; t.kaisoPow=me.bu; t.kaisoRate=94; t.kaisoCritRate=me.critRate||0; t.kaisoCritBonus=me.critBonus||0.5;
      addLog(st,'log-ctrl',`  回山倒海: ${t.name}に潰走2T付与`);
    }
  } else if (n==='槍弾正') {
    const t = pickTarget(opp);
    if (t) {
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),172,t);
      t.musaku = Math.max(t.musaku||0,1);
      addLog(st,logSide,`  [${side}] 槍弾正(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}+無策1T（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    }
  } else if (n==='攻守兼備') {
    const t = pickTarget(opp);
    if (t) {
      const isMelee = me.bu >= me.chi;
      const dmgRate = 184;
      let r;
      if (isMelee) r = meleeHit(baseDmg(me.bu,t.to,me.hp),dmgRate,t);
      else { const base = baseDmg(me.chi,t.chi,me.hp); const kr = applyKiryaku(applyRate(base,dmgRate,me.chi,true),me,st,isSelf); const actual = dealDmg(st,t,kr.val,me,isSelf,false,true); r={dmg:actual,label:kr.label}; }
      addLog(st,logSide,`  [${side}] 攻守兼備(${me.name}→${t.name}) [${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    }
    me._koushubT = 1;
    addLog(st,'log-buff',`  攻守兼備: ${me.name} 被ダメ軽減(1T)`);
  } else if (n==='殿軍奮戦') {
    const t = pickTarget(opp);
    if (t) {
      const hasCtrl = ((t.iatsuT||0)>0 || (t._kensei)||false); // 挑発/牽制の簡易判定
      if (hasCtrl) {
        t._shintyo = Math.max(t._shintyo||0, 2); t._shintyo_chi = me.chi;
        addLog(st,'log-ctrl',`  殿軍奮戦: ${t.name} 与ダメ-25%(2T) [挑発/牽制あり]`);
      } else {
        tryCtrl(t, u=>{ u._kensei=true; }, '牽制', st);
        addLog(st,'log-ctrl',`  殿軍奮戦: ${t.name} 牽制(2T)付与`);
      }
    }
  } else if (n==='鉄砲猛撃') {
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
      const r = calcHit(baseDmg(me.chi,t.chi,me.hp),102,me.chi,t);
      addLog(st,logSide,`  [${side}] 鉄砲猛撃(${me.name}→${t.name}) 計略[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      t._teppoDebuf = (t._teppoDebuf||0)+0.12; t._teppoDebufT = Math.max(t._teppoDebufT||0,2);
      addLog(st,'log-ctrl',`  鉄砲猛撃: ${t.name} 与ダメ-12%(2T)`);
    });
  } else if (n==='先制先登') {
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),122,t);
      addLog(st,logSide,`  [${side}] 先制先登(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    });
    me._senko = Math.max(me._senko||0, 1);
    addLog(st,'log-buff',`  先制先登: ${me.name} 先攻1T`);
  } else if (n==='鬼玄蕃') {
    me._kiGenbaNextDebuf = 0.30; // 次被ダメ+30%
    me.renegadeRate = Math.min(1.0,(me.renegadeRate||0)+0.18); me._kigenbaRenegT = 2;
    addLog(st,'log-buff',`  鬼玄蕃: ${me.name} 次被ダメ+30%・離反18%(2T)付与`);
    const cnt = Math.random()<0.5?2:3;
    opp.filter(o=>o.hp>0).slice(0,cnt).forEach(t=>{
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),118,t);
      addLog(st,logSide,`  [${side}] 鬼玄蕃(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    });
  } else if (n==='忠勤励行') {
    allies.filter(a=>a.hp>0).slice(0,2).forEach(a=>{
      a._chukinnBuf = (a._chukinnBuf||0)+0.15; a._chukinnBufT = Math.max(a._chukinnBufT||0,2);
      addLog(st,'log-buff',`  忠勤励行: ${a.name} 兵刃与ダメ+15%(2T)`);
    });
    const t = pickTarget(opp);
    if (t) {
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),296,t);
      addLog(st,logSide,`  [${side}] 忠勤励行(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    }
  } else if (n==='援護射撃') {
    const _healSide = isSelf ? 'ally' : 'enemy';
    const a2 = allies.filter(a=>a.hp>0)[0];
    if (a2) {
      a2._engoT = 1; a2._engoAttacker = me;
      addLog(st,'log-buff',`  援護射撃: ${a2.name} 回避30%(1T)・初被ダメ時${me.name}が反撃162%`);
    }
  } else if (n==='一刀両断') {
    const t = pickTarget(opp);
    if (t) {
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),316,t);
      addLog(st,logSide,`  [${side}] 一刀両断(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    }
  } else if (n==='不意打ち') {
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
      const dur = Math.random()<0.65?2:1;
      const oppSide = isSelf?'enemy':'ally';
      if (Math.random()<0.5) {
        t.musaku = Math.max(t.musaku||0,dur);
        addLog(st,'log-ctrl',`  不意打ち: ${t.name}に無策${dur}T付与`);
      } else {
        const ti = st[oppSide].indexOf(t);
        if (ti>=0) { st.fuuseki[oppSide][ti] = Math.max(st.fuuseki[oppSide][ti]||0,dur); st.fuusekiAppliedTurn[oppSide][ti]=st.turn; }
        addLog(st,'log-ctrl',`  不意打ち: ${t.name}に封撃${dur}T付与`);
      }
    });
  } else if (n==='奮戦') {
    me.rengiT = Math.max(me.rengiT||0,1);
    me._funsenDmgPenalty = true;
    addLog(st,'log-buff',`  奮戦: ${me.name} 連撃付与(与ダメ-15%1T)`);
  } else if (n==='生死一顧') {
    opp.filter(o=>o.hp>0).forEach(t=>{
      const r = calcHit(baseDmg(me.chi,t.chi,me.hp),56,me.chi,t);
      addLog(st,logSide,`  [${side}] 生死一顧(${me.name}→${t.name}) 計略[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      tryCtrl(t, u=>{ u._kensei=true; }, '挑発', st);
    });
    addLog(st,'log-ctrl',`  生死一顧: 敵全体に挑発1T（自身を対象固定）`);
  } else if (n==='弓調馬服') {
    const t = pickTarget(opp);
    if (t) {
      const useBoth = Math.random() < Math.min(1.0,0.20*statScale(me.bu||100));
      const reduceAmt = 100;
      if (t.bu >= t.chi || useBoth) { t.bu = Math.max(1,t.bu-reduceAmt); addLog(st,'log-ctrl',`  弓調馬服: ${t.name} 武勇-${reduceAmt}(2T)`); }
      if (t.chi > t.bu || useBoth) { t.chi = Math.max(1,t.chi-reduceAmt); addLog(st,'log-ctrl',`  弓調馬服: ${t.name} 知略-${reduceAmt}(2T)`); }
      t._kyuchoDebufT = 2;
    }
  } else if (n==='先陣の勇') {
    const t = pickTarget(opp);
    if (t) {
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),154,t);
      addLog(st,logSide,`  [${side}] 先陣の勇(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      if (Math.random() < Math.min(1.0,0.35*statScale(me.spd||100))) {
        tryCtrl(t, u=>{u.iatsuT=Math.max(u.iatsuT||0,1);}, '威圧', st);
        addLog(st,'log-ctrl',`  先陣の勇: ${t.name}に威圧1T`);
      }
    }
    me.spd = (me.spd||100)+20; me._sendanSpdT = 2;
    addLog(st,'log-buff',`  先陣の勇: ${me.name} 速度+20(2T)`);
  } else if (n==='矢石飛交') {
    const t = pickTarget(opp);
    if (t) {
      const cnt = 2+Math.floor(Math.random()*3); // 2〜4回
      for(let i=0;i<cnt;i++){
        if(t.hp<=0)break;
        const r=meleeHit(baseDmg(me.bu,t.to,me.hp),84,t);
        addLog(st,logSide,`  [${side}] 矢石飛交(${i+1}/${cnt})(${me.name}→${t.name}) [${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
        st._lastMods = '';
      }
    }
  } else if (n==='融通自在') {
    const a2 = allies.filter(a=>a.hp>0&&a!==me)[0];
    if (a2) {
      a2._yuuzuuBuf = (a2._yuuzuuBuf||0)+0.12; a2._yuuzuuBufT = 2;
      addLog(st,'log-buff',`  融通自在: ${a2.name} 能動発動率+12%(2T)`);
    }
  } else if (n==='秋水一色') {
    me._shuusuiBuf = (me._shuusuiBuf||0)+0.20; me._shuusuiBufT = 2;
    const a2 = allies.filter(a=>a.hp>0&&a!==me)[0];
    if (a2) { a2._shuusuiBuf=(a2._shuusuiBuf||0)+0.20; a2._shuusuiBufT=2; addLog(st,'log-buff',`  秋水一色: ${a2.name} 計略与ダメ+20%(2T)`); }
    addLog(st,'log-buff',`  秋水一色: ${me.name} 計略与ダメ+20%(2T)`);
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
      const r=calcHit(baseDmg(me.chi,t.chi,me.hp),148,me.chi,t);
      addLog(st,logSide,`  [${side}] 秋水一色(${me.name}→${t.name}) 計略[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    });
  } else if (n==='祓除') {
    const _healSide = isSelf?'ally':'enemy';
    allies.filter(a=>a.hp>0).slice(0,2).forEach(a=>{
      const gain = Math.round(24*statScale(me.chi||100));
      a.bu=(a.bu||100)+gain; a.chi=(a.chi||100)+gain; a.spd=(a.spd||100)+gain;
      a._haraeStatT = 2;
      const cleared = purify(a,2);
      addLog(st,'log-buff',`  祓除: ${a.name} 武勇・知略・速度+${gain}(2T)・弱体化浄化[${cleared.join(',')||'なし'}]`);
    });
  } else if (n==='槍の鈴') {
    const t = pickTarget(opp);
    if (t) {
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),232,t);
      addLog(st,logSide,`  [${side}] 槍の鈴(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
      if (st.turn >= 3) {
        const h = applyHealRate(me.hp, me.bu, 54);
        const {healed:_ah,remainHp:_rh} = applyHeal(me,h,st,isSelf?'ally':'enemy');
        if (_ah>0) addLog(st,'log-heal',`  槍の鈴(T3以降): ${me.name} 回復+${_ah.toLocaleString()}（残${_rh.toLocaleString()}）`);
      }
    }
  } else if (n==='妖怪退治') {
    const t = pickTarget(opp);
    if (t) {
      // 強化効果1個解除
      const buffs = ['tesseki','renegadeRate','dousatsu','rengiT','kaiseiT'];
      let removed = false;
      for (const k of buffs) { if (t[k]>0) { t[k]=0; removed=true; addLog(st,'log-ctrl',`  妖怪退治: ${t.name} 強化[${k}]解除`); break; } }
      if (!removed) addLog(st,'log-ctrl',`  妖怪退治: ${t.name} 解除対象なし`);
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),256,t);
      addLog(st,logSide,`  [${side}] 妖怪退治(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    }
  } else if (n==='闇討ち') {
    const oppArr = isSelf?st.enemy:st.ally;
    const taishoTarget = oppArr.find(o=>o.hp>0);
    if (taishoTarget) {
      const r = meleeHit(baseDmg(me.bu,taishoTarget.to,me.hp),332,taishoTarget);
      addLog(st,logSide,`  [${side}] 闇討ち(${me.name}→${taishoTarget.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${taishoTarget.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    }
  } else if (n==='敵陣攪乱') {
    const t = pickTarget(opp);
    if (t) {
      const r = calcHit(baseDmg(me.chi,t.chi,me.hp),146,me.chi,t);
      tryCtrl(t, u=>{ u.confused=Math.max(u.confused||0,1); }, '混乱', st);
      addLog(st,logSide,`  [${side}] 敵陣攪乱(${me.name}→${t.name}) 計略[${r.dmg.toLocaleString()}]${r.label}+混乱1T（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    }
  } else if (n==='驍勇善戦') {
    me.critRate = Math.min(1.0,(me.critRate||0)+0.40); me._gyouyuuCritT = 2;
    addLog(st,'log-buff',`  驍勇善戦: ${me.name} 会心+40%(2T)`);
    const t = pickTarget(opp);
    if (t) {
      const r = meleeHit(baseDmg(me.bu,t.to,me.hp),312,t);
      addLog(st,logSide,`  [${side}] 驍勇善戦(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods = '';
    }
  } else if (n==='一六勝負') {
    if (Math.random()<0.5) {
      const t=pickTarget(opp);
      if(t){const r=calcHit(baseDmg(me.chi,t.chi,me.hp),240,me.chi,t);addLog(st,logSide,`  [${side}] 一六勝負(攻撃)(${me.name}→${t.name}) 計略[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);st._lastMods='';}
    } else {
      const _healSide=isSelf?'ally':'enemy';
      const a=pickTarget(allies);
      if(a){const h=applyHealRate(me.hp, me.chi, 240);const{healed:_ah,remainHp:_rh}=applyHeal(a,h,st,_healSide);if(_ah>0)addLog(st,'log-heal',`  一六勝負(回復)(${a.name}) +${_ah.toLocaleString()}（残${_rh.toLocaleString()}）`);}
    }
  } else if (n==='岐阜侍従') {
    const t = pickTarget(opp);
    if (t) {
      const rate = (me.bu>t.bu&&me.chi>t.chi)?170:148;
      const rb=meleeHit(baseDmg(me.bu,t.to,me.hp),rate,t);
      addLog(st,logSide,`  [${side}] 岐阜侍従・兵刃(${me.name}→${t.name}) [${rb.dmg.toLocaleString()}]${rb.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods='';
      const rc=calcHit(baseDmg(me.chi,t.chi,me.hp),rate,me.chi,t);
      addLog(st,logSide,`  [${side}] 岐阜侍従・計略(${me.name}→${t.name}) [${rc.dmg.toLocaleString()}]${rc.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods='';
    }
  } else if (n==='甲州流軍学') {
    const t = pickTarget(opp);
    if (t) {
      const r=calcHit(baseDmg(me.chi,t.chi,me.hp),186,me.chi,t);
      addLog(st,logSide,`  [${side}] 甲州流軍学(${me.name}→${t.name}) 計略[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
      st._lastMods='';
    }
    const a2=allies.filter(a=>a.hp>0)[0];
    if(a2){a2.tesseki=(a2.tesseki||0)+1;addLog(st,'log-buff',`  甲州流軍学: ${a2.name} 鉄壁1回付与`);}
  // ─ B戦法 ─
  } else if (n==='薙ぎ払い') {
    const t=pickTarget(opp);if(t){const r=meleeHit(baseDmg(me.bu,t.to,me.hp),125,t);addLog(st,logSide,`  [${side}] 薙ぎ払い(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);st._lastMods='';}
  } else if (n==='嘲罵') {
    opp.filter(o=>o.hp>0).forEach(t=>{tryCtrl(t,u=>{u._kensei=true;},'挑発',st);});
    addLog(st,'log-ctrl',`  嘲罵: 敵全体に挑発1T`);
  } else if (n==='連戦') {
    const t=pickTarget(opp);if(t){const r=meleeHit(baseDmg(me.bu,t.to,me.hp),120,t);addLog(st,logSide,`  [${side}] 連戦(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);st._lastMods='';}
  } else if (n==='不退転') {
    const t=pickTarget(opp);if(t){const r=meleeHit(baseDmg(me.bu,t.to,me.hp),140,t);addLog(st,logSide,`  [${side}] 不退転(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);st._lastMods='';}
  } else if (n==='看破') {
    const t=pickTarget(opp);
    if(t){
      const buffs=['tesseki','dousatsu','rengiT','kaiseiT'];
      let removed=false;
      for(const k of buffs){if(t[k]>0){t[k]=0;removed=true;addLog(st,'log-ctrl',`  看破: ${t.name} 強化[${k}]解除`);break;}}
      if(!removed)addLog(st,'log-ctrl',`  看破: ${t.name} 解除対象なし`);
      t.chi=Math.max(1,(t.chi||100)-18); t._hapoChiT=2;
      addLog(st,'log-ctrl',`  看破: ${t.name} 知略-18(2T)`);
    }
  } else if (n==='火計') {
    const t=pickTarget(opp);if(t){t._kaen=(t._kaen||0)+3;t._kaenRate=70;t._kaenKirRate=me.kiryakuRate||0;t._kaenKirBonus=me.kiryakuBonus||0;addLog(st,'log-ctrl',`  火計: ${t.name} 火傷3T(70%/T)付与`);}
  } else if (n==='殿軍') {
    const buGain=30; me.bu=(me.bu||100)+buGain; me._tongunBuT=2;
    addLog(st,'log-buff',`  殿軍: ${me.name} 武勇+${buGain}(2T)`);
  } else if (n==='破甲') {
    const t=pickTarget(opp);if(t){t._toDebuf=(t._toDebuf||0)+36;t._toDebufT=Math.max(t._toDebufT||0,2);t.to=Math.max(1,(t.to||100)-36);addLog(st,'log-ctrl',`  破甲: ${t.name} 統率-36(2T)`);}
  } else if (n==='火攻め') {
    const t=pickTarget(opp);if(t){const r=calcHit(baseDmg(me.chi,t.chi,me.hp),150,me.chi,t);addLog(st,logSide,`  [${side}] 火攻め(${me.name}→${t.name}) 計略[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);st._lastMods='';}
  } else if (n==='刺突') {
    const t=pickTarget(opp);if(t){t.kaisoT=3;t.kaisoPow=me.bu;t.kaisoRate=70;t.kaisoCritRate=me.critRate||0;t.kaisoCritBonus=me.critBonus||0.5;addLog(st,'log-ctrl',`  刺突: ${t.name} 潰走3T付与`);}
  } else if (n==='同討') {
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{const r=meleeHit(baseDmg(me.bu,t.to,me.hp),155,t);addLog(st,logSide,`  [${side}] 同討(${me.name}→${t.name}) 兵刃[${r.dmg.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);st._lastMods='';});
  } else if (n==='対話') {
    const a2=allies.filter(a=>a.hp>0)[0];if(a2){a2._taiwaResistT=3;addLog(st,'log-buff',`  対話: ${a2.name} 混乱耐性3T付与`);}
  } else if (n==='救援') {
    const _healSide=isSelf?'ally':'enemy';
    const a2=allies.filter(a=>a.hp>0)[0];if(a2){a2.kaiseiT=Math.max(a2.kaiseiT||0,2);a2.kaiseiProb=0.50;a2.kaiseiHealRate=75;a2.kaiseiDepStat=me.chi;addLog(st,'log-buff',`  救援: ${a2.name} 回生2T付与`);}
  } else if (n==='威圧') {
    opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{t._bishaDebuf=(t._bishaDebuf||0)+0.15;t._bishaDebufT=Math.max(t._bishaDebufT||0,2);});
    addLog(st,'log-ctrl',`  威圧(戦法): 敵2名 与ダメ-15%(2T)`);
  } else if (n==='水計') {
    const t=pickTarget(opp);if(t){t.suikouT=3;t.suikouRate=70;t.suikouPower=me.chi;t.suikouKirRate=me.kiryakuRate||0;t.suikouKirBonus=me.kiryakuBonus||0;addLog(st,'log-ctrl',`  水計: ${t.name} 水攻め3T(70%/T)付与`);}
  } else if (n==='猛撃') {
    me.critRate=Math.min(1.0,(me.critRate||0)+0.15); me._mogekiCritT=2;
    addLog(st,'log-buff',`  猛撃: ${me.name} 会心+15%(2T)`);
  } else if (n==='反撃') {
    me._hankiT = 1;
    addLog(st,'log-buff',`  反撃: ${me.name} 反撃1T（被通攻時 攻撃者に兵刃60%）`);
  } else if (n==='一念乱志') {
    if (st.turn >= 3 && Math.random() < 0.70) {
      const t = pickTarget(opp);
      if (t) {
        const r = meleeHit(baseDmg(me.bu,t.to,me.hp),178,t);
        const actual = dealDmg(st,t,r.dmg,me,isSelf,true,false);
        addLog(st,logSide,`  [${side}] 一念乱志(${me.name}→${t.name}) 兵刃[${actual.toLocaleString()}]${r.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
        st._lastMods = '';
        // 武勇最高の友軍も35%で同対象に兵刃178%（毎T-5%：初回35%）
        const prob2 = Math.max(0, 0.35 - (st.turn - 3) * 0.05);
        if (prob2 > 0 && Math.random() < prob2 && t.hp > 0) {
          const a2 = allies.filter(a=>a.hp>0&&a!==me).sort((a,b)=>b.bu-a.bu)[0];
          if (a2) {
            const r2 = meleeHit(baseDmg(a2.bu,t.to,a2.hp),178,t);
            const actual2 = dealDmg(st,t,r2.dmg,a2,isSelf,true,false);
            addLog(st,logSide,`  一念乱志(援護: ${a2.name}→${t.name}) 兵刃[${actual2.toLocaleString()}]${r2.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
            st._lastMods = '';
          }
        }
      }
    }
  } else if (n==='全力戦闘') {
    // 実際の70%連撃はturn.jsの行動前チェックで処理。ここではT5初回ログのみ
    if (st.turn === 5) addLog(st,'log-buff',`  全力戦闘(${me.name}): T5以降 連撃70%付与 開始`);
  }
  // 戦法ダメージ後のpendingログをフラッシュ（回生・城盗りなど）
  (st._pendingPostAttackLogs||[]).forEach(({cls, msg}) => addLog(st, cls, msg));
  st._pendingPostAttackLogs = [];
}

function execCommand(st, me, isSelf, isTaisho=false) {
  // 指揮戦法の継続効果（1回目のターンのみセットアップ的に記録、実処理はターン処理内）
  const f = me.fixed;
  if (f && f.type === 'command') {
    if (st.turn === 1) {
      if (f.name === '気炎万丈') {
        const oppSide = isSelf?'enemy':'ally';
        for(let i=0;i<2;i++) { st.fuuseki[oppSide][i]=3; st.fuusekiAppliedTurn[oppSide][i]=st.turn; }
        addLog(st,'log-ctrl',`  気炎万丈(${me.name}): 敵2名に封撃3T付与`);
      } else if (f.name === '千成瓢箪') {
        addLog(st,'log-buff','  千成瓢箪: 自軍2名（大将技:全体）を保持武将の行動時に回復（以降継続）');
      } else if (f.name === '比翼連理') {
        addLog(st,'log-buff','  比翼連理: 回復蓄積→計略変換（以降継続）');
      } else if (f.name === '罵詈雑言') {
        st.baritaunt = 3;
        st.baritauntProb = 0.90;
        st.baritauntSide = isSelf ? 'ally' : 'enemy';
        st.baritauntIdx = (isSelf ? st.ally : st.enemy).indexOf(me);
        me.baritauntProtectT = 3;
        addLog(st,'log-ctrl',`  罵詈雑言(${me.name}): 敵2〜3名に挑発3T(90%)＋自身被ダメ50%軽減`);
      } else if (f.name === '尼御台') {
        const allies = isSelf ? st.ally : st.enemy;
        const taisho = allies[0];
        if (taisho && taisho.hp > 0) {
          taisho.dousatsu = Math.max(taisho.dousatsu||0, 2);
          addLog(st,'log-buff',`  尼御台(${taisho.name}): 洞察2T付与`);
        }
      } else if (f.name === '非常の器') {
        addLog(st,'log-buff',`  非常の器: T3以降 毎T自軍全体に休養付与（以降継続）`);
      }
    }
    // 3T目以降の尼御台：大将に離反24%付与
    if (f?.name === '尼御台' && st.turn >= 3) {
      const allies = isSelf ? st.ally : st.enemy;
      const taisho = allies[0];
      if (taisho && taisho.hp > 0) {
        taisho.renegadeRate = Math.min(1.0, (taisho.renegadeRate||0) + 0.24);
        taisho._reneg1T = true;
        addLog(st,'log-ctrl',`  尼御台: ${taisho.name} 離反+24%（計${Math.round(taisho.renegadeRate*100)}%）`);
      }
    }
    // 非常の器：3T目以降毎T自軍全体に休養付与
    if (f?.name === '非常の器' && st.turn >= 3) {
      const allies = isSelf ? st.ally : st.enemy;
      allies.filter(a=>a.hp>0).forEach(a => {
        a.kyuyoRate = Math.max(a.kyuyoRate||0, 0.66);
        a._kyuyo1T = true;
      });
    }
    // 新生（織田信長）: 友軍2名の与ダメ+14%(統率依存)
    if (f.name === '新生') {
      const _shinsei = isSelf?st.ally:st.enemy;
      const _shinseiGain = Math.min(0.28, 0.14*statScale(me.to||100));
      if (st.turn===1) {
        _shinsei.filter(a=>a.hp>0&&a!==me).slice(0,2).forEach(a=>{
          a._shinseiAtkBuf=(a._shinseiAtkBuf||0)+_shinseiGain;
          addLog(st,'log-buff',`  新生(${a.name}): 与ダメ+${Math.round(_shinseiGain*100)}%付与`);
        });
      }
      // 大将技: 敵総兵力が35%以下になった時に回復開始（毎T確認）
      if (isTaisho) {
        const oppTeam = isSelf?st.enemy:st.ally;
        const oppTotalHp = oppTeam.reduce((s,u)=>s+(u.hp||0),0);
        const oppMaxHp = oppTeam.reduce((s,u)=>s+(u.maxHp||0),0);
        if (oppMaxHp > 0 && oppTotalHp/oppMaxHp <= 0.35) {
          const h = applyHealRate(me.hp, me.chi, 65);
          const {healed} = applyHeal(me,h,st,isSelf?'ally':'enemy');
          if (healed>0) addLog(st,'log-heal',`  新生・大将技(${me.name}): 回復+${healed.toLocaleString()}（残${me.hp.toLocaleString()}）`);
        }
      }
    }
    // 三河魂（徳川家康）: 毎T 友軍2名へのセット＋被通攻時に攻撃者全属性-2.5%(最大8重)
    if (f.name === '三河魂') {
      if (st.turn===1) addLog(st,'log-buff',`  三河魂(${me.name}): 友軍2名が通攻受けるたびに攻撃者全属性-2.5%（以降継続）`);
      const _myTeam = isSelf?st.ally:st.enemy;
      st._mikawaMagatamaGuards = _myTeam.filter(a=>a.hp>0&&a!==me).slice(0,2);
    }
    // 百万一心（毛利元就）: 毎T 敵2名が能動発動時30%で阻止+計略100%
    if (f.name === '百万一心') {
      if (st.turn===1) addLog(st,'log-buff',`  百万一心(${me.name}): 敵の能動戦法発動時30%で阻止＋計略ダメ（以降継続）`);
      st._hyakumanHolder=me; st._hyakumanIsSelf=isSelf;
      st._hyakumanProb = isTaisho ? 0.50 : 0.30;
    }
    // 内助の賢（妻木煕子）: 偶数Tに敵全体が継続状態中なら全軍回復96%
    if (f.name === '内助の賢') {
      if (st.turn===1) addLog(st,'log-buff',`  内助の賢(${me.name}): 偶数T・敵全体継続状態中なら自軍全体回復（以降継続）`);
      if (st.turn%2===0) {
        const oppTeam = isSelf?st.enemy:st.ally;
        const allHaveDoT = oppTeam.every(o=>o.hp<=0||(o.kaisoT||0)>0||(o.suikouT||0)>0||(o.shochinT||0)>0||(o._kaen||0)>0||(o.chudokuT||0)>0);
        if (allHaveDoT) {
          const _healSide = isSelf?'ally':'enemy';
          (isSelf?st.ally:st.enemy).filter(a=>a.hp>0).forEach(a=>{
            const h=applyHealRate(me.hp, me.chi, 96);
            const {healed}=applyHeal(a,h,st,_healSide);
            if(healed>0)addLog(st,'log-heal',`  内助の賢(${a.name}) 回復+${healed.toLocaleString()}（残${a.hp.toLocaleString()}）`);
          });
        }
      }
    }
    // 越後流軍学（宇佐美定満）: 自身の能動発動率+20%(ターン1回設定)
    if (f.name === '越後流軍学') {
      if (st.turn===1) addLog(st,'log-buff',`  越後流軍学(${me.name}): 能動発動率+20%・能動発動ごとに耐性付与`);
      me._echigoActBoost = 0.20;
    }
    // 同気連枝（お初）: 毎ターン 48%で敵2〜3名マーク → マーク敵の攻撃時に回復
    if (f.name === '同気連枝') {
      if (st.turn === 1) addLog(st, 'log-buff',
        `  同気連枝(${me.name}): 友軍通常攻撃後に主力属性+5（最大5スタック）・毎T敵マーク→攻撃時回復（以降継続）`);
      const _doukiOpp = isSelf ? st.enemy : st.ally;
      if (Math.random() < 0.48) {
        const cnt = Math.random() < 0.5 ? 2 : 3;
        st._doukiMarked = _doukiOpp.filter(o => o.hp > 0).slice(0, cnt);
        st._doukiSide   = isSelf ? 'ally' : 'enemy';
        st._doukiHolder = me;
        const names = st._doukiMarked.map(o => o.name).join('・');
        addLog(st, isSelf?'log-ally':'log-enemy',
          `  同気連枝(${me.name}): ${names} をマーク（攻撃時80%で対象を回復）`);
      } else {
        st._doukiMarked = []; st._doukiHolder = null;
      }
    }
    // 剛毅木訥（加藤嘉明）: 毎ターン 友軍2名を保護対象に設定
    if (f.name === '剛毅木訥') {
      const _gokiTeam = isSelf ? st.ally : st.enemy;
      // 大将以外優先
      const _gokiTargets = _gokiTeam.filter(a=>a.hp>0&&a!==me&&_gokiTeam.indexOf(a)!==0);
      const _gokiAll = _gokiTeam.filter(a=>a.hp>0&&a!==me);
      st._gokiHolder = me;
      st._gokiTargets = _gokiTargets.length >= 2 ? _gokiTargets.slice(0,2) : _gokiAll.slice(0,2);
      st._gokiSide = isSelf ? 'ally' : 'enemy';
      if (st.turn === 1) addLog(st, 'log-buff', `  剛毅木訥(${me.name}): 友軍保護+反撃86%・回復86%（以降継続）`);
    }
    // 疾風迅雷（立花誾千代）: 毎ターン45%で敵2名 兵刃76%
    if (f.name === '疾風迅雷') {
      if (Math.random() < 0.45) {
        const logS = isSelf ? 'log-ally' : 'log-enemy';
        const _oppArr = isSelf ? st.enemy : st.ally;
        _oppArr.filter(o=>o.hp>0).slice(0,2).forEach(t=>{
          const d = applyRate(baseDmg(me.bu, t.to, me.hp), 76);
          const cr = applyCrit(d, me);
          const actualDmg = dealDmg(st, t, cr.val, me, isSelf, true, false);
          addLog(st, logS, `  [${isSelf?'自':'敵'}] 疾風迅雷(${me.name}→${t.name}) 兵刃[${actualDmg.toLocaleString()}]${cr.label}（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
          st._lastMods = '';
          if ((t.muku||0) > 0) {
            // 既に麻痺中: 自軍1名回復96%
            const a2 = pickTarget(isSelf?st.ally:st.enemy);
            if (a2) {
              const h = applyHealRate(me.hp, me.bu, 96);
              const {healed:_ah,remainHp:_rh} = applyHeal(a2,h,st,isSelf?'ally':'enemy');
              if (_ah>0) addLog(st,'log-heal',`  疾風迅雷(麻痺中): ${a2.name} 回復+${_ah.toLocaleString()}（残${_rh.toLocaleString()}）`);
            }
          } else if (Math.random() < 0.50) {
            tryCtrl(t, u=>{ u.muku = Math.max(u.muku||0, 1); }, '麻痺', st);
            addLog(st, 'log-ctrl', `  疾風迅雷: ${t.name} 麻痺1T付与`);
          }
        });
      }
    }
    // 樽俎折衝（伊達輝宗）: 毎ターン30%×statScale(to)で封撃/無策+肩代わり
    if (f.name === '樽俎折衝') {
      if (Math.random() < Math.min(1.0, 0.30 * statScale(me.to||100))) {
        const _tarOpp = isSelf ? st.enemy : st.ally;
        const _tarT = pickTarget(_tarOpp);
        if (_tarT) {
          if (Math.random() < 0.5) {
            const ti = (isSelf?st.enemy:st.ally).indexOf(_tarT);
            const oppSide = isSelf?'enemy':'ally';
            if (ti>=0) { st.fuuseki[oppSide][ti]=Math.max(st.fuuseki[oppSide][ti]||0,1); st.fuusekiAppliedTurn[oppSide][ti]=st.turn; }
            addLog(st,'log-ctrl',`  樽俎折衝(${me.name}): ${_tarT.name} 封撃1T付与`);
          } else {
            tryCtrl(_tarT,u=>{u.musaku=Math.max(u.musaku||0,1);},'無策',st);
            addLog(st,'log-ctrl',`  樽俎折衝(${me.name}): ${_tarT.name} 無策1T付与`);
          }
          // 大将技: 肩代わり（簡略: _taruzuShare フラグ）
          const myTeamArr = isSelf ? st.ally : st.enemy;
          const taishoUnit = myTeamArr[0];
          if (taishoUnit && taishoUnit !== me && taishoUnit.hp > 0) {
            _tarT._taruzuShareT = Math.max(_tarT._taruzuShareT||0, 2);
            addLog(st,'log-buff',`  樽俎折衝: ${_tarT.name} 被ダメ4%大将肩代わり(2T)付与`);
          }
        }
      }
    }
    // 松柏之操（まつ）: 毎ターン 大将の能動発動率+15%
    if (f.name === '松柏之操') {
      const myTeamArr = isSelf ? st.ally : st.enemy;
      const taishoUnit = myTeamArr[0];
      if (taishoUnit && taishoUnit.hp > 0) {
        taishoUnit._matsuActBoost = 0.15;
        if (st.turn === 1) addLog(st, 'log-buff', `  松柏之操(${me.name}): ${taishoUnit.name} 能動発動率+15%（以降継続）`);
      }
    }
    // 末世の道者（大内義隆）: 毎ターン 知略最高友軍に計略与ダメ+14%・心攻14% / 武勇最高友軍の武勇-10%
    if (f.name === '末世の道者') {
      const myTeamArr = isSelf ? st.ally : st.enemy;
      const oppArr = isSelf ? st.enemy : st.ally;
      // 前ターンのバフを解除
      myTeamArr.filter(a=>a._sueoAtkBufChi).forEach(a=>{
        a.traitChiAtkMult = Math.max(1, (a.traitChiAtkMult||1) - 0.14);
        a._sueoAtkBufChi = false;
      });
      const liveTeam = myTeamArr.filter(a=>a.hp>0);
      const maxChiA = liveTeam.length ? liveTeam.reduce((a,b)=>b.chi>a.chi?b:a) : null;
      const maxBuA  = liveTeam.filter(a=>a!==me).length ? liveTeam.filter(a=>a!==me).reduce((a,b)=>b.bu>a.bu?b:a) : null;
      if (maxChiA) {
        maxChiA.traitChiAtkMult = (maxChiA.traitChiAtkMult||1) + 0.14;
        maxChiA._sueoAtkBufChi = true;
        maxChiA._shinkoRate = Math.max(maxChiA._shinkoRate||0, 0.14);
        addLog(st,'log-buff',`  末世の道者(${maxChiA.name}): 計略与ダメ+14%・心攻14%`);
      }
      if (maxBuA && (maxBuA._sueoWasDebuffed||false)===false) {
        const loss = Math.round(maxBuA.bu * 0.10);
        maxBuA.bu = Math.max(1, maxBuA.bu - loss);
        maxBuA._sueoWasDebuffed = true;
        addLog(st,'log-ctrl',`  末世の道者(${maxBuA.name}): 武勇-${loss}（10%低下）`);
      }
    }
    // 諸行無常（瑞溪院）: T1〜3: 与ダメ+24% / T4以降: 与ダメ-56%
    if (f.name === '諸行無常') {
      const myTeamArr = isSelf ? st.ally : st.enemy;
      const oppArr = isSelf ? st.enemy : st.ally;
      if (st.turn <= 3) {
        myTeamArr.filter(a=>a.hp>0).forEach(a=>{ a._shogyoAtkBuf = 0.24; a._shogyoDebufT = 0; });
        if (st.turn === 1) addLog(st,'log-buff',`  諸行無常(${me.name}): T1〜3 自軍与ダメ+24%`);
      } else {
        // T4以降: 自身と敵の知略最高に-56%デバフ
        myTeamArr.filter(a=>a.hp>0).forEach(a=>{ a._shogyoAtkBuf = 0; });
        me._shogyoDebufT = 3;
        const liveOpp = oppArr.filter(o=>o.hp>0);
        const maxChiO = liveOpp.length ? liveOpp.reduce((a,b)=>b.chi>a.chi?b:a) : null;
        if (maxChiO) {
          maxChiO._shogyoDebufT = 3;
          addLog(st,'log-ctrl',`  諸行無常: ${maxChiO.name} 与ダメ-56%(3T)`);
        }
        if (st.turn === 4) addLog(st,'log-ctrl',`  諸行無常(${me.name}): T4以降 自身・敵知略最高者 与ダメ-56%`);
      }
    }
    // 献身（仙桃院）: 44%×statScale(chi)で友軍異性1名に追加攻撃付与
    if (f.name === '献身') {
      if (Math.random() < Math.min(1.0, 0.44 * statScale(me.chi||100))) {
        const myTeamArr = isSelf ? st.ally : st.enemy;
        // 異性として友軍全員から1名ランダム（性別判定省略）
        const candidates = myTeamArr.filter(a=>a.hp>0&&a!==me);
        const target = candidates.length ? candidates[Math.floor(Math.random()*candidates.length)] : null;
        if (target) {
          target._kensinT = 1;
          addLog(st,'log-buff',`  献身(${target.name}): 次の通攻後 追加兵刃262%付与`);
        }
        me._kensinSelfDebuf = true;
        addLog(st,'log-ctrl',`  献身(${me.name}): このターン被ダメ+20%`);
      }
    }
    // 耐苦鍛錬（千坂景親）: T3まで大将援護 + 被通攻カウント
    if (f.name === '耐苦鍛錬') {
      if (st.turn === 1) addLog(st,'log-buff',`  耐苦鍛錬(${me.name}): T3まで大将援護・被通攻スタック(5で反撃160%)（以降継続）`);
    }
    // 月華鶴影（大祝鶴）: 毎ターン友軍2名をガード対象に設定
    if (f.name === '月華鶴影') {
      const myTeamArr = isSelf ? st.ally : st.enemy;
      const guards = myTeamArr.filter(a=>a.hp>0&&a!==me&&myTeamArr.indexOf(a)!==0);
      const guardsAll = myTeamArr.filter(a=>a.hp>0&&a!==me);
      st._getsukaHolder = me;
      st._getsukaGuards = guards.length >= 2 ? guards.slice(0,2) : guardsAll.slice(0,2);
      st._getsukaHitCount = st._getsukaHitCount||0;
      st._getsukaIsSelf = isSelf;
      if (st.turn === 1) addLog(st,'log-buff',`  月華鶴影(${me.name}): 友軍2名をガード・4ヒットで会心+25%（以降継続）`);
    }
    // 風姿綽約（お江）: 毎ターン 友軍2名に武勇+4%（最大4層）／ 4層達成で制御1種付与
    if (f.name === '風姿綽約') {
      if (st.turn === 1) addLog(st, 'log-buff',
        `  風姿綽約(${me.name}): 毎T友軍2名に武勇+4%（最大4層）・4層達成後65%で制御付与（以降継続）`);
      const _fuushiLogSide = isSelf ? 'log-ally' : 'log-enemy';
      const _fuushiTeam    = isSelf ? st.ally  : st.enemy;
      const _fuushiOpp     = isSelf ? st.enemy : st.ally;
      me._fuushiLayer = me._fuushiLayer || 0;
      // Effect 1: 武勇バフ（4層まで毎ターン積み上げ）
      if (me._fuushiLayer < 4) {
        me._fuushiLayer++;
        _fuushiTeam.filter(a => a.hp > 0 && a !== me).slice(0, 2).forEach(a => {
          const gain = Math.round(a.bu * 0.04 * statScale(me.chi));
          a.bu += gain;
          addLog(st, _fuushiLogSide, `  風姿綽約(${a.name}) 武勇+${gain}（${me._fuushiLayer}層）`);
        });
      }
      // Effect 2: 4層達成後 65%で制御1種付与（各状態は1回まで）
      if (me._fuushiLayer >= 4) {
        const prob = Math.min(1.0, 0.65 * statScale(me.chi));
        if (Math.random() < prob) {
          me._fuushiUsed = me._fuushiUsed || {};
          const available = ['混乱','無策','疲弊','封撃'].filter(s => !me._fuushiUsed[s]);
          if (available.length > 0) {
            const chosen = available[Math.floor(Math.random() * available.length)];
            const liveOpp = _fuushiOpp.filter(o => o.hp > 0);
            const tgt = liveOpp.length ? liveOpp[Math.floor(Math.random() * liveOpp.length)] : null;
            if (tgt) {
              me._fuushiUsed[chosen] = true;
              if (chosen === '混乱') tryCtrl(tgt, u => { u.confused = Math.max(u.confused||0, 1); }, '混乱', st);
              else if (chosen === '無策') tryCtrl(tgt, u => { u.musaku = Math.max(u.musaku||0, 1); }, '無策', st);
              else if (chosen === '疲弊') tryCtrl(tgt, u => { u.hibi = Math.max(u.hibi||0, 1); }, '疲弊', st);
              else if (chosen === '封撃') {
                const _fuushiOppSide = isSelf ? 'enemy' : 'ally';
                const ti = st[_fuushiOppSide].indexOf(tgt);
                if (ti >= 0) { st.fuuseki[_fuushiOppSide][ti] = Math.max(st.fuuseki[_fuushiOppSide][ti]||0, 1); st.fuusekiAppliedTurn[_fuushiOppSide][ti]=st.turn; }
              }
              addLog(st, 'log-ctrl', `  風姿綽約(${me.name}→${tgt.name}): ${chosen}1T付与`);
            }
          } else {
            addLog(st, _fuushiLogSide, `  風姿綽約(${me.name}): 全制御効果付与済み`);
          }
        }
      }
    }
  }
  // スロット指揮戦法
  me.slots && me.slots.forEach(sk => {
    if (sk && sk.type === 'command' && st.turn === 1) {
      const allies = isSelf ? st.ally : st.enemy;
      const opp = isSelf ? st.enemy : st.ally;
      if (sk.name==='気炎万丈') {
        const oppSide = isSelf?'enemy':'ally';
        for(let i=0;i<2;i++) { st.fuuseki[oppSide][i]=3; st.fuusekiAppliedTurn[oppSide][i]=st.turn; }
        addLog(st,'log-ctrl',`  気炎万丈(${me.name}): 敵2名に封撃3T`);
      } else if (sk.name==='罵詈雑言') {
        st.baritaunt = 3;
        st.baritauntProb = 0.90;
        st.baritauntSide = isSelf ? 'ally' : 'enemy';
        st.baritauntIdx = (isSelf ? st.ally : st.enemy).indexOf(me);
        me.baritauntProtectT = 3;
        addLog(st,'log-ctrl',`  罵詈雑言(${me.name}): 敵2〜3名に挑発3T(90%)＋自身被ダメ50%軽減`);
      } else if (sk.name==='深慮遠謀') {
        opp.filter(o=>o.hp>0).slice(0,2).forEach(t=>{ t._shintyo = 3; t._shintyo_chi = me.chi; });
        addLog(st,'log-ctrl',`  深慮遠謀(${me.name}): 敵2名 与ダメ-28%(3T)`);
      } else if (sk.name==='知者楽水') {
        // 自軍全体で「知略>武勇」の武将が多いか多数決で判定
        const _aliveAll = allies.filter(a=>a.hp>0);
        const _chiMajority = _aliveAll.filter(a=>(a.chi||100)>(a.bu||100)).length * 2 > _aliveAll.length;
        _aliveAll.slice(0,2).forEach(a=>{ a._chiryaku = 3; a._chiryaku_to = me.to; a._chiryaku_chiHigher = _chiMajority; });
        addLog(st,'log-buff',`  知者楽水(${me.name}): 自軍2名 被ダメ軽減(${_chiMajority?'兵刃24%・計略18%':'計略24%・兵刃18%'}・統率依存)+与ダメ-5%(3T)`);
      } else if (sk.name==='気勢衝天') {
        st.kiseiSide = isSelf ? 'ally' : 'enemy';
        st.kiseiTurns = 4;
        st.kiseiBu = me.bu;
        addLog(st,'log-ctrl',`  気勢衝天(${me.name}): 武勇・知略最高の敵に与ダメ-30%(4T) ※保持武将の行動時に発動`);
      } else if (sk.name==='一領具足') {
        st.ichiryo = { turns: 4, side: isSelf ? 'ally' : 'enemy', bu: me.bu, to: me.to };
        addLog(st,'log-buff',`  一領具足(${me.name}): T1〜2 自軍全体 被ダメ-12%(武勇依存) / T3〜4 全体に傭兵付与(統率依存)`);
      } else if (sk.name==='参謀の助言') {
        const gain = Math.round(28 * statScale(me.chi||100));
        allies.filter(a=>a.hp>0).forEach(a=>{
          a.bu=(a.bu||100)+gain; a.chi=(a.chi||100)+gain;
          addLog(st,'log-buff',`  参謀の助言(${a.name}) 武勇・知略+${gain}`);
        });
      } else if (sk.name==='警戒周到') {
        st._keikaiSide = isSelf?'ally':'enemy';
        st._keikaiTurns = 4;
        st._keikaiChi = me.chi;
        addLog(st,'log-buff',`  警戒周到(${me.name}): 自軍2名 被ダメ-22%(4T目まで)`);
      } else if (sk.name==='戦意消沈') {
        // T1に1名、T3に1名の疲弊付与 → セットアップ
        st._seii1 = { side: isSelf?'enemy':'ally', chi: me.chi };
        addLog(st,'log-ctrl',`  戦意消沈(${me.name}): T1に敵1名・T3に敵1名 疲弊付与予約`);
        // T1疲弊 即時発動
        const _seiiOpp = isSelf?st.enemy:st.ally;
        const _seiiT = pickTarget(_seiiOpp);
        if (_seiiT) { tryCtrl(_seiiT, u=>{ u.hibi=Math.max(u.hibi||0,2); },'疲弊',st); addLog(st,'log-ctrl',`  戦意消沈: ${_seiiT.name}に疲弊2T付与`); }
      } else if (sk.name==='恵風和雨') {
        if (st.turn === 1) addLog(st,'log-buff',`  恵風和雨(${me.name}): 偶数T80%で自軍2名回復122%（以降継続）`);
      }
    }
  });
  // 指揮戦法固有：恵風和雨 毎偶数T処理
  if (me.fixed?.name === '恵風和雨' || me.slots?.some(s=>s?.name==='恵風和雨')) {
    if (st.turn % 2 === 0) {
      const prob = 0.80 * statScale(me.chi||100);
      if (Math.random() < prob) {
        const _healSide = isSelf?'ally':'enemy';
        const _myTeam = isSelf?st.ally:st.enemy;
        _myTeam.filter(a=>a.hp>0).slice(0,2).forEach(a=>{
          const h = applyHealRate(me.hp, me.chi, 122);
          const {healed:_ah,remainHp:_rh} = applyHeal(a,h,st,_healSide);
          if(_ah>0) addLog(st,'log-heal',`  恵風和雨(${a.name}) +${_ah.toLocaleString()}（残${_rh.toLocaleString()}）`);
        });
      }
    }
  }
  // 戦意消沈: T3で2人目疲弊付与
  if (st._seii1 && st._seii1.side === (isSelf?'enemy':'ally') && st.turn === 3) {
    const _seiiOpp2 = isSelf?st.enemy:st.ally;
    const alreadyHibi = _seiiOpp2.filter(o=>(o.hibi||0)>0);
    const notHibi = _seiiOpp2.filter(o=>o.hp>0&&(o.hibi||0)===0);
    const _seiiT2 = notHibi.length ? notHibi[0] : pickTarget(_seiiOpp2);
    if(_seiiT2){tryCtrl(_seiiT2,u=>{u.hibi=Math.max(u.hibi||0,2);},'疲弊',st);addLog(st,'log-ctrl',`  戦意消沈(T3): ${_seiiT2.name}に疲弊2T付与`);}
  }
  // 警戒周到: 被ダメ修正は dealDmg 側でチェック（st._keikaiSide, st._keikaiTurns）
  if (st._keikaiTurns > 0) {
    st._keikaiTurns--;
    if (st._keikaiTurns <= 0) { addLog(st,'log-info',`  警戒周到: 効果終了`); st._keikaiSide=null; }
  }
}
