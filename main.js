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

/* ===================== 更新面板（打开/关闭） ===================== */
const bellButton        = document.querySelector('.icon-group .icon:nth-child(3)');
const updatePanel       = document.getElementById('update-panel');
const updateList        = document.getElementById('update-list');
const closeUpdatePanel  = document.getElementById('close-update-panel');

if (bellButton && updatePanel) {
  bellButton.onclick = () => updatePanel.classList.toggle('hidden');
}
if (closeUpdatePanel && updatePanel) {
  closeUpdatePanel.onclick = () => updatePanel.classList.add('hidden');
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
      updatePanel?.classList.add('hidden');
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

  // 清除旧的选中
  list.querySelectorAll('.update-item.selected').forEach(el => el.classList.remove('selected'));

  // 找到“YYYY-MM-DD：”开头的那条
  const item = Array.from(list.querySelectorAll('.update-item'))
    .find(el => el.textContent.trim().startsWith(dateStr + '：'));

  if (item){
    item.classList.add('selected');

    // 滚动到“接近中间”的位置
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;

    if (top < viewTop || bottom > viewBottom){
      list.scrollTo({
        top: Math.max(0, top - (list.clientHeight - item.offsetHeight) / 2),
        behavior: 'smooth'
      });
    }
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
