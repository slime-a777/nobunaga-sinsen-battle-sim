// ═══════════════════════════════════════
// UI 制御・シミュレーション実行
// ═══════════════════════════════════════
function updateHPBars(st) {
  ['ally','enemy'].forEach(side => {
    [0,1,2].forEach(i => {
      const el = document.getElementById(`${side}${i}`);
      if (!el) return;
      const b = st[side][i];
      const pct = b.maxHp>0 ? Math.max(0,b.hp/b.maxHp*100) : 0;
      const injPct = b.maxHp>0 ? Math.max(0,(b.injured||0)/b.maxHp*100) : 0;
      el.querySelector('.hp-bar-fill').style.width = pct+'%';
      const injBar = el.querySelector('.hp-bar-injured');
      if (injBar) { injBar.style.left = pct+'%'; injBar.style.width = injPct+'%'; }
      const injured = b.injured||0, dead = b.dead||0;
      el.querySelector('.hp-text').textContent = `健:${Math.max(0,b.hp).toLocaleString()} 傷:${injured.toLocaleString()} 亡:${dead.toLocaleString()}`;
    });
  });
}

function renderLog(st) {
  const area = document.getElementById('log-area');
  area.innerHTML = '';
  st.log.forEach(e => {
    const div = document.createElement('div');
    div.className = `log-entry ${e.cls}`;
    div.textContent = e.msg;
    area.appendChild(div);
  });
  area.scrollTop = area.scrollHeight;
}

// ─ ピックアップ戦闘ログ（1戦詳細）
function renderPickup(st, winnerLabel) {
  const area = document.getElementById('pickup-area');
  const hp0 = [
    ...st.ally.map(b=>`<span style="color:var(--blue2)">${b.name} 健:${b.hp.toLocaleString()} 傷:${(b.injured||0).toLocaleString()} 亡:${(b.dead||0).toLocaleString()}</span>`),
    ...st.enemy.map(b=>`<span style="color:var(--red2)">${b.name} 健:${b.hp.toLocaleString()} 傷:${(b.injured||0).toLocaleString()} 亡:${(b.dead||0).toLocaleString()}</span>`),
  ].join('　');

  const resultColor = winnerLabel==='自軍' ? 'var(--blue)' : winnerLabel==='敵軍' ? 'var(--red)' : '#888';
  const resultText = winnerLabel==='自軍' ? '🎌 自軍の勝利' : winnerLabel==='敵軍' ? '💀 敵軍の勝利' : `⏱ 時間切れ（${st.turn}T）引き分け`;

  let html = `<div class="pickup-meta">全${st.turn}ターン ／ 最終兵力: ${hp0}</div>`;
  html += `<div class="pickup-log">`;

  st.log.forEach(e => {
    const cls = e.cls === 'log-turn' ? 'pl-turn' :
                e.cls === 'log-ally' ? 'pl-ally' :
                e.cls === 'log-enemy' ? 'pl-enemy' :
                e.cls === 'log-heal' ? 'pl-heal' :
                e.cls === 'log-buff' ? 'pl-buff' :
                e.cls === 'log-ctrl' ? 'pl-ctrl' :
                e.cls === 'log-result' ? 'pl-result' : 'pl-sub';
    html += `<div class="${cls}">${e.msg}</div>`;
  });
  html += `</div>`;
  html += `<div style="margin-top:10px;padding:8px;background:rgba(0,0,0,.06);border-radius:6px;text-align:center;font-weight:700;color:${resultColor}">${resultText}</div>`;
  area.innerHTML = html;
}

function renderResult(wins, total) {
  const allyP = Math.round(wins.ally/total*100);
  const enemyP = Math.round(wins.enemy/total*100);
  const drawP = 100-allyP-enemyP;
  const rs = document.getElementById('result-summary');
  rs.style.display = 'block';
  document.getElementById('verdict-bar').style.setProperty('--ally-pct', allyP+'%');
  document.getElementById('ally-pct-label').textContent = `🔵 自軍 ${allyP}%`;
  document.getElementById('enemy-pct-label').textContent = `🔴 敵軍 ${enemyP}%`;
  document.getElementById('result-grid').innerHTML = `
    <div class="result-card"><div class="val ally-val">${allyP}%</div><div class="lbl">自軍勝率</div></div>
    <div class="result-card"><div class="val enemy-val">${enemyP}%</div><div class="lbl">敵軍勝率</div></div>
    <div class="result-card"><div class="val">${drawP}%</div><div class="lbl">引き分け</div></div>
    <div class="result-card"><div class="val">${total.toLocaleString()}</div><div class="lbl">試行回数</div></div>`;
}

// ─ 状態
let stepState = null;
let stepAdv = 1.0, stepMax = 8;

// 特性サマリーHTML（ログ用）
function buildTraitSummaryHtml(build) {
  let html = '<div class="log-entry log-info" style="font-size:11px;line-height:1.8;">';
  html += '<b>【特性サマリー】</b><br>';
  ['ally','enemy'].forEach(side => {
    const label = side === 'ally' ? '自軍' : '敵軍';
    html += `<span style="color:${side==='ally'?'#1a3a5c':'#8b1a1a'};font-weight:700;">${label}</span>: `;
    const parts = build[side].map(u => {
      if (!u.activeTraits?.length) return `${u.name}(特性なし)`;
      const traitStr = u.activeTraits.map(tn => {
        const fx = TRAIT_EFFECTS[tn];
        return fx ? `<b>${tn}</b>` : tn;
      }).join('・');
      return `${u.name}[${u.convex}凸]:${traitStr}`;
    });
    html += parts.join(' / ') + '<br>';
  });
  html += '</div>';
  return html;
}

