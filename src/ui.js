// ═══════════════════════════════════════
// UI 構築
// ═══════════════════════════════════════
function buildUI() {
  const grid = document.getElementById('formation-grid');
  grid.innerHTML = '';
  // 武将選択肢（BUSHO_DEFから動的生成）
  const bushoOptHtml = Object.keys(BUSHO_DEF).map(n=>
    `<option value="${n}">${n}${BUSHO_DEF[n].approx?'※':''}</option>`).join('');
  // 伝授戦法選択肢
  const senpoOptHtml = Object.keys(SENPO_DB).map(k=>
    `<option value="${k}">${k}（${SENPO_DB[k].kind}）</option>`).join('');

  ['ally','enemy'].forEach(side => {
    const panel = document.createElement('div');
    panel.className = `team-panel ${side}`;
    panel.id = `${side}-panel`;
    const lbl = side === 'ally' ? '🔵 自軍' : '🔴 敵軍';
    panel.innerHTML = `<div class="team-label ${side}">${lbl}</div>`;
    TEAM_DEF[side].forEach((name, idx) => {
      const def = BUSHO_DEF[name];
      const row = document.createElement('div');
      row.className = 'busho-row' + (idx === 0 ? ' is-taisho' : '');
      row.id = `${side}${idx}`;
      const s1 = def.slots[0] || Object.keys(SENPO_DB)[0];
      const s2 = def.slots[1] || Object.keys(SENPO_DB)[1];
      // 選択肢のselectedを正しく設定（文字列置換で対応）
      const s1Html = senpoOptHtml.replace(`value="${s1}"`, `value="${s1}" selected`);
      const s2Html = senpoOptHtml.replace(`value="${s2}"`, `value="${s2}" selected`);
      const initTraitHtml = buildTraitHtml(name, 0);
      row.innerHTML = `
        <div class="busho-name-row" style="margin-bottom:4px;">
          ${idx === 0 ? '<span class="taisho-badge">大将</span>' : ''}
          <div class="busho-combo">
            <input type="text" class="combo-search" placeholder="武将名で検索…" autocomplete="off"
              oninput="filterCombo(this)">
            <select class="busho-sel" data-side="${side}" data-idx="${idx}" onchange="onBushoChange(this)">
              ${bushoOptHtml.replace(`value="${name}"`,`value="${name}" selected`)}
            </select>
          </div>
          <select class="convex-sel" title="凸数" onchange="onConvexChange(this)" data-side="${side}" data-idx="${idx}">
            <option value="0">0凸</option>
            <option value="1">1凸</option>
            <option value="2">2凸</option>
            <option value="3">3凸</option>
            <option value="4">4凸</option>
            <option value="5">5凸</option>
          </select>
          <span class="approx-badge" id="${side}${idx}-approx" style="display:${def.approx?'inline':'none'}">※暫定値</span>
        </div>
        <div class="stat-grid">
          <div class="stat-item"><label>知略</label><div class="stat-val" id="${side}${idx}-chi">${def.chi}</div></div>
          <div class="stat-item"><label>武勇</label><div class="stat-val" id="${side}${idx}-bu">${def.bu}</div></div>
          <div class="stat-item"><label>統率</label><div class="stat-val" id="${side}${idx}-to">${def.to}</div></div>
          <div class="stat-item"><label>速度</label><div class="stat-val" id="${side}${idx}-spd">${def.spd||'?'}</div></div>
          <div class="stat-item"><label>兵力</label><div class="stat-val">10,000</div></div>
        </div>
        <div class="attrpt-row" id="${side}${idx}-attrrow">
          <span class="attrpt-title">属性P</span>
          <span class="attrpt-left" id="${side}${idx}-pt-left" style="color:#1a5c2a;">残50pt</span>
          <label>知+</label><input class="attrpt-input" id="${side}${idx}-pt-chi" type="number" value="0" min="0" oninput="onAttrPtChange('${side}','${idx}')">
          <label>武+</label><input class="attrpt-input" id="${side}${idx}-pt-bu"  type="number" value="0" min="0" oninput="onAttrPtChange('${side}','${idx}')">
          <label>統+</label><input class="attrpt-input" id="${side}${idx}-pt-to"  type="number" value="0" min="0" oninput="onAttrPtChange('${side}','${idx}')">
          <label>速+</label><input class="attrpt-input" id="${side}${idx}-pt-spd" type="number" value="0" min="0" oninput="onAttrPtChange('${side}','${idx}')">
        </div>
        <div class="attrpt-row" id="${side}${idx}-equiprow">
          <span class="attrpt-title" style="color:#5c1a5c;">装備</span>
          <label>知+</label><input class="attrpt-input" id="${side}${idx}-eq-chi" type="number" value="0" min="0">
          <label>武+</label><input class="attrpt-input" id="${side}${idx}-eq-bu"  type="number" value="0" min="0">
          <label>統+</label><input class="attrpt-input" id="${side}${idx}-eq-to"  type="number" value="0" min="0">
          <label>速+</label><input class="attrpt-input" id="${side}${idx}-eq-spd" type="number" value="0" min="0">
        </div>
        <div class="trait-display" id="${side}${idx}-trait">${initTraitHtml}</div>
        <div class="senpo-section">
          <div class="senpo-label"><span>固有</span> <span id="${side}${idx}-fixed-name">${def.fixed.name}（${def.fixed.kind}）</span></div>
          <div class="senpo-fixed" id="${side}${idx}-fixed-desc" title="${def.fixed.desc}">
            ${def.fixed.desc}
            ${idx === 0 && def.fixed.desc.includes('大将技') ? '<span class="taisho-skill-note">★大将技有効</span>' : ''}
          </div>
          <div class="senpo-select-row">
            <label>伝授①</label>
            <div class="slot-combo">
              <input type="text" class="combo-search" placeholder="戦法検索…" autocomplete="off"
                oninput="filterCombo(this)">
              <select class="slot1-sel" id="${side}${idx}-slot1" data-side="${side}" data-idx="${idx}">
                ${s1Html}
              </select>
            </div>
          </div>
          <div class="senpo-select-row">
            <label>伝授②</label>
            <div class="slot-combo">
              <input type="text" class="combo-search" placeholder="戦法検索…" autocomplete="off"
                oninput="filterCombo(this)">
              <select class="slot2-sel" id="${side}${idx}-slot2" data-side="${side}" data-idx="${idx}">
                ${s2Html}
              </select>
            </div>
          </div>
        </div>
        <div class="hp-bar-wrap">
          <div class="hp-bar-bg"><div class="hp-bar-fill" style="width:100%"></div><div class="hp-bar-injured" style="left:100%;width:0%"></div></div>
          <div class="hp-text">健:10,000 傷:0 亡:0</div>
        </div>`;
      panel.appendChild(row);
    });
    grid.appendChild(panel);
  });
}

