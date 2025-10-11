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
  const fromUpdates = (typeof updates !== 'undefined' && Array.isArray(updates)) ? updates.map(u => u.date) : [];
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

/* ===================== 更新面板（打开/关闭） ===================== */
const bellButton        = document.querySelector('.icon-group .icon:nth-child(3)');
const updatePanel       = document.getElementById('update-panel');
const closeUpdatePanel  = document.getElementById('close-update-panel');
const updateList        = document.getElementById('update-list');

// ℹ️ 信息按钮
const infoIcon    = document.querySelector('.icon-group .icon:nth-child(4)');
const infoPanel   = document.getElementById('info-panel');
const closeInfoBtn= document.getElementById('close-info-panel');

// 🌐 经纬度搜索按钮与面板
const globeIcon   = document.querySelector('.icon-group .icon:nth-child(2)');
const geoPanel    = document.getElementById('geo-panel');
const closeGeoBtn = document.getElementById('close-geo-panel');
const geoInput    = document.getElementById('geo-input');
const geoGoBtn    = document.getElementById('geo-go');

// —— 公共函数：关闭所有面板 —— //
function closeAllPanels() {
  if (updatePanel) updatePanel.classList.add('hidden');
  if (infoPanel)   infoPanel.classList.add('hidden');
  if (calendarPopup) calendarPopup.classList.add('hidden');
  if (typeof disableRuler === 'function') disableRuler();
}

// 扩展：把 🌐 面板也纳入
const _oldCloseAllPanels = closeAllPanels;
function closeAllPanelsExtended(){
  _oldCloseAllPanels();
  if (geoPanel) geoPanel.classList.add('hidden');
  if (drawPanel) drawPanel.classList.add('hidden');
  if (typeof disableDraw === 'function') disableDraw();
  removeGeoMarker();
}

/* 🔔 更新概要 */
if (bellButton && updatePanel) {
  bellButton.onclick = () => {
    const isHidden = updatePanel.classList.contains('hidden');
    closeAllPanelsExtended();         // 先关掉别的
    if (isHidden) updatePanel.classList.remove('hidden');
  };
  if (closeUpdatePanel) {
    closeUpdatePanel.onclick = () => updatePanel.classList.add('hidden');
  }
}

