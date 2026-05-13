// ═══════════════════════════════════════
// 編成プリセット管理
// ═══════════════════════════════════════
const PRESET_KEY = 'shinsen_presets';
const LAST_KEY   = 'shinsen_last';

// 現在の編成を読み取る（保存用）
function readFormation() {
  const f = { ally: [], enemy: [] };
  ['ally','enemy'].forEach(side => {
    [0,1,2].forEach(idx => {
      const el = document.getElementById(`${side}${idx}`);
      const pfx = `${side}${idx}`;
      f[side].push({
        busho:  el.querySelector('.busho-sel').value,
        slot1:  el.querySelector('.slot1-sel').value,
        slot2:  el.querySelector('.slot2-sel').value,
        convex: parseInt(el.querySelector('.convex-sel')?.value || '0'),
        ptChi:  parseInt(document.getElementById(`${pfx}-pt-chi`)?.value) || 0,
        ptBu:   parseInt(document.getElementById(`${pfx}-pt-bu`)?.value)  || 0,
        ptTo:   parseInt(document.getElementById(`${pfx}-pt-to`)?.value)  || 0,
        ptSpd:  parseInt(document.getElementById(`${pfx}-pt-spd`)?.value) || 0,
        eqChi:  parseInt(document.getElementById(`${pfx}-eq-chi`)?.value) || 0,
        eqBu:   parseInt(document.getElementById(`${pfx}-eq-bu`)?.value)  || 0,
        eqTo:   parseInt(document.getElementById(`${pfx}-eq-to`)?.value)  || 0,
        eqSpd:  parseInt(document.getElementById(`${pfx}-eq-spd`)?.value) || 0,
      });
    });
  });
  f.config = {
    allyTroopLv:       parseInt(document.getElementById('allyTroopLv')?.value)  || 0,
    enemyTroopLv:      parseInt(document.getElementById('enemyTroopLv')?.value) || 0,
    allyFactionMatch:  document.getElementById('allyFactionMatch')?.checked  || false,
    allyKamonMatch:    document.getElementById('allyKamonMatch')?.checked    || false,
    enemyFactionMatch: document.getElementById('enemyFactionMatch')?.checked || false,
    enemyKamonMatch:   document.getElementById('enemyKamonMatch')?.checked   || false,
  };
  return f;
}

// 編成をUIに反映する（side = 'ally' | 'enemy' | 'both'）
function applyFormation(formation, side = 'both') {
  const sides = side === 'both' ? ['ally','enemy'] : [side];
  sides.forEach(s => {
    (formation[s] || []).forEach((entry, idx) => {
      const el = document.getElementById(`${s}${idx}`);
      if (!el) return;
      const pfx = `${s}${idx}`;
      const buSel = el.querySelector('.busho-sel');
      if (buSel && BUSHO_DEF[entry.busho]) {
        setComboValue(buSel, entry.busho);
        onBushoChange(buSel);
      }
      const s1 = el.querySelector('.slot1-sel');
      const s2 = el.querySelector('.slot2-sel');
      if (s1 && SENPO_DB[entry.slot1]) setComboValue(s1, entry.slot1);
      if (s2 && SENPO_DB[entry.slot2]) setComboValue(s2, entry.slot2);
      const convexSel = el.querySelector('.convex-sel');
      if (convexSel && entry.convex != null) {
        convexSel.value = String(entry.convex);
        onConvexChange(convexSel);
      }
      const setAttr = (key, val) => {
        const inp = document.getElementById(`${pfx}-${key}`);
        if (inp) inp.value = val != null ? val : 0;
      };
      setAttr('pt-chi', entry.ptChi);
      setAttr('pt-bu',  entry.ptBu);
      setAttr('pt-to',  entry.ptTo);
      setAttr('pt-spd', entry.ptSpd);
      setAttr('eq-chi', entry.eqChi);
      setAttr('eq-bu',  entry.eqBu);
      setAttr('eq-to',  entry.eqTo);
      setAttr('eq-spd', entry.eqSpd);
      onAttrPtChange(s, idx);
    });
  });
  if (side === 'both' && formation.config) {
    const cfg = formation.config;
    const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
    const setNum = (id, val) => { const el = document.getElementById(id); if (el) el.value = val != null ? val : 0; };
    setNum('allyTroopLv',  cfg.allyTroopLv);
    setNum('enemyTroopLv', cfg.enemyTroopLv);
    setChk('allyFactionMatch',  cfg.allyFactionMatch);
    setChk('allyKamonMatch',    cfg.allyKamonMatch);
    setChk('enemyFactionMatch', cfg.enemyFactionMatch);
    setChk('enemyKamonMatch',   cfg.enemyKamonMatch);
  }
}

// localStorage からプリセット一覧を取得
function getPresets() {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY)) || []; }
  catch { return []; }
}

// プリセットを保存
function savePreset() {
  const nameEl = document.getElementById('preset-name');
  const name = nameEl.value.trim();
  if (!name) { nameEl.focus(); return; }
  const presets = getPresets();
  presets.push({
    name,
    formation: readFormation(),
    date: new Date().toLocaleDateString('ja-JP'),
  });
  localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
  nameEl.value = '';
  renderPresets();
  autoSave();
}

// プリセットを削除
function deletePreset(idx) {
  const presets = getPresets();
  presets.splice(idx, 1);
  localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
  renderPresets();
}

// プリセット一覧をUIに描画
function renderPresets() {
  const list = document.getElementById('preset-list');
  const presets = getPresets();
  if (!presets.length) {
    list.innerHTML = '<span class="preset-empty">保存済み編成なし</span>';
    return;
  }
  list.innerHTML = presets.map((p, i) => {
    const fmt = e => `${e.busho}${e.convex!=null?`(${e.convex}凸)`:''}`;
    const allyNames  = p.formation.ally.map(fmt).join('・');
    const enemyNames = p.formation.enemy.map(fmt).join('・');
    return `<div class="preset-chip" title="自: ${allyNames}&#10;敵: ${enemyNames}&#10;保存日: ${p.date||''}">
      <span class="pchip-name" onclick="applyFormation(getPresets()[${i}].formation,'both')">${p.name}</span>
      <button class="pchip-side" onclick="applyFormation(getPresets()[${i}].formation,'ally')" title="自軍に適用">自</button>
      <button class="pchip-side" onclick="applyFormation(getPresets()[${i}].formation,'enemy')" title="敵軍に適用">敵</button>
      <button class="pchip-del" onclick="deletePreset(${i})" title="削除">✕</button>
    </div>`;
  }).join('');
}

// 現在の編成を「最後の状態」として自動保存
function autoSave() {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(readFormation())); } catch {}
}

// 起動時に最後の状態を復元（プリセットリストも描画）
(function init() {
  try {
    const last = JSON.parse(localStorage.getItem(LAST_KEY));
    if (last) applyFormation(last, 'both');
  } catch {}
  renderPresets();
})();