buildUI();

// ─ 特性表示HTML生成
function buildTraitHtml(name, convex) {
  const traits = BUSHO_TRAITS[name] || [];
  if (!traits.length) return '<span style="color:#aaa">特性データなし</span>';
  return traits.map(([cv, tname]) => {
    const active = cv <= convex;
    const fx = TRAIT_EFFECTS[tname];
    const hasFx = !!fx;
    const color = active ? (hasFx ? '#5c1a00' : '#444') : '#aaa';
    const bg = active && hasFx ? 'rgba(201,166,74,.15)' : 'transparent';
    const mark = active ? (hasFx ? '⚡' : '✓') : '○';
    return `<span style="color:${color};background:${bg};padding:1px 3px;border-radius:2px;margin-right:3px;">`
         + `${mark}${cv}凸:${tname}</span>`;
  }).join('');
}

// ─ 属性ポイント変更時：残ポイント表示更新
function onAttrPtChange(side, idx) {
  const pfx = `${side}${idx}`;
  const el = document.getElementById(pfx);
  const convex = parseInt(el.querySelector('.convex-sel')?.value || '0');
  const maxPt = 50 + convex * 10;
  const chi = parseInt(document.getElementById(`${pfx}-pt-chi`)?.value) || 0;
  const bu  = parseInt(document.getElementById(`${pfx}-pt-bu`)?.value)  || 0;
  const to  = parseInt(document.getElementById(`${pfx}-pt-to`)?.value)  || 0;
  const spd = parseInt(document.getElementById(`${pfx}-pt-spd`)?.value) || 0;
  const used = chi + bu + to + spd;
  const left = maxPt - used;
  const leftEl = document.getElementById(`${pfx}-pt-left`);
  if (leftEl) {
    leftEl.textContent = left >= 0 ? `残${left}pt` : `超過${-left}pt`;
    leftEl.style.color = left < 0 ? '#c0392b' : (left === 0 ? '#1a5c2a' : '#6b4c00');
  }
}