/* ℹ️ 信息面板 */
if (infoIcon && infoPanel) {
  infoIcon.onclick = () => {
    const isHidden = infoPanel.classList.contains('hidden');
    closeAllPanelsExtended();         // 先关掉别的
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

/* 🌐 经纬度搜索面板开关 */
if (globeIcon && geoPanel){
  globeIcon.onclick = () => {
    const isHidden = geoPanel.classList.contains('hidden');
    closeAllPanelsExtended();         // 先关掉别的
    if (isHidden){
      geoPanel.classList.remove('hidden');
      setTimeout(() => geoInput?.focus(), 0);
    }
  };
}
if (closeGeoBtn){
  closeGeoBtn.onclick = () => {
    geoPanel.classList.add('hidden');
    removeGeoMarker();     // ← 关闭面板时顺便移除 pin
  };
}

/* ===================== Ruler 运行时状态与工具 ===================== */
const rulerIcon      = document.querySelector('.sidebar-section.middle .icon-group .icon:nth-child(2)'); // 📏
const rulerPanel     = document.getElementById('ruler-panel');          // 你已有的面板
const closeRulerBtn  = document.getElementById('close-ruler-panel');    // 面板右上角 ✕
const rulerDistEl    = document.getElementById('ruler-distance');       // 距离数值
const rulerAreaEl    = document.getElementById('ruler-area');           // 面积数值

let rulerActive  = false;
let rulerClosed  = false;          // 是否已闭合
let rulerPts     = [];             // Leaflet LatLng[]
let rulerMarkers = [];             // circleMarker[]
let rulerLine    = null;           // Polyline（白色虚线）
let rulerPoly    = null;           // Polygon（半透明白填充）

// —— 工具函数 —— //
function km(n){ return (Math.round(n * 100) / 100).toFixed(2); }     // 保留 2 位
function km2(n){ return (Math.round(n * 100) / 100).toFixed(2); }

function latLngsToLngLatArray(latlngs){
  return latlngs.map(ll => [ll.lng, ll.lat]);
}

function updateRulerStats(){
  // 距离：沿折线的总长度（km）
  let distKm = 0;
  if (rulerPts.length > 1){
    const line = turf.lineString(latLngsToLngLatArray(rulerPts));
    distKm = turf.length(line, {units:'kilometers'});
  }
  rulerDistEl && (rulerDistEl.textContent = km(distKm));

  // 面积：闭合后才计算（km²）
  let areaKm2 = 0;
  if (rulerClosed && rulerPts.length >= 3){
    const poly = turf.polygon([latLngsToLngLatArray([...rulerPts, rulerPts[0]])]);
    areaKm2 = turf.area(poly) / 1_000_000; // m² → km²
  }
  rulerAreaEl && (rulerAreaEl.textContent = km2(areaKm2));
}

function redrawRuler(){
  // 1) 折线点集：未闭合用 rulerPts；闭合后用 [...rulerPts, rulerPts[0]]
  const linePts = (rulerClosed && rulerPts.length >= 2)
    ? [...rulerPts, rulerPts[0]]
    : rulerPts;

  // 虚线：始终用同一条 polyline
  if (!rulerLine){
    rulerLine = L.polyline(linePts, {
      color: '#ffffff',
      weight: 2,
      opacity: 0.95,
      dashArray: '6 6'
    }).addTo(map);
  }else{
    rulerLine.setLatLngs(linePts); // ← 更新为闭合或未闭合的点集
  }

  // 2) 面：只填充，不描边（stroke: false）
  if (rulerClosed && rulerPts.length >= 3){
    const closed = [...rulerPts, rulerPts[0]];
    if (!rulerPoly){
      rulerPoly = L.polygon(closed, {
        fillColor: '#ffffff',
        fillOpacity: 0.08,
        stroke: false                // ← 关键：关闭描边，避免盖住虚线
      }).addTo(map);
    }else{
      rulerPoly.setLatLngs(closed);
    }
  }else if (rulerPoly){
    map.removeLayer(rulerPoly);
    rulerPoly = null;
  }

  updateRulerStats();
}

function clearRuler(){
  rulerClosed = false;
  rulerPts = [];
  rulerMarkers.forEach(m => map.removeLayer(m));
  rulerMarkers = [];
  if (rulerLine){ map.removeLayer(rulerLine); rulerLine = null; }
  if (rulerPoly){ map.removeLayer(rulerPoly); rulerPoly = null; }
  updateRulerStats();
}

function addRulerPoint(latlng){
  if (rulerClosed) return; // 已闭合不再加点

  // 如果点击的是第一个点，并且已有≥3个点，则闭合
  if (rulerPts.length >= 3){
    const first = rulerPts[0];
    const dx = map.latLngToLayerPoint(first).distanceTo(map.latLngToLayerPoint(latlng));
    // 允许一点点“误差”点击：像素半径 10
    if (dx <= 10){
      rulerClosed = true;
      redrawRuler();
      return;
    }
  }

  rulerPts.push(latlng);

  // 小白点
  const mk = L.circleMarker(latlng, {
    radius: 5,
    color: '#ffffff',
    weight: 2,
    fillColor: '#ffffff',
    fillOpacity: 1
  }).addTo(map);

  // 允许拖动
  mk.on('mousedown', function (e) {
    if (!rulerActive) return;
    map.dragging.disable();
  
    const move = (ev) => {
      const newLatLng = ev.latlng;
      mk.setLatLng(newLatLng);
      const idx = rulerMarkers.indexOf(mk);
      if (idx !== -1) rulerPts[idx] = newLatLng;
      redrawRuler();
    };
    const up = () => {
      map.dragging.enable();
      map.off('mousemove', move);
      map.off('mouseup', up);
    };
  
    map.on('mousemove', move);
    map.on('mouseup', up);
  });

  // 点击第一个点也能闭合（用户更直觉）
  mk.on('click', () => {
    if (rulerPts.length >= 3 && mk === rulerMarkers[0] && !rulerClosed){
      rulerClosed = true;
      redrawRuler();
    }
  });

  rulerMarkers.push(mk);
  redrawRuler();
}

/* ===================== 绑定 📏 图标与面板按钮 ===================== */
function enableRuler(){
  if (rulerActive) return;
  rulerActive = true;
  clearRuler();
  rulerPanel && rulerPanel.classList.remove('hidden');

  // 地图左键：加点
  map.on('click', onMapClickAddPoint);
}
function disableRuler(){
  if (!rulerActive) return;
  rulerActive = false;
  map.off('click', onMapClickAddPoint);
  clearRuler();
  rulerPanel && rulerPanel.classList.add('hidden');
}
function onMapClickAddPoint(e){
  addRulerPoint(e.latlng);
}

// 图标开关
if (rulerIcon){
  rulerIcon.onclick = () => {
    const wantOpen = !rulerPanel || rulerPanel.classList.contains('hidden');
    closeAllPanelsExtended();
    if (wantOpen) enableRuler();
  };
}

// 关闭按钮：关闭即清空（无 Clear/Finish 按钮）
if (closeRulerBtn){
  closeRulerBtn.onclick = () => disableRuler();
}

/* ===================== ✏️ 绘图工具 ===================== */
/* 绑定元素 */
const drawIcon        = document.querySelector('.sidebar-section.middle .icon-group .icon:nth-child(3)'); // ✏️
const drawPanel       = document.getElementById('draw-panel');
const closeDrawBtn    = document.getElementById('close-draw-panel');
const drawUndoBtn     = document.getElementById('draw-undo');
const drawClearBtn    = document.getElementById('draw-clear');
const drawExportBtn   = document.getElementById('draw-export');
const drawShareBtn    = document.getElementById('draw-share');
const drawWeightInput = document.getElementById('draw-weight');
const drawWeightVal   = document.getElementById('draw-weight-val');
const drawColorsWrap  = document.getElementById('draw-colors');

const DRAW_COLORS = ['#ff1a1a','#ff7a7a','#5aa8ff','#79c7ff','#22c55e','#6b7280','#f59e0b','#fde047','#ffffff'];
let drawActive  = false;
let drawMode    = 'pen';       // pen | erase | line | arrow | rect | circle
let drawColor   = DRAW_COLORS[0];
let drawWeight  = 3;

let drawing    = false;
let startLL    = null;
let tempLayer  = null;         // 正在绘制中的图层
let shapes     = [];           // 已完成图层
let freehand   = null;         // pen 模式的折线

function distPointToSeg(px, a, b){
  // px, a, b 均为 layerPoint（像素）
  const vx = b.x - a.x, vy = b.y - a.y;
  const wx = px.x - a.x, wy = px.y - a.y;
  const vv = vx*vx + vy*vy || 1;
  let t = (vx*wx + vy*wy) / vv;
  t = Math.max(0, Math.min(1, t));
  const sx = a.x + t*vx, sy = a.y + t*vy;
  const dx = px.x - sx, dy = px.y - sy;
  return Math.hypot(dx, dy);
}
function hitPolyline(layer, ll, tolPx=8){
  const p = map.latLngToLayerPoint(ll);
  const latlngs = layer.getLatLngs();
  for (let i=0;i<latlngs.length-1;i++){
    const a = map.latLngToLayerPoint(latlngs[i]);
    const b = map.latLngToLayerPoint(latlngs[i+1]);
    if (distPointToSeg(p,a,b) <= tolPx) return true;
  }
  return false;
}
function pointInPolygon(ll, poly){ // 简单射线法
  const pts = poly.getLatLngs()[0] || [];
  const x = ll.lng, y = ll.lat;
  let inside = false;
  for (let i=0,j=pts.length-1;i<pts.length;j=i++){
    const xi=pts[i].lng, yi=pts[i].lat;
    const xj=pts[j].lng, yj=pts[j].lat;
    const intersect = ((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function hitLayer(layer, ll){
  if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)){
    return hitPolyline(layer, ll, Math.max(8, (layer.options.weight||3)));
  }
  if (layer instanceof L.Polygon){
    return pointInPolygon(ll, layer);
  }
  if (layer instanceof L.Rectangle){
    return layer.getBounds().contains(ll);
  }
  if (layer instanceof L.Circle){
    return map.distance(layer.getLatLng(), ll) <= layer.getRadius();
  }
  return false;
}
function eraseAt(ll){
  // 从后往前删（视觉上“最上层”优先）
  for (let i=shapes.length-1;i>=0;i--){
    const s = shapes[i];
    if (s.parts){ // 箭头组合
      if (hitLayer(s.parts[0], ll) || hitLayer(s.parts[1], ll)){
        s.parts.forEach(p => map.removeLayer(p));
        shapes.splice(i,1);
        return true;
      }
    }else{
      if (hitLayer(s, ll)){
        map.removeLayer(s);
        shapes.splice(i,1);
        return true;
      }
    }
  }
  return false;
}

// —— 右键绘制：事件处理 —— //
function isRightButton(e){
  const btn = e.originalEvent ? e.originalEvent.button : e.button;
  return btn === 2;
}

function onDownRight(e){
  if (!drawActive || !isRightButton(e)) return; // 左键不进入绘制
  drawing = true;
  startLL = e.latlng;
  map.dragging.disable();

  if (drawMode === 'pen'){
    freehand = L.polyline([startLL], { color: drawColor, weight: drawWeight, opacity: 1 }).addTo(map);
    tempLayer = freehand;
  } else if (drawMode === 'line' || drawMode === 'arrow'){
    tempLayer = L.polyline([startLL, startLL], { color: drawColor, weight: drawWeight, opacity: 1 }).addTo(map);
  } else if (drawMode === 'rect'){
    tempLayer = L.rectangle([startLL, startLL], { color: drawColor, weight: drawWeight, fillOpacity: 0.08, fillColor: drawColor }).addTo(map);
  } else if (drawMode === 'circle'){
    tempLayer = L.circle(startLL, { radius: 1, color: drawColor, weight: drawWeight, fillOpacity: 0.08, fillColor: drawColor }).addTo(map);
  }
}

function onMoveRight(e){
  if (!drawActive || !drawing || !tempLayer) return;
  const ll = e.latlng;
  if (drawMode === 'pen'){
    const pts = freehand.getLatLngs(); pts.push(ll); freehand.setLatLngs(pts);
  } else if (drawMode === 'line' || drawMode === 'arrow'){
    tempLayer.setLatLngs([startLL, ll]);
  } else if (drawMode === 'rect'){
    tempLayer.setBounds(L.latLngBounds(startLL, ll));
  } else if (drawMode === 'circle'){
    const r = map.distance(startLL, ll); tempLayer.setRadius(r);
  }
}

function onUpRight(e){
  if (!drawActive || !drawing) return;
  drawing = false;
  map.dragging.enable();
  if (!tempLayer) return;

  if (drawMode === 'arrow'){
    finalizeArrow(tempLayer);   // 会自动截断主线并画三角形
  } else {
    shapes.push(tempLayer);
  }
  tempLayer = null;
  startLL = null;
}

// —— 面板开关 —— //
if (drawIcon){
  drawIcon.onclick = () => {
    const wantOpen = !drawPanel || drawPanel.classList.contains('hidden');
    // 统一关闭别的面板（含 ruler/geo/info/update），也会把 draw 关掉
    closeAllPanelsExtended();
    if (wantOpen) {
      // 重新开启绘图并显示面板
      enableDraw();
      drawPanel && drawPanel.classList.remove('hidden');
    } else {
      // 如果本来就是开的，这里相当于“点击关闭”
      disableDraw();
      drawPanel && drawPanel.classList.add('hidden');
    }
  };
}

if (closeDrawBtn) closeDrawBtn.onclick = () => { drawPanel.classList.add('hidden'); disableDraw(); };

// —— 初始化调色板 —— //
if (drawColorsWrap) {
  DRAW_COLORS.forEach((c, i) => {
    const sw = document.createElement('div');
    sw.className = 'draw-color' + (i === 0 ? ' selected' : '');
    sw.style.background = c;
    sw.dataset.color = c;
    sw.onclick = () => {
      drawColor = c;
      [...drawColorsWrap.children].forEach(el => el.classList.remove('selected'));
      sw.classList.add('selected');
      // 更新进行中的临时图层颜色
      if (tempLayer && tempLayer.setStyle) tempLayer.setStyle({ color: drawColor, fillColor: drawColor });
      if (freehand && freehand.setStyle)  freehand.setStyle({ color: drawColor });
    };
    drawColorsWrap.appendChild(sw);
  });
}

// —— 粗细 —— //
if (drawWeightInput && drawWeightVal) {
  drawWeightVal.textContent = String(drawWeightInput.value);
  drawWeightInput.addEventListener('input', () => {
    drawWeight = +drawWeightInput.value || 3;
    drawWeightVal.textContent = String(drawWeight);
    if (tempLayer && tempLayer.setStyle) tempLayer.setStyle({ weight: drawWeight });
    if (freehand && freehand.setStyle)  freehand.setStyle({ weight: drawWeight });
  });
}

// —— 工具按钮 —— //
document.querySelectorAll('#draw-panel .draw-tool').forEach(btn => {
  btn.addEventListener('click', () => {
    const m = btn.dataset.tool;
    drawMode = m;
    // 视觉选中
    document.querySelectorAll('#draw-panel .draw-tool').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    // 切换工具时清除正在绘制的临时层
    discardTemp();
  });
});
// 默认选中画笔
document.querySelector('#draw-panel .draw-tool[data-tool="pen"]')?.classList.add('selected');

// —— 导出/分享/撤销/清空 —— //
if (drawUndoBtn)  drawUndoBtn.onclick  = undoLastShape;
if (drawClearBtn) drawClearBtn.onclick = clearAllShapes;
if (drawShareBtn)  drawShareBtn.onclick  = shareGeoJSON;

// ====== 绘图模式十字光标（无闪烁）======
let _drawCursorStyleEl = null;

function installDrawCursor() {
  if (_drawCursorStyleEl) return;
  const id = map.getContainer().id || 'map';
  const esc = (window.CSS && CSS.escape) ? CSS.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  const css = `
    #${esc}, #${esc} * { cursor: crosshair !important; }
  `;
  _drawCursorStyleEl = document.createElement('style');
  _drawCursorStyleEl.setAttribute('data-draw-cursor', '1');
  _drawCursorStyleEl.textContent = css;
  document.head.appendChild(_drawCursorStyleEl);
}

function uninstallDrawCursor() {
  if (_drawCursorStyleEl) {
    _drawCursorStyleEl.remove();
    _drawCursorStyleEl = null;
  }
}

// —— 开启/关闭绘图模式 —— //
function enableDraw(){
  if (drawActive) return;
  drawActive = true;
  map.getContainer().style.cursor = 'crosshair';
  installDrawCursor();
  // 右键绘制
  map.on('mousedown', onDownRight);
  map.on('mousemove', onMoveRight);
  map.on('mouseup',   onUpRight);
  // 左键“点擦除”
  map.on('click', onEraseIfNeeded);
}

function disableDraw(){
  if (!drawActive) return;
  drawActive = false;
  drawing = false;
  uninstallDrawCursor();
  discardTemp();
  map.getContainer().style.cursor = '';
  map.off('mousedown', onDownRight);
  map.off('mousemove', onMoveRight);
  map.off('mouseup',   onUpRight);
  map.off('click', onEraseIfNeeded);
}

function onEraseIfNeeded(e){
  if (drawActive && drawMode === 'erase'){
    eraseAt(e.latlng);
  }
}

// 点击删除（仅在橡皮模式下生效）
function tryEraseShape(){
  if (drawMode !== 'erase') return;

  // 形状可能是“组合”（箭头），也可能是单层
  const idxCombo = shapes.findIndex(s => s && s.parts && s.parts.includes(this));
  if (idxCombo !== -1){
    shapes[idxCombo].parts.forEach(p => map.removeLayer(p));
    shapes.splice(idxCombo, 1);
    return;
  }
  const idx = shapes.indexOf(this);
  if (idx !== -1){
    map.removeLayer(this);
    shapes.splice(idx, 1);
  }
}

/* —— 工具函数 —— */
function discardTemp(){
  if (tempLayer){ map.removeLayer(tempLayer); tempLayer = null; }
  freehand = null;
  startLL = null;
}
function undoLastShape(){
  // 优先取消正在画的
  if (tempLayer){ discardTemp(); return; }
  const last = shapes.pop();
  if (!last) return;
  if (last.parts) last.parts.forEach(p => map.removeLayer(p));
  else map.removeLayer(last);
}
function clearAllShapes(){
  discardTemp();
  shapes.forEach(s => {
    if (s.parts) s.parts.forEach(p => map.removeLayer(p));
    else map.removeLayer(s);
  });
  shapes = [];
}
function exportGeoJSON(){
  const fc = toGeoJSONFeatureCollection();
  const blob = new Blob([JSON.stringify(fc, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `drawings-${new Date().toISOString().replace(/[:.]/g,'-')}.geojson`;
  a.click();
  URL.revokeObjectURL(a.href);
}
async function shareGeoJSON(){
  const fc = toGeoJSONFeatureCollection();
  const text = JSON.stringify(fc);
  try{
    await navigator.clipboard.writeText(text);
    showMessage('GeoJSON 已复制到剪贴板');
  }catch{
    showMessage('复制失败，可尝试导出文件');
  }
}
function toGeoJSONFeatureCollection(){
  const feats = [];

  const pushLayer = (layer, typeOverride) => {
    if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)){
      const coords = layer.getLatLngs().map(ll => [ll.lng, ll.lat]);
      feats.push({
        type:'Feature',
        geometry:{ type:'LineString', coordinates: coords },
        properties:{ color: layer.options.color, weight: layer.options.weight, mode: typeOverride || 'line' }
      });
    } else if (layer instanceof L.Polygon){
      const rings = layer.getLatLngs()[0].map(ll => [ll.lng, ll.lat]);
      rings.push([rings[0][0], rings[0][1]]);
      feats.push({
        type:'Feature',
        geometry:{ type:'Polygon', coordinates: [rings] },
        properties:{ color: layer.options.color, weight: layer.options.weight, mode: typeOverride || 'polygon' }
      });
    } else if (layer instanceof L.Circle){
      feats.push({
        type:'Feature',
        geometry:{ type:'Point', coordinates: [layer.getLatLng().lng, layer.getLatLng().lat] },
        properties:{ color: layer.options.color, weight: layer.options.weight, radius: layer.getRadius(), mode:'circle' }
      });
    } else if (layer instanceof L.Rectangle){
      const b = layer.getBounds();
      const ring = [
        [b.getWest(), b.getSouth()],
        [b.getEast(), b.getSouth()],
        [b.getEast(), b.getNorth()],
        [b.getWest(), b.getNorth()],
        [b.getWest(), b.getSouth()],
      ];
      feats.push({
        type:'Feature',
        geometry:{ type:'Polygon', coordinates:[ring] },
        properties:{ color: layer.options.color, weight: layer.options.weight, mode:'rect' }
      });
    }
  };

  shapes.forEach(s => {
    if (s.parts){ // 箭头组合
      pushLayer(s.parts[0], 'arrow');
      pushLayer(s.parts[1], 'arrowhead');
    } else {
      pushLayer(s);
    }
  });
  return { type:'FeatureCollection', features: feats };
}

// 构造箭头三角形（用像素空间计算，最后反投影回经纬度）
function makeArrowGeometry(aLL, bLL, sizePx=12, deg=28){
  const pA = map.latLngToLayerPoint(aLL);
  const pB = map.latLngToLayerPoint(bLL);
  const v  = pB.subtract(pA);
  const len = Math.max(1, Math.hypot(v.x, v.y));
  const ux = v.x / len, uy = v.y / len; // 单位方向

  const back = sizePx;                         // 箭头从尖端往回的长度
  const half = Math.tan(deg * Math.PI/180) * sizePx; // 半宽

  const tip  = pB;
  const base = L.point(pB.x - ux*back, pB.y - uy*back); // 底边中心（对齐主线）
  const left = L.point(base.x + (-uy)*half, base.y + (ux)*half);
  const right= L.point(base.x - (-uy)*half, base.y - (ux)*half);

  return {
    tipLL:   map.layerPointToLatLng(tip),
    baseLL:  map.layerPointToLatLng(base),     // 用于截断主线
    leftLL:  map.layerPointToLatLng(left),
    rightLL: map.layerPointToLatLng(right)
  };
}

function finalizeArrow(lineLayer){
  const pts = lineLayer.getLatLngs();
  if (pts.length !== 2) { shapes.push(lineLayer); return; }
  const a = pts[0], b = pts[1];

  // 根据当前线宽自适应箭头大小（可按口味微调系数）
  const sizePx    = Math.max(10, drawWeight * 3.2);          // 三角形“长度”
  const headAngle = 28;                                      // 三角张角（度）
  const headStroke= Math.max(1, Math.round(drawWeight * 0.6)); // 三角描边粗细（可选）
  
  const { tipLL, baseLL, leftLL, rightLL } = makeArrowGeometry(a, b, sizePx, headAngle);

  // 1) 截断主线到“基底中心”，保持主线很粗时三角也不会被盖住
  lineLayer.setLatLngs([a, baseLL]);
  lineLayer.setStyle({ weight: drawWeight, color: drawColor });

  // 2) 画头（三角形）—— 填充与描边随线宽变化，并放到顶层
  const head = L.polygon([leftLL, tipLL, rightLL], {
    color: drawColor,                // 描边颜色
    weight: headStroke,              // 描边粗细随线宽
    fillColor: drawColor, 
    fillOpacity: 1,
    interactive: true
  }).addTo(map).bringToFront();

  // 点击橡皮时可删
  head.on('click', tryEraseShape);

  // 3) 存为组合（主线 + 箭头）
  shapes.push({ type:'arrow', parts:[lineLayer, head] });
}

/* —— 触摸事件转鼠标 —— */
function touchAsMouse(handler){
  return function(e){
    const t = e.originalEvent?.touches?.[0] || e.originalEvent?.changedTouches?.[0];
    if (!t) return;
    const ll = map.mouseEventToLatLng(t);
    handler({ latlng: ll });
  };
}

/* 面板按钮也有按压效果 */
[drawUndoBtn, drawClearBtn, drawExportBtn, drawShareBtn, closeDrawBtn].forEach(makePressable);
document.querySelectorAll('#draw-panel .draw-tool').forEach(makePressable);

(function ensureSelectedToolStyle(){
  const css = `
  #draw-panel .draw-tool.selected {
    outline: 2px solid #000;
    outline-offset: -2px; 
    border-radius: 6px;
  }`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();

/* ========= 导出：隐藏 UI → 冻结 Leaflet → 等待瓦片 → 保存 PNG → 还原 ========= */
let _exportCssEl = null;

function installExportCss() {
  if (_exportCssEl) return;
  const id = map.getContainer().id || 'map';
  const esc = (window.CSS && CSS.escape) ? CSS.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  const css = `
    .__exporting .topbar,
    .__exporting .sidebar,
    .__exporting .icon-group,
    .__exporting #update-panel,
    .__exporting #info-panel,
    .__exporting #calendar-popup,
    .__exporting #geo-panel,
    .__exporting #draw-panel,
    .__exporting #ruler-panel,
    .__exporting .leaflet-control-container,
    .__exporting .leaflet-popup-pane { display: none !important; }

    .__exporting #${esc}, .__exporting #${esc} * { cursor: default !important; }
  `;
  _exportCssEl = document.createElement('style');
  _exportCssEl.textContent = css;
  document.head.appendChild(_exportCssEl);
}
function uninstallExportCss() {
  if (_exportCssEl) { _exportCssEl.remove(); _exportCssEl = null; }
}

/* 动态加载 html2canvas（只在首次导出时加载） */
function ensureHtml2Canvas() {
  return new Promise((resolve, reject) => {
    if (window.html2canvas) return resolve(window.html2canvas);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    s.async = true;
    s.onload = () => resolve(window.html2canvas);
    s.onerror = () => reject(new Error('html2canvas 加载失败'));
    document.head.appendChild(s);
  });
}

/* 等待当前视窗内所有 TileLayer 完成加载 */
function waitVisibleTiles() {
  const waits = [];
  map.eachLayer(l => {
    if (l instanceof L.TileLayer) {
      // 已经就绪会立刻触发一次 'load'，否则等到加载完成
      waits.push(new Promise(res => {
        const onLoad = () => { l.off('load', onLoad); res(); };
        l.on('load', onLoad);
        // 兜底：若已经加载完成，下一帧解除监听
        requestAnimationFrame(() => { l.off('load', onLoad); res(); });
      }));
    }
  });
  return Promise.all(waits);
}

/* 冻结所有 pane 的 transform，避免 html2canvas 计算偏移 */
function freezeLeafletTransforms() {
  const panes = map.getPanes();
  const targets = [
    panes.mapPane, panes.tilePane, panes.overlayPane,
    panes.shadowPane, panes.markerPane, panes.tooltipPane, panes.popupPane
  ].filter(Boolean);

  const prev = new Map();
  targets.forEach(el => {
    const style = el.style;
    prev.set(el, {
      transform: style.transform,
      left: style.left,
      top: style.top,
      willChange: style.willChange
    });
    // 读取当前 translate 像素（Leaflet 内部存着）
    const pos = (L.DomUtil.getPosition && L.DomUtil.getPosition(el)) || { x: 0, y: 0 };
    style.transform = 'none';
    style.left = pos.x + 'px';
    style.top = pos.y + 'px';
    style.willChange = 'auto';
  });
  // 锁定容器尺寸，防止布局在隐藏 UI 时回流改变地图大小
  const mapEl = map.getContainer();
  const rect = mapEl.getBoundingClientRect();
  const prevMapSize = { width: mapEl.style.width, height: mapEl.style.height };
  mapEl.style.width = rect.width + 'px';
  mapEl.style.height = rect.height + 'px';

  return function unfreeze() {
    targets.forEach(el => {
      const p = prev.get(el);
      if (!p) return;
      el.style.transform = p.transform || '';
      el.style.left = p.left || '';
      el.style.top = p.top || '';
      el.style.willChange = p.willChange || '';
    });
    mapEl.style.width = prevMapSize.width || '';
    mapEl.style.height = prevMapSize.height || '';
  };
}

async function exportMapAsPNGNoUI() {
  // 保留按钮样式：这里只换点击逻辑，不改 DOM 文案
  let restoreCursor = null;
  try {
    // 停止交互与动画，防抖动
    const wasDraw = !!drawActive;
    const wasRuler = !!rulerActive;
    if (wasDraw) disableDraw();
    if (wasRuler) disableRuler();

    // 临时关闭地图交互（不改你的全局设置，完了再恢复）
    const toDisable = [
      map.dragging, map.touchZoom, map.doubleClickZoom,
      map.scrollWheelZoom, map.boxZoom, map.keyboard
    ].filter(Boolean);
    const reEnable = [];
    toDisable.forEach(api => { if (api.enabled && api.enabled()) { api.disable(); reEnable.push(api); } });

    installExportCss();
    document.documentElement.classList.add('__exporting');

    // 等 UI 隐藏生效
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));

    // 等瓦片就绪
    await waitVisibleTiles();

    // 冻结 transform，避免右偏/缺块
    const unfreeze = freezeLeafletTransforms();

    const h2c = await ensureHtml2Canvas();
    const mapEl = document.getElementById('map');
    const canvas = await h2c(mapEl, {
      useCORS: true,
      backgroundColor: null,
      scale: Math.max(1, Math.floor(window.devicePixelRatio || 1)),
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight
    });

    // 下载
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `map-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;
    a.click();

    // 还原
    unfreeze();
    document.documentElement.classList.remove('__exporting');
    uninstallExportCss();
    reEnable.forEach(api => api.enable());
    if (wasDraw) enableDraw();
    if (wasRuler) enableRuler();
  } catch (err) {
    document.documentElement.classList.remove('__exporting');
    uninstallExportCss();
    showMessage('导出 PNG 失败：' + (err?.message || err));
  }
}

/* 用 PNG 导出替换原按钮的点击逻辑（不改样式/文字） */
if (drawExportBtn) {
  drawExportBtn.onclick = exportMapAsPNGNoUI;
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

// 把按压效果应用到固定按钮与图标（含新加的 🌐 面板控件）
[
  prevBtn, nextBtn, openCalBtn, todayBtn, closeCalBtn, jumpLatestBtn,
  bellButton, closeUpdatePanel,
  infoIcon, closeInfoBtn,
  globeIcon, closeGeoBtn, geoGoBtn
].forEach(makePressable);

// 左侧所有图标（若需要）
document.querySelectorAll('.icon').forEach(makePressable);

function removeGeoMarker(){
  if (window.geoMarker){
    try { window.geoMarker.remove(); } 
    catch { map.removeLayer(window.geoMarker); }
    window.geoMarker = null;
  }
}

/* ===================== 经纬度搜索逻辑 ===================== */
function parseLatLng(text){
  // 允许：纬度,经度 / 纬度 , 经度（带空格）
  const m = String(text).trim().match(/^\s*([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90)   return null;
  if (lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function goToLatLng(){
  const v = geoInput?.value || '';
  const ll = parseLatLng(v);
  if (!ll){
    showMessage('坐标格式不正确，请输入“纬度, 经度”，例如：48.25292, 37.22646');
    return;
  }

  map.setView([ll.lat, ll.lng]); // 如果需要固定缩放：, 13

  if (!window.geoMarker){
    window.geoMarker = L.marker([ll.lat, ll.lng]).addTo(map);
  } else {
    window.geoMarker.setLatLng([ll.lat, ll.lng]);
  }
}

// 点击按钮或按回车触发定位
if (geoGoBtn) geoGoBtn.onclick = goToLatLng;
if (geoInput){
  geoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') goToLatLng();
  });
}

/* ===================== 信息面板（计算与渲染） ===================== */

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
  liberated:       { label: '已解放',         color: '#12b886' },
  gray:            { label: '交战区',         color: '#9e9e9e' }
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

  // 百分比口径
  const denomAfter = Math.max(BASE - B, 1);
  const pctAfter   = A / denomAfter;

  const pctBefore  = B / BASE;

  const T          = A + B;
  const pctTotal   = T / BASE;

  const denomLib   = Math.max(T, 1);
  const pctLib     = L / denomLib;

  // 变化量
  const dA = A - A_prev;
  const dB = B - B_prev;
  const dT = T - (A_prev + B_prev);
  const dL = L - L_prev;

  // 渲染
  const wrap = document.getElementById('info-content');
  if (!wrap) return;
  wrap.innerHTML = '';

  const LBL_AFTER  = '全面入侵后被占';
  const LBL_BEFORE = '全面入侵前被占';
  const LBL_LIB    = '已解放';
  const LBL_TOTAL  = '总暂时被占';

  const C_AFTER  = '#E60000';
  const C_BEFORE = '#6f2dbd';
  const C_LIB    = '#12b886';
  const C_TOTAL  = '#ff3232';

  addRow(wrap, LBL_AFTER,  C_AFTER,  A, pctAfter, dA);
  addRow(wrap, LBL_BEFORE, C_BEFORE, B, pctBefore, dB);
  addRow(wrap, LBL_LIB,    C_LIB,    L, pctLib,   dL);
  addRow(wrap, LBL_TOTAL,  C_TOTAL,  T, pctTotal, dT);   // 样式统一
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

/* ===================== 右键 / 长按：在该点放置定位标记并显示坐标 ===================== */

// 复用与 🌐 搜索同一个标记（如果你前面已有 geoMarker，就不会重复声明）
window.geoMarker = window.geoMarker || null;

// 小工具：WGS-84 显示、MGRS 转换（mgrs 库可选）
function fmtWGS84(latlng) {
  return `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
}
function toMGRS(latlng) {
  try {
    if (window.mgrs) return window.mgrs.forward([latlng.lng, latlng.lat], 5);
  } catch (_) {}
  return '—';
}

// 生成弹窗 DOM（带复制按钮）
function buildCoordPopup(latlng) {
  const wgs = fmtWGS84(latlng);
  const mgrs = toMGRS(latlng);

  const wrap = document.createElement('div');
  wrap.className = 'coord-card';
  wrap.innerHTML = `
    <div class="coord-title">坐标（左键关闭）</div>
    <div class="coord-row">
      <div class="coord-label">WGS-84</div>
      <div class="coord-value">${wgs}</div>
      <button class="coord-copy" data-copy="${wgs}" title="复制">📋</button>
    </div>
    <div class="coord-row">
      <div class="coord-label">MGRS</div>
      <div class="coord-value">${mgrs}</div>
      <button class="coord-copy" data-copy="${mgrs}" title="复制">📋</button>
    </div>
  `;
  // 绑定复制
  wrap.querySelectorAll('.coord-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const txt = btn.getAttribute('data-copy') || '';
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(txt);
      } else {
        // 兜底
        const ta = document.createElement('textarea');
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
    });
  });
  return wrap;
}

// 在指定点放置/移动标记并弹出坐标卡片
function dropMarkerAt(latlng) {
  if (!window.geoMarker) {
    window.geoMarker = L.marker(latlng).addTo(map);
  } else {
    window.geoMarker.setLatLng(latlng);
  }
  const content = buildCoordPopup(latlng);
  window.geoMarker.bindPopup(content, {
    className: 'coord-popup',
    closeButton: false,
    autoPan: true,
    maxWidth: 280
  }).openPopup();
}

// —— 桌面：右键（Leaflet 会发 contextmenu 事件） —— //
// 右键生成坐标
map.on('contextmenu', (e) => {
  if (drawActive) { // 绘图时禁用右键生成坐标
    e.originalEvent?.preventDefault?.();
    return;
  }
  e.originalEvent?.preventDefault?.();
  dropMarkerAt(e.latlng);
});

// 屏蔽浏览器默认右键菜单：绘图时也屏蔽
map.getContainer().addEventListener('contextmenu', (ev) => {
  if (drawActive) { ev.preventDefault(); return; }
  // 非绘图状态就按你原来的处理（你原来也是 preventDefault）
  ev.preventDefault();
}, { passive: false });

// —— 移动端：长按 —— //
let __lpTimer = null;
let __lpLatLng = null;

map.on('touchstart', (e) => {
  if (drawActive) return; // 绘图时禁用长按生成坐标
  const touch = e.originalEvent.touches[0];
  if (!touch) return;
  __lpLatLng = map.mouseEventToLatLng(touch);
  clearTimeout(__lpTimer);
  __lpTimer = setTimeout(() => {
    if (__lpLatLng) dropMarkerAt(__lpLatLng);
    __lpTimer = null;
  }, 600);
});

map.on('touchmove', (e) => {
  const touch = e.originalEvent.touches[0];
  if (!touch) return;
  __lpLatLng = map.mouseEventToLatLng(touch); // 跟随手指刷新候选点
});

map.on('touchend touchcancel', () => {
  clearTimeout(__lpTimer);
  __lpTimer = null;
  __lpLatLng = null;
});

map.on('click', (e) => {
  if (rulerActive) return; // ← Ruler 模式下，click 被用来加点，不删 pin
  if (window.geoMarker){
    try{ window.geoMarker.remove(); }catch{ map.removeLayer(window.geoMarker); }
    window.geoMarker = null;
  }
});
