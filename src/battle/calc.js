// ═══════════════════════════════════════
// ダメージ計算式
// ═══════════════════════════════════════
const HP_TBL = [[1000,88],[2000,176],[3000,232],[4000,276],[5000,314],
  [6000,334],[7000,350],[8000,364],[9000,376],[10000,387],[12000,408],[15000,432]];

function hpDmg(hp) {
  for (let i = HP_TBL.length-1; i >= 0; i--) {
    if (hp >= HP_TBL[i][0]) {
      const nxt = HP_TBL[Math.min(i+1, HP_TBL.length-1)];
      if (nxt[0] === HP_TBL[i][0]) return HP_TBL[i][1];
      return HP_TBL[i][1] + (nxt[1]-HP_TBL[i][1])*(hp-HP_TBL[i][0])/(nxt[0]-HP_TBL[i][0]);
    }
  }
  return 20;
}
function minG(hp){ return Math.max(5, Math.floor(hp/1000)*2); }
function attrD(x, coef=1.44){ return (0.0005*x*x + 0.9*x + 4.5) * coef; }
function baseDmg(atkA, defD, atkHp){ return Math.max(minG(atkHp), minG(atkHp)+hpDmg(atkHp)+attrD(atkA-defD)); }
function statScale(stat) { return Math.max(1, 1 + (stat - 100) * 0.0025); } // 100基準: 200で×1.25, 300で×1.50（各種確率補正に使用）
function applyRate(base, rate, atkAttr, dep=false){
  let d = base*(rate/100);
  return Math.max(1, Math.round(d*(0.956+Math.random()*0.088)));
}
function rand4(){ return 0.956+Math.random()*0.088; }

// 回復基礎値: 144.09*ln(兵力) - 897.91
function healBase(hp) { return Math.max(0, 144.09 * Math.log(hp) - 897.91); }
// 回復量: (回復基礎値 + 依存stat) * (rate/100) * 乱数
function applyHealRate(hp, depStat, rate) {
  return Math.max(1, Math.round((healBase(hp) + (depStat || 0)) * (rate / 100) * rand4()));
}

// ─ 会心チェック（兵刃ダメージ後に適用）
function applyCrit(dmg, me) {
  if ((me?.critRate||0) > 0 && Math.random() < me.critRate) {
    return { val: Math.round(dmg * (1 + (me.critBonus||0.3))), label:'★会心' };
  }
  return { val: dmg, label:'' };
}
// ─ 奇策チェック（計略ダメージ後に適用）
// st, isSelf: 七十二の計スタック管理と爆発処理に使用（省略可）
function applyKiryaku(dmg, me, st=null, isSelf=true) {
  // kiryakuRate: initUnitで計算された奇策確率（水の如し+5%、七十二の計+50%等を含む）
  const rate = (me?.kiryakuRate||0);
  let fired = false;
  let val = dmg;
  let label = '';
  if (rate > 0 && Math.random() < rate) {
    val = Math.round(dmg * (1.5 + (me?.kiryakuBonus||0)));
    label = '⚡奇策';
    fired = true;
  }
  // 七十二の計：奇策発動時にスタック+1し、7スタックで全体計略120%爆発（1回限り）
  if (fired && st && !me?._nanaFired && me?.slots?.some(s => s?.name === '七十二の計')) {
    me.nanaCnt = (me.nanaCnt || 0) + 1;
    if (me.nanaCnt >= 7) {
      me._nanaFired = true;
      const isConfused = (me.confused||0) > 0;
      const targets = isConfused
        ? [...st.ally,...st.enemy].filter(o=>o.hp>0).sort(()=>Math.random()-0.5)
        : (isSelf ? st.enemy : st.ally).filter(o=>o.hp>0);
      targets.forEach(t => {
        const d = applyRate(baseDmg(me.chi, t.chi, me.hp), 120, me.chi, true);
        const actualDmg = dealDmg(st, t, d, me, isSelf, false, true);
        addLog(st, isSelf?'log-ally':'log-enemy', `  ⚡七十二の計爆発！(${me.name}→${t.name}) [${actualDmg.toLocaleString()}]（残${t.hp.toLocaleString()}）${st._lastMods||''}`);
        st._lastMods = '';
      });
    }
  }
  return { val, label };
}