// ─ 凸数変更時の処理
function onConvexChange(sel) {
  const side = sel.dataset.side;
  const idx  = sel.dataset.idx;
  const pfx  = `${side}${idx}`;
  const name = document.getElementById(pfx).querySelector('.busho-sel').value;
  const convex = parseInt(sel.value);
  const traitEl = document.getElementById(`${pfx}-trait`);
  if (traitEl) traitEl.innerHTML = buildTraitHtml(name, convex);
  // 属性ポイント上限を更新
  onAttrPtChange(side, idx);
}

// ─ コンボ検索フィルター（武将・戦法共用）
function filterCombo(searchInput) {
  const q = searchInput.value.toLowerCase();
  const sel = searchInput.nextElementSibling;
  if (!sel || sel.tagName !== 'SELECT') return;
  if (!sel._allOpts) {
    sel._allOpts = [...sel.options].map(o => ({value: o.value, text: o.text}));
  }
  const current = sel.value;
  sel.innerHTML = '';
  sel._allOpts
    .filter(o => !q || o.value === current || o.value.toLowerCase().includes(q) || o.text.toLowerCase().includes(q))
    .forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.text;
      if (o.value === current) opt.selected = true;
      sel.appendChild(opt);
    });
}

// ─ フィルター済みのコンボに安全に値をセット（キャッシュから全オプションを復元）
function setComboValue(sel, value) {
  if (sel._allOpts) {
    sel.innerHTML = '';
    sel._allOpts.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.text;
      sel.appendChild(opt);
    });
    const search = sel.previousElementSibling;
    if (search && search.classList.contains('combo-search')) search.value = '';
  }
  sel.value = value;
}

function onBushoChange(sel) {
  const name = sel.value;
  const def = BUSHO_DEF[name];
  if (!def) return;
  const side = sel.dataset.side;
  const idx  = sel.dataset.idx;
  const pfx  = `${side}${idx}`;
  document.getElementById(`${pfx}-chi`).textContent = def.chi;
  document.getElementById(`${pfx}-bu`).textContent  = def.bu;
  document.getElementById(`${pfx}-to`).textContent  = def.to;
  document.getElementById(`${pfx}-spd`).textContent = def.spd || '?';
  // 属性ポイント・装備ボーナスをリセット
  ['chi','bu','to','spd'].forEach(k => {
    const inp = document.getElementById(`${pfx}-pt-${k}`);
    if (inp) inp.value = '0';
    const eqInp = document.getElementById(`${pfx}-eq-${k}`);
    if (eqInp) eqInp.value = '0';
  });
  document.getElementById(`${pfx}-fixed-name`).textContent = `${def.fixed.name}（${def.fixed.kind}）`;
  const descEl = document.getElementById(`${pfx}-fixed-desc`);
  const isTaishoSlot = parseInt(idx) === 0;
  const hasTaishoSkill = def.fixed.desc.includes('大将技');
  descEl.innerHTML = def.fixed.desc
    + (isTaishoSlot && hasTaishoSkill ? ' <span class="taisho-skill-note">★大将技有効</span>' : '');
  descEl.title = def.fixed.desc;
  // 暫定値バッジ更新
  const badge = document.getElementById(`${pfx}-approx`);
  if (badge) badge.style.display = def.approx ? 'inline' : 'none';
  // デフォルトスロット戦法に切り替え
  const s1sel = document.getElementById(`${pfx}-slot1`);
  const s2sel = document.getElementById(`${pfx}-slot2`);
  if (s1sel && def.slots[0] && SENPO_DB[def.slots[0]]) setComboValue(s1sel, def.slots[0]);
  if (s2sel && def.slots[1] && SENPO_DB[def.slots[1]]) setComboValue(s2sel, def.slots[1]);
  // 特性表示を更新（凸数0でリセット）
  const cvSel = document.getElementById(pfx)?.querySelector('.convex-sel');
  if (cvSel) cvSel.value = '0';
  const traitEl = document.getElementById(`${pfx}-trait`);
  if (traitEl) traitEl.innerHTML = buildTraitHtml(name, 0);
}

