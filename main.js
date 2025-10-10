/* ===================== 基础引用与状态 ===================== */
const currentDateEl = document.getElementById('current-date');
const datePicker     = document.getElementById('date-picker');
const calendarPopup  = document.getElementById('calendar-popup');

let latestDate = null;          // 最新可用日期（UTC 零点）
let currentLayer = null;        // 当前地图图层
let availableDates = [];        // Date[]（保留用）
let availableDateStrs = [];     // "YYYY-MM-DD" 字符串数组（用于相邻跳转）

/* ===================== 地图初始化 ===================== */
const map = L.map('map', { zoomControl: false }).setView([48.6, 37.9], 10);

L.control.scale({
  position: 'bottomleft',
  imperial: true,
  metric: true,
  maxWidth: 100,
  updateWhenIdle: false
}).addTo(map);

// 卫星底图
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri'
}).addTo(map);

// 地名注记
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Labels © Esri',
  pane: 'overlayPane'
}).addTo(map);

/* ===================== 日期工具（统一使用 UTC） ===================== */
function formatDate(date) {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${yyyy}-${mm}-${dd}`; // YYYY-MM-DD
}
function parseDate(str) {
  const [yyyy, mm, dd] = str.split('-');
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
}
function toIsoDate(date){
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
}

/* ===================== 轻提示 ===================== */
function showMessage(msg) {
  alert(msg);
}

/* ===================== 加载某天前线图层 ===================== */
function loadDataForDate(dateStr) {
  const url = `data/frontline-${dateStr}.json`;

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      if (currentLayer) map.removeLayer(currentLayer);

      currentLayer = L.geoJSON(data, {
        style: feature => {
          const name = feature.properties.Name?.toLowerCase();
          if (name === 'dpr')       return { color: 'purple',   fillOpacity: 0.25, weight: 2   };
          if (name === 'red')       return { color: '#E60000',  fillOpacity: 0.2,  weight: 1.5 };
          if (name === 'lib')       return { color: '#00A2E8',  fillOpacity: 0.2,  weight: 1.5 };
          if (name === 'contested') return { color: 'white',    fillOpacity: 0.25, weight: 0   };
          return { color: 'black',  fillOpacity: 0.3 };
        }
      }).addTo(map);
    })
    .catch(() => {
      showMessage('当日暂未更新');
      if (currentLayer) {
        map.removeLayer(currentLayer);
        currentLayer = null;
      }
    });
}

/* ===================== 加载可用日期（latest + 列表） ===================== */
function loadAvailableDates() {
  // latest.json
  fetch("data/latest.json")
    .then(res => res.json())
    .then(obj => {
      const [yyyy, mm, dd] = obj.date.split('-');
      latestDate = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
      latestDate.setUTCHours(0, 0, 0, 0);
      availableDates.push(latestDate);
      if (datePicker) datePicker.max = formatDate(latestDate);
      updateDate(latestDate);
    })
    .catch(() => {
      // 退回今天（UTC 当地零点），只用于首次初始化展示
      latestDate = new Date();
      updateDate(latestDate);
    });

  // available-dates.json
  fetch("data/available-dates.json")
    .then(res => res.json())
    .then(dates => {
      // 文件里的日期 → UTC Date → YYYY-MM-DD
      const fromFile = dates.map(s => {
        const [y, m, d] = s.split('-');
        return formatDate(new Date(Date.UTC(+y, +m - 1, +d)));
      });
      const addLatest = latestDate ? [formatDate(latestDate)] : [];
      availableDateStrs = Array.from(new Set([...fromFile, ...addLatest])).sort();
      availableDates = availableDateStrs.map(s => parseDate(s));
    })
    .catch(() => {
      // 文件不可用：退回 updates + latestDate 兜底
      ensureAvailableDateStrsReady();
    });
}

/* ===================== 更新日期（驱动 UI + 地图） ===================== */
function updateDate(date) {
  const formatted = formatDate(date);
  if (currentDateEl) currentDateEl.textContent = formatted;
  if (datePicker) datePicker.value = formatted;
  loadDataForDate(formatted);
  setSelectedUpdateItem(formatted);
}

/* ===================== 初始化 ===================== */
loadAvailableDates();

/* ===================== 相邻“有更新”的日期跳转 ===================== */
function ensureAvailableDateStrsReady(){
  if (availableDateStrs && availableDateStrs.length) return;
  const fromUpdates = (Array.isArray(updates) ? updates.map(u => u.date) : []);
  const addLatest   = latestDate ? [formatDate(latestDate)] : [];
  availableDateStrs = Array.from(new Set([...fromUpdates, ...addLatest])).sort();
}
function findAdjacentDate(currentStr, direction /* -1=前一天, +1=后一天 */){
  if (!availableDateStrs || availableDateStrs.length === 0) return null;

  const idx = availableDateStrs.indexOf(currentStr);
  if (idx !== -1) {
    const nextIdx = idx + direction;
    if (nextIdx >= 0 && nextIdx < availableDateStrs.length) {
      return availableDateStrs[nextIdx];
    }
    return null; // 已到边界
  }
  // 当前日不在表里：就近查找
  if (direction > 0) {
    for (let i = 0; i < availableDateStrs.length; i++) {
      if (availableDateStrs[i] > currentStr) return availableDateStrs[i];
    }
  } else {
    for (let i = availableDateStrs.length - 1; i >= 0; i--) {
      if (availableDateStrs[i] < currentStr) return availableDateStrs[i];
    }
  }
  return null;
}

/* 左右箭头（仅在相邻有更新的日期间跳转） */
const prevBtn = document.getElementById('prev-day');
const nextBtn = document.getElementById('next-day');

if (prevBtn) prevBtn.onclick = () => {
  ensureAvailableDateStrsReady();
  const cur  = currentDateEl.textContent.trim();
  const prev = findAdjacentDate(cur, -1);
  if (prev) updateDate(parseDate(prev));
  else showMessage('已经是最早一日');
};
if (nextBtn) nextBtn.onclick = () => {
  ensureAvailableDateStrsReady();
  const cur  = currentDateEl.textContent.trim();
  const next = findAdjacentDate(cur, +1);
  if (next) updateDate(parseDate(next));
  else showMessage('已经是最新一日');
};

/* ===================== 日历/今天/关闭 ===================== */
const openCalBtn   = document.getElementById('open-calendar');
const todayBtn     = document.getElementById('today-button');
const closeCalBtn  = document.getElementById('close-calendar');
const jumpLatestBtn= document.getElementById('jump-latest');

if (openCalBtn && calendarPopup) {
  openCalBtn.onclick = () => calendarPopup.classList.toggle('hidden');
}
if (datePicker) {
  datePicker.onchange = () => {
    const [yyyy, mm, dd] = datePicker.value.split('-');
    const selected = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    if (latestDate && selected > latestDate) {
      showMessage('当日暂未更新');
      updateDate(latestDate);
    } else {
      updateDate(selected);
    }
    calendarPopup?.classList.add('hidden');
  };
}
if (todayBtn) {
  todayBtn.onclick = () => {
    const today = new Date();
    const selected = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    if (latestDate && selected > latestDate) {
      showMessage('当日暂未更新');
      updateDate(latestDate);
    } else {
      updateDate(selected);
    }
    calendarPopup?.classList.add('hidden');
  };
}
if (closeCalBtn && calendarPopup) {
  closeCalBtn.onclick = () => calendarPopup.classList.add('hidden');
}
if (jumpLatestBtn) {
  jumpLatestBtn.onclick = () => {
    fetch("data/latest.json")
      .then(res => res.json())
      .then(obj => {
        const [yyyy, mm, dd] = obj.date.split('-');
        const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
        updateDate(date);
      })
      .catch(() => {
        if (latestDate) updateDate(latestDate);
      });
  };
}

// 📦 绑定 🔔按钮逻辑
const bellButton = document.querySelector('.icon-group .icon:nth-child(3)');
const updatePanel = document.getElementById('update-panel');
const closeUpdatePanel = document.getElementById('close-update-panel');

// ℹ️ 信息按钮
const infoIcon = document.querySelector('.icon-group .icon:nth-child(4)');
const infoPanel = document.getElementById('info-panel');
const closeInfoBtn = document.getElementById('close-info-panel');

// —— 公共函数：关闭所有面板 —— //
function closeAllPanels() {
  if (updatePanel) updatePanel.classList.add('hidden');
  if (infoPanel) infoPanel.classList.add('hidden');
  if (calendarPopup) calendarPopup.classList.add('hidden');
}

// 🔔 更新概要
if (bellButton && updatePanel) {
  bellButton.onclick = () => {
    const isHidden = updatePanel.classList.contains('hidden');
    closeAllPanels();                // 先关掉别的
    if (isHidden) updatePanel.classList.remove('hidden');
  };
  if (closeUpdatePanel) {
    closeUpdatePanel.onclick = () => updatePanel.classList.add('hidden');
  }
}

// ℹ️ 信息面板
if (infoIcon && infoPanel) {
  infoIcon.onclick = () => {
    const isHidden = infoPanel.classList.contains('hidden');
    closeAllPanels();                // 先关掉别的
    if (isHidden) {
      infoPanel.classList.remove('hidden');
      const dateStr = currentDateEl?.textContent?.trim();
      if (dateStr) renderInfoPanel(dateStr);
    }
  };
  if (closeInfoBtn) {
    closeInfoBtn.onclick = () => infoPanel.classList.add('hidden');
  }
}

/* ===================== 更新列表（静态示例数据） ===================== */
const updates = [
  { date: "2025-10-09", summary: "利曼：俄军在Yampil方向取得了部分成功；俄军向Serebryanka西部渗透；西维尔斯克：乌克兰国防军在Verkhnokamyanske的反击取得了成功；澄清了Novoselivka附近的前线；俄军在Vyimka方向取得了部分成功；康斯坦丁尼夫卡：澄清了卡索夫亚尔的前线；俄军在Predtechyne方向取得了部分成功；澄清了Kleban-Byk附近的前线；波克罗夫斯克：乌克兰国防军在Novotoreske的反击取得了成功" },
  { date: "2025-10-03", summary: "乌克兰武装部队在Boikivka方向取得了成功；更新了波克罗夫斯克（第聂伯彼得罗夫斯克州）方向的前线" },
  { date: "2025-09-14", summary: "乌克兰武装部队在Kindrativka（苏梅）附近推进；乌克兰武装部队清除了库普扬斯克的俄军；乌克兰武装部队解放了Pankivka（波克罗夫斯克）" },
  { date: "2025-09-07", summary: "澄清了库普扬斯克北部的情况；俄军向Zarichne推进；澄清了Katerynivka附近的情况；澄清了Yablunivka附近的情况；乌克兰武装部队解放了Volodimyrivka并向南部推进；澄清了Novotoreske附近的情况；俄军向利曼（波克罗夫斯克）推进；乌克兰武装部队向Razine方向推进" },
  { date: "2025-09-02", summary: "更新了波克罗夫斯克方向的交战区和解放区域" },
  { date: "2025-09-01", summary: "更新了托列茨克至赫尔松的接触线，剩余部分制作中；俄军在Bila Hora方向取得了部分成功" },
  { date: "2025-08-31", summary: "更新了苏梅至托列茨克方向的前线，剩余部分制作中..." }
];

// 渲染每日更新列表（并附加按压交互）
if (updateList) {
  updates.forEach(item => {
    const div = document.createElement('div');
    div.className = 'update-item';
    div.textContent = `${item.date}：${item.summary}`;
    makePressable(div); // ← 按压效果
    div.onclick = () => {
      const [yyyy, mm, dd] = item.date.split('-');
      const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
      updateDate(date);
    };
    updateList.appendChild(div);
  });
  // 与当前日期同步一次“永久高亮”
  syncSelectedToList();
}

/* ===================== 永久选中高亮（列表内） ===================== */
function setSelectedUpdateItem(dateStr){
  const list = document.getElementById('update-list') || document.querySelector('.update-list');
  if (!list) return;

  // 1) 解除旧的“选中外壳”
  list.querySelectorAll('.selected-frame').forEach(frame => {
    const inner = frame.firstElementChild;              // .update-item
    if (inner) frame.replaceWith(inner);                // 解包
  });

  // 2) 找到目标项
  const item = Array.from(list.querySelectorAll('.update-item'))
    .find(el => el.textContent.trim().startsWith(dateStr + '：'));
  if (!item) return;

  // 3) 若已在外壳中就不用重复包
  if (item.parentElement && item.parentElement.classList.contains('selected-frame')) {
    // 仍要保证滚动到可见
    scrollItemIntoView(list, item.parentElement);
    return;
  }

  // 4) 创建“黑框外壳”，把选中项包进去
  const frame = document.createElement('div');
  frame.className = 'selected-frame';      // 黑色外框容器
  item.replaceWith(frame);
  frame.appendChild(item);

  // 5) 滚动到“接近中间”的位置（以外壳作为目标）
  scrollItemIntoView(list, frame);
}

// 小工具：把目标滚到列表中间附近
function scrollItemIntoView(list, target){
  const top = target.offsetTop;
  const bottom = top + target.offsetHeight;
  const viewTop = list.scrollTop;
  const viewBottom = viewTop + list.clientHeight;
  if (top < viewTop || bottom > viewBottom){
    list.scrollTo({
      top: Math.max(0, top - (list.clientHeight - target.offsetHeight) / 2),
      behavior: 'smooth'
    });
  }
}

function syncSelectedToList(){
  const dateStr = currentDateEl?.textContent?.trim();
  if (dateStr) setSelectedUpdateItem(dateStr);
}

/* ===================== 按压效果：缩小 + 黑色外框 ===================== */
function makePressable(el){
  if (!el) return;
  el.classList.add('button-pressable');
  // 指针按下/抬起
  el.addEventListener('pointerdown', () => el.classList.add('is-pressed'));
  const clear = () => el.classList.remove('is-pressed');
  el.addEventListener('pointerup', clear);
  el.addEventListener('pointerleave', clear);
  el.addEventListener('pointercancel', clear);
  el.addEventListener('blur', clear);
  // 键盘
  el.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') el.classList.add('is-pressed');
  });
  el.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') el.classList.remove('is-pressed');
  });
}

// 把按压效果应用到固定按钮与图标
[
  prevBtn, nextBtn, openCalBtn, todayBtn, closeCalBtn, jumpLatestBtn,
  bellButton, closeUpdatePanel
].forEach(makePressable);

// 左侧所有图标（若需要）
document.querySelectorAll('.icon').forEach(makePressable);

/* ===================== 可选：键盘方向键也支持切换 ===================== */
// window.addEventListener('keydown', (e) => {
//   if (e.key === 'ArrowLeft') { prevBtn?.click(); }
//   if (e.key === 'ArrowRight'){ nextBtn?.click(); }
// });




//信息面板（测试）

/** 设置：乌克兰不含克里米亚的总面积（m²）
 *  例：577_000 km² ≈ 577_000 * 1_000_000 m² = 577_000_000_000
 */
 
const UA_BASE_NO_CRIMEA_M2 = 576_628_000_000;

/* Name → 内部类型键 */
const TYPE_MAP = {
  red: 'occupied_after',
  dpr: 'occupied_before',
  lib: 'liberated',
  contested: 'gray'
};

/* 展示信息（颜色等可调） */
const INFO_META = {
  occupied_after:  { label: '全面入侵后被占', color: '#E60000' },
  occupied_before: { label: '全面入侵前被占', color: '#6f2dbd' },
  liberated:       { label: '已解放',                    color: '#12b886' },
  gray:            { label: '交战区',                    color: '#9e9e9e' }
};

/* 汇总：按类型求面积（m²） */
function sumAreasByType(geojson){
  const acc = { occupied_after: 0, occupied_before: 0, liberated: 0, gray: 0 };
  if (!geojson || !geojson.features) return acc;

  for (const f of geojson.features){
    const g = f.geometry?.type;
    if (g !== 'Polygon' && g !== 'MultiPolygon') continue;
    const name = f.properties?.Name?.toLowerCase();
    const key  = TYPE_MAP[name];
    if (!key) continue;
    try{ acc[key] += turf.area(f); }catch{ /* ignore */ }
  }
  return acc;
}

/* 找上一天（有更新）的日期字符串 */
function getPrevAvailable(dateStr){
  ensureAvailableDateStrsReady();
  return findAdjacentDate(dateStr, -1);
}

// —— 数字格式化 —— //
const toThsKm2 = v => (v / 1_000_000 / 1000);          // m² → 千平方公里
const fmtThs   = v => `${toThsKm2(v).toFixed(3)} ths. km²`;
const fmtPct   = v => `${(v * 100).toFixed(2)}%`;
const fmtDelta = v => {
  const km2 = (v / 1_000_000).toFixed(1);               // km²
  return (v === 0) ? '±0.0 km²' : (v > 0 ? `+${km2} km²` : `${km2} km²`);
};

/* 渲染信息面板 */
function addRow(wrap, labelText, color, curVal, pct, delta){
  const row = document.createElement('div');
  row.className = 'info-row';

  // dot
  const dot = document.createElement('span');
  dot.className = 'info-dot';
  dot.style.background = color;

  // label
  const lab = document.createElement('div');
  lab.className = 'info-label';
  lab.textContent = labelText;

  // bar
  const barWrap = document.createElement('div');
  barWrap.className = 'info-bar-wrap';
  const bar = document.createElement('div');
  bar.className = 'info-bar';
  bar.style.background = color;
  bar.style.width = `${(Math.min(Math.max(pct, 0), 1) * 100).toFixed(2)}%`;
  barWrap.appendChild(bar);

  // Row3 左：面积 + Δ
  const left = document.createElement('div');
  left.className = 'info-val-left';
  left.innerHTML = `<span class="val">${fmtThs(curVal)}</span><span class="delta">${fmtDelta(delta)}</span>`;

  // Row3 右：百分比
  const pctEl = document.createElement('div');
  pctEl.className = 'info-pct';
  pctEl.textContent = fmtPct(pct);

  row.appendChild(dot);
  row.appendChild(lab);
  row.appendChild(barWrap);
  row.appendChild(left);
  row.appendChild(pctEl);
  wrap.appendChild(row);
}

// —— 主渲染：把 “总暂时被占” 也用 addRow —— //
async function renderInfoPanel(dateStr){
  const curUrl  = `data/frontline-${dateStr}.json`;
  const prevStr = getPrevAvailable(dateStr);
  const prevUrl = prevStr ? `data/frontline-${prevStr}.json` : null;

  let cur = null, prev = null;
  try{
    const r = await fetch(curUrl); if (!r.ok) throw 0;
    cur = await r.json();
  }catch{ cur = { type:'FeatureCollection', features:[] }; }

  if (prevUrl){
    try{
      const r2 = await fetch(prevUrl); if (!r2.ok) throw 0;
      prev = await r2.json();
    }catch{ prev = { type:'FeatureCollection', features:[] }; }
  }else{
    prev = { type:'FeatureCollection', features:[] };
  }

  const curSum  = sumAreasByType(cur);
  const prevSum = sumAreasByType(prev);

  const A = curSum.occupied_after   || 0;  // after
  const B = curSum.occupied_before  || 0;  // before
  const L = curSum.liberated        || 0;  // liberated

  const A_prev = prevSum.occupied_after  || 0;
  const B_prev = prevSum.occupied_before || 0;
  const L_prev = prevSum.liberated       || 0;

  const BASE = (UA_BASE_NO_CRIMEA_M2 && UA_BASE_NO_CRIMEA_M2 > 0)
    ? UA_BASE_NO_CRIMEA_M2
    : (A + B + L || 1);

  const denomAfter = Math.max(BASE - B, 1);
  const pctAfter   = A / denomAfter;

  const pctBefore  = B / BASE;

  const T          = A + B;
  const pctTotal   = T / BASE;

  const denomLib   = Math.max(T, 1);
  const pctLib     = L / denomLib;

  const dA = A - A_prev;
  const dB = B - B_prev;
  const dT = T - (A_prev + B_prev);
  const dL = L - L_prev;

  const wrap = document.getElementById('info-content');
  if (!wrap) return;
  wrap.innerHTML = '';

  // 你的中文标签（按需替换）
  const LBL_AFTER  = '全面入侵后被占';
  const LBL_BEFORE = '全面入侵前被占';
  const LBL_LIB    = '已解放';
  const LBL_TOTAL  = '总暂时被占';

  // 颜色（与你地图一致）
  const C_AFTER  = '#E60000';
  const C_BEFORE = '#6f2dbd';
  const C_LIB    = '#12b886';
  const C_TOTAL  = '#ff3232';

  addRow(wrap, LBL_AFTER,  C_AFTER,  A, pctAfter, dA);
  addRow(wrap, LBL_BEFORE, C_BEFORE, B, pctBefore, dB);
  addRow(wrap, LBL_LIB,    C_LIB,    L, pctLib,   dL);
  addRow(wrap, LBL_TOTAL,  C_TOTAL,  T, pctTotal, dT);   // ← 不再单独写，样式统一
}

/* ========== 打开/关闭信息面板：与当前日期联动 ========== */
const infoIcon      = document.querySelector('.icon-group .icon:nth-child(4)'); // ℹ️
const infoPanel     = document.getElementById('info-panel');
const closeInfoBtn  = document.getElementById('close-info-panel');

if (infoIcon && infoPanel){
  infoIcon.onclick = () => {
    infoPanel.classList.toggle('hidden');
    if (!infoPanel.classList.contains('hidden')){
      const dateStr = currentDateEl?.textContent?.trim();
      if (dateStr) renderInfoPanel(dateStr);
    }
  };
}
if (closeInfoBtn && infoPanel){
  closeInfoBtn.onclick = () => infoPanel.classList.add('hidden');
}

/* ========== 当日期变化时，若信息面板是打开的则刷新 ========== */
const __oldUpdateDate = updateDate;
updateDate = function(date){
  __oldUpdateDate(date);
  if (infoPanel && !infoPanel.classList.contains('hidden')){
    const dateStr = currentDateEl?.textContent?.trim();
    if (dateStr) renderInfoPanel(dateStr);
  }
};