function startSim() {
  const simCount = parseInt(document.getElementById('simCount').value);
  const maxTurns = parseInt(document.getElementById('maxTurns').value);
  const advMult = parseFloat(document.getElementById('allyAdv').value);
  document.getElementById('result-summary').style.display = 'none';

  const build = readBuild();

  if (simCount === 1) {
    stepState = initState(build);
    stepAdv = advMult; stepMax = maxTurns;
    updateHPBars(stepState);
    const traitSummary = buildTraitSummaryHtml(build);
    document.getElementById('log-area').innerHTML =
      traitSummary + '<div class="log-entry log-info">▸ 「次のターン」を押して進めてください</div>';
    document.getElementById('btn-step').style.display = 'inline-block';
    document.getElementById('turn-label').textContent = 'T0 開始';
  } else {
    document.getElementById('btn-step').style.display = 'none';
    document.getElementById('log-area').innerHTML = '<div class="log-entry log-info">▸ 計算中...</div>';
    setTimeout(() => {
      const wins = {ally:0,enemy:0};
      const totalHp = {ally:0, enemy:0};
      for (let s=0;s<simCount;s++){
        const st = initState(build);
        let winner = null;
        for (let t=0;t<maxTurns&&!winner;t++) winner = processTurn(st,advMult);
        if (winner==='自軍') wins.ally++;
        else if (winner==='敵軍') wins.enemy++;
        totalHp.ally  += st.ally.reduce((sum,u)=>sum+Math.max(0,u.hp),0);
        totalHp.enemy += st.enemy.reduce((sum,u)=>sum+Math.max(0,u.hp),0);
      }
      const allyP = Math.round(wins.ally/simCount*100);
      const enemyP = Math.round(wins.enemy/simCount*100);
      const avgAllyHp  = Math.round(totalHp.ally  / simCount);
      const avgEnemyHp = Math.round(totalHp.enemy / simCount);
      document.getElementById('log-area').innerHTML = `
        <div class="log-entry log-info">▸ ${simCount}回シミュ完了</div>
        <div class="log-entry log-ally">  自軍勝利: ${wins.ally}回 (${allyP}%)</div>
        <div class="log-entry log-enemy">  敵軍勝利: ${wins.enemy}回 (${enemyP}%)</div>
        <div class="log-entry log-info">  引き分け: ${simCount-wins.ally-wins.enemy}回</div>
        <div class="log-entry log-ally">  自軍 最終兵力平均: ${avgAllyHp.toLocaleString()}</div>
        <div class="log-entry log-enemy">  敵軍 最終兵力平均: ${avgEnemyHp.toLocaleString()}`;
      document.getElementById('turn-label').textContent = `${simCount}回完了`;
      renderResult(wins, simCount);
    }, 50);
  }
}

function stepTurn() {
  if (!stepState) return;
  const winner = processTurn(stepState, stepAdv);
  updateHPBars(stepState);
  renderLog(stepState);
  document.getElementById('turn-label').textContent = `第${stepState.turn}T`;
  if (winner || stepState.turn >= stepMax) {
    document.getElementById('btn-step').style.display = 'none';
    if (!winner) addLog(stepState,'log-warn',`最大ターン数到達（引き分け）`);
    const fAlly  = stepState.ally.reduce((s,u)=>s+Math.max(0,u.hp),0);
    const fEnemy = stepState.enemy.reduce((s,u)=>s+Math.max(0,u.hp),0);
    addLog(stepState,'log-info',`最終兵力 — 自軍:${fAlly.toLocaleString()} / 敵軍:${fEnemy.toLocaleString()}`);
    renderLog(stepState);
  }
}

// ─ ピックアップ（1戦のみ実行してログ表示）
function pickOneBattle() {
  const maxTurns = parseInt(document.getElementById('maxTurns').value);
  const advMult = parseFloat(document.getElementById('allyAdv').value);
  const build = readBuild();
  const st = initState(build);
  let winner = null;
  for (let t=0;t<maxTurns&&!winner;t++) winner = processTurn(st,advMult);
  const label = winner || '引き分け';
  renderPickup(st, label);
}

function resetSim() {
  stepState = null;
  document.getElementById('btn-step').style.display = 'none';
  document.getElementById('turn-label').textContent = '開戦前';
  document.getElementById('result-summary').style.display = 'none';
  document.getElementById('log-area').innerHTML = '<div class="log-entry log-info">▸ リセットしました</div>';
  document.getElementById('pickup-area').innerHTML = '<div class="no-battle">「戦闘ログ1件表示」を押すと<br>詳細な1戦のログが表示されます</div>';
  ['ally','enemy'].forEach(side=>[0,1,2].forEach(i=>{
    const el = document.getElementById(`${side}${i}`); if(!el) return;
    el.querySelector('.hp-bar-fill').style.width='100%';
    const injBar = el.querySelector('.hp-bar-injured');
    if (injBar) { injBar.style.left='100%'; injBar.style.width='0%'; }
    el.querySelector('.hp-text').textContent=`健:10,000 傷:0 亡:0`;
  }));
}