// ═══════════════════════════════════════
// ステータス・戦法の読み取り
// ═══════════════════════════════════════
function readBuild() {
  const build = { ally: [], enemy: [] };
  // 兵種レベル（Lv1基準、1レベルごとに属性値+2%）
  const troopLvMult = {
    ally:  1 + (Math.max(0, parseInt(document.getElementById('allyTroopLv')?.value)  || 0)) * 0.02,
    enemy: 1 + (Math.max(0, parseInt(document.getElementById('enemyTroopLv')?.value) || 0)) * 0.02,
  };
  // 勢力・家紋ボーナス（チーム全体の属性に適用）
  const factionBonus = {};
  ['ally','enemy'].forEach(side => {
    const fm = document.getElementById(`${side}FactionMatch`)?.checked ? 0.07 : 0;
    const km = document.getElementById(`${side}KamonMatch`)?.checked ? 0.03 : 0;
    factionBonus[side] = 1 + fm + km;
  });
  ['ally','enemy'].forEach(side => {
    // 第1パス：各武将のデータと特性効果を収集
    const unitData = [];
    [0,1,2].forEach(idx => {
      const el = document.getElementById(`${side}${idx}`);
      const name = el.querySelector('.busho-sel').value;
      const s1 = el.querySelector('.slot1-sel').value;
      const s2 = el.querySelector('.slot2-sel').value;
      const convex = parseInt(el.querySelector('.convex-sel')?.value || '0');
      const ptChi = parseInt(document.getElementById(`${side}${idx}-pt-chi`)?.value) || 0;
      const ptBu  = parseInt(document.getElementById(`${side}${idx}-pt-bu`)?.value)  || 0;
      const ptTo  = parseInt(document.getElementById(`${side}${idx}-pt-to`)?.value)  || 0;
      const ptSpd = parseInt(document.getElementById(`${side}${idx}-pt-spd`)?.value) || 0;
      const eqChi = parseInt(document.getElementById(`${side}${idx}-eq-chi`)?.value) || 0;
      const eqBu  = parseInt(document.getElementById(`${side}${idx}-eq-bu`)?.value)  || 0;
      const eqTo  = parseInt(document.getElementById(`${side}${idx}-eq-to`)?.value)  || 0;
      const eqSpd = parseInt(document.getElementById(`${side}${idx}-eq-spd`)?.value) || 0;
      const def = BUSHO_DEF[name];
      const traits = BUSHO_TRAITS[name] || [];
      const activeTraits = traits.filter(([cv]) => cv <= convex).map(([,tn]) => tn);

      // 個人特性効果を集計
      let buMult=1, chiMult=1, toMult=1;
      let buAtkMult=1, chiAtkMult=1, atkMult=1;
      let buDefReduce=0, chiDefReduce=0, defReduce=0;
      let critAdd=0, critBonusAdd=0, kiryakuAdd=0, kiryakuBonusAdd=0;
      // 全体特性効果（このユニットが付与するチームバフ）
      let tAtk=0, tChiAtk=0, tBuAtk=0, tBuDef=0, tChiDef=0, tDef=0, tTo=0;

      activeTraits.forEach(tn => {
        const fx = TRAIT_EFFECTS[tn]; if (!fx) return;
        if (fx.buMult)          buMult         *= (1 + fx.buMult);
        if (fx.chiMult)         chiMult        *= (1 + fx.chiMult);
        if (fx.toMult)          toMult         *= (1 + fx.toMult);
        if (fx.buAtkMult)       buAtkMult      *= (1 + fx.buAtkMult);
        if (fx.chiAtkMult)      chiAtkMult     *= (1 + fx.chiAtkMult);
        if (fx.atkMult)         atkMult        *= (1 + fx.atkMult);
        if (fx.buDefReduce)     buDefReduce    += fx.buDefReduce;
        if (fx.chiDefReduce)    chiDefReduce   += fx.chiDefReduce;
        if (fx.defReduce)       defReduce      += fx.defReduce;
        if (fx.critAdd)         critAdd        += fx.critAdd;
        if (fx.critBonusAdd)    critBonusAdd   += fx.critBonusAdd;
        if (fx.kiryakuAdd)      kiryakuAdd     += fx.kiryakuAdd;
        if (fx.kiryakuBonusAdd) kiryakuBonusAdd+= fx.kiryakuBonusAdd;
        if (fx.teamAtkMult)     tAtk           += fx.teamAtkMult;
        if (fx.teamChiAtkMult)  tChiAtk        += fx.teamChiAtkMult;
        if (fx.teamBuAtkMult)   tBuAtk         += fx.teamBuAtkMult;
        if (fx.teamBuDefReduce) tBuDef         += fx.teamBuDefReduce;
        if (fx.teamChiDefReduce)tChiDef        += fx.teamChiDefReduce;
        if (fx.teamDefReduce)   tDef           += fx.teamDefReduce;
        if (fx.teamToMult)      tTo            += fx.teamToMult;
      });

      unitData.push({ name, def, s1, s2, convex, activeTraits,
        buMult, chiMult, toMult, buAtkMult, chiAtkMult, atkMult,
        buDefReduce, chiDefReduce, defReduce,
        critAdd, critBonusAdd, kiryakuAdd, kiryakuBonusAdd,
        tAtk, tChiAtk, tBuAtk, tBuDef, tChiDef, tDef, tTo,
        ptChi, ptBu, ptTo, ptSpd,
        eqChi, eqBu, eqTo, eqSpd });
    });

    // 全体バフを集計
    const sumAtk   = unitData.reduce((a,u)=>a+u.tAtk, 0);
    const sumChiAtk= unitData.reduce((a,u)=>a+u.tChiAtk, 0);
    const sumBuAtk = unitData.reduce((a,u)=>a+u.tBuAtk, 0);
    const sumBuDef = unitData.reduce((a,u)=>a+u.tBuDef, 0);
    const sumChiDef= unitData.reduce((a,u)=>a+u.tChiDef, 0);
    const sumDef   = unitData.reduce((a,u)=>a+u.tDef, 0);
    const sumTo    = unitData.reduce((a,u)=>a+u.tTo, 0);

    // 第2パス：全体バフを合算してユニットを構築
    unitData.forEach(u => {
      const { def, s1, s2, name } = u;
      const fb = factionBonus[side];
      const tlm = troopLvMult[side];
      build[side].push({
        name,
        chi: Math.round((def.chi + u.ptChi + u.eqChi) * u.chiMult * fb * tlm),
        bu:  Math.round((def.bu  + u.ptBu  + u.eqBu)  * u.buMult  * fb * tlm),
        to:  Math.round((def.to  + u.ptTo  + u.eqTo)  * u.toMult  * (1 + sumTo) * fb * tlm),
        spd: Math.round(((def.spd || 0) + u.ptSpd + u.eqSpd) * tlm),
        hp: 10000, maxHp: 10000,
        role: def.role, fixed: def.fixed,
        slots: [s1, s2].map(s => SENPO_DB[s]).filter(Boolean),
        defeated: false,
        convex: u.convex, activeTraits: u.activeTraits,
        // 戦闘計算用特性値（個人×チーム合算）
        traitAtkMult:    u.atkMult    * (1 + sumAtk),
        traitChiAtkMult: u.chiAtkMult * (1 + sumChiAtk),
        traitBuAtkMult:  u.buAtkMult  * (1 + sumBuAtk),
        traitDefReduce:  u.defReduce  + sumDef,
        traitBuDefReduce:u.buDefReduce + sumBuDef,
        traitChiDefReduce:u.chiDefReduce + sumChiDef,
        traitCritAdd:     u.critAdd,
        traitCritBonusAdd:u.critBonusAdd,
        traitKiryakuAdd:  u.kiryakuAdd,
        traitKiryakuBonusAdd: u.kiryakuBonusAdd,
      });
    });
  });
  return build;
}
