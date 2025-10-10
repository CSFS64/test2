const currentDateEl = document.getElementById('current-date');
const datePicker = document.getElementById('date-picker');
const calendarPopup = document.getElementById('calendar-popup');

let latestDate = null; // 🔹 记录最新可用日期
let currentLayer = null; // 当前图层
let availableDates = []; // 用于记录所有有更新的日期

// 初始化地图
const map = L.map('map', {
  zoomControl: false
}).setView([48.6, 37.9], 10);

// 比例尺
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

// 日期格式工具 (使用 UTC 时间格式)
function formatDate(date) {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${yyyy}-${mm}-${dd}`; // 改为 YYYY-MM-DD 格式
}

function parseDate(str) {
  const [yyyy, mm, dd] = str.split('-');
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd))); // 使用 UTC 解析
}

function toIsoDate(date){
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
  // 或者：return formatDate(date);
}

// 显示提醒
function showMessage(msg) {
  alert(msg);
}

// 加载图层
function loadDataForDate(dateStr) {
  const url = `data/frontline-${dateStr}.json`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (currentLayer) map.removeLayer(currentLayer);

      currentLayer = L.geoJSON(data, {
        style: feature => {
          const name = feature.properties.Name?.toLowerCase();
          if (name === 'dpr') return { color: 'purple', fillOpacity: 0.25, weight: 2 };
          if (name === 'red') return { color: '#E60000', fillOpacity: 0.2, weight: 1.5 };
          if (name === 'lib') return { color: '#00A2E8', fillOpacity: 0.2, weight: 1.5 };
          if (name === 'contested') return { color: 'white', fillOpacity: 0.25, weight: 0 };
          return { color: 'black', fillOpacity: 0.3 };
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

// 加载所有可用的更新日期
function loadAvailableDates() {
  fetch("data/latest.json")
    .then(res => res.json())
    .then(obj => {
      const [yyyy, mm, dd] = obj.date.split('-');
      latestDate = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
      latestDate.setHours(0, 0, 0, 0); // 清除时分秒，确保对比的是日期
      availableDates.push(latestDate); // 添加最新的日期
      datePicker.max = formatDate(latestDate);
      updateDate(latestDate);
    })
    .catch(() => {
      latestDate = new Date();
      updateDate(latestDate);
    });

  // 加载其他所有的日期
  fetch("data/available-dates.json")
    .then(res => res.json())
    .then(dates => {
      // 解析所有日期，并排序
      availableDates = dates.map(dateStr => {
        const [yyyy, mm, dd] = dateStr.split('-');
        return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
      }).sort((a, b) => a - b); // 升序排序
    });
}

// 设置并更新日期
function updateDate(date) {
  const formatted = formatDate(date);
  currentDateEl.textContent = formatted;
  datePicker.value = formatted;
  loadDataForDate(formatted);
  setSelectedUpdateItem(formatted);
}

// 初始化为 latest.json 日期
loadAvailableDates();

// ⬅️ 前一天
document.getElementById('prev-day').onclick = () => {
  const date = parseDate(currentDateEl.textContent);
  date.setUTCDate(date.getUTCDate() - 1);
  updateDate(date);
};

// ➡️ 后一天（直接跳转到下一天，不管是否有更新）
document.getElementById('next-day').onclick = () => {
  const date = parseDate(currentDateEl.textContent);
  date.setUTCDate(date.getUTCDate() + 1);
  updateDate(date); // 直接跳转到下一天
};

// 📅 打开日历
document.getElementById('open-calendar').onclick = () => {
  calendarPopup.classList.toggle('hidden');
};

// 📅 选择日期
datePicker.onchange = () => {
  const [yyyy, mm, dd] = datePicker.value.split('-');
  const selected = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));

  if (latestDate && selected > latestDate) {
    showMessage('当日暂未更新');
    updateDate(latestDate);
  } else {
    updateDate(selected);
  }
  calendarPopup.classList.add('hidden');
};

// 📅 今天按钮
document.getElementById('today-button').onclick = () => {
  const today = new Date();
  const selected = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

  if (latestDate && selected > latestDate) {
    showMessage('当日暂未更新');
    updateDate(latestDate);
  } else {
    updateDate(selected);
  }
  calendarPopup.classList.add('hidden');
};

// ❌ 关闭日历
document.getElementById('close-calendar').onclick = () => {
  calendarPopup.classList.add('hidden');
};

// ⏩ 跳转最新
document.getElementById('jump-latest').onclick = () => {
  fetch("data/latest.json")
    .then(res => res.json())
    .then(obj => {
      const [yyyy, mm, dd] = obj.date.split('-');
      const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
      updateDate(date);
    })
    .catch(() => {
      updateDate(new Date());
    });
};

// 📦 绑定 🔔按钮逻辑
const bellButton = document.querySelector('.icon-group .icon:nth-child(3)');
const updatePanel = document.getElementById('update-panel');
const updateList = document.getElementById('update-list');
const closeUpdatePanel = document.getElementById('close-update-panel');

bellButton.onclick = () => {
  updatePanel.classList.toggle('hidden');
};

// ❌ 关闭按钮
closeUpdatePanel.onclick = () => {
  updatePanel.classList.add('hidden');
};

// 📥 加载更新数据（你可以从 JSON 文件加载）
const updates = [
  { date: "2025-10-09", summary: "利曼：俄军在Yampil方向取得了部分成功；俄军向Serebryanka西部渗透；西维尔斯克：乌克兰国防军在Verkhnokamyanske的反击取得了成功；澄清了Novoselivka附近的前线；俄军在Vyimka方向取得了部分成功；康斯坦丁尼夫卡：澄清了卡索夫亚尔的前线；俄军在Predtechyne方向取得了部分成功；澄清了Kleban-Byk附近的前线；波克罗夫斯克：乌克兰国防军在Novotoreske的反击取得了成功" },
  { date: "2025-10-03", summary: "乌克兰武装部队在Boikivka方向取得了成功；更新了波克罗夫斯克（第聂伯彼得罗夫斯克州）方向的前线" },
  { date: "2025-09-14", summary: "乌克兰武装部队在Kindrativka（苏梅）附近推进；乌克兰武装部队清除了库普扬斯克的俄军；乌克兰武装部队解放了Pankivka（波克罗夫斯克）" },
  { date: "2025-09-07", summary: "澄清了库普扬斯克北部的情况；俄军向Zarichne推进；澄清了Katerynivka附近的情况；澄清了Yablunivka附近的情况；乌克兰武装部队解放了Volodimyrivka并向南部推进；澄清了Novotoreske附近的情况；俄军向利曼（波克罗夫斯克）推进；乌克兰武装部队向Razine方向推进" },
  { date: "2025-09-02", summary: "更新了波克罗夫斯克方向的交战区和解放区域" },
  { date: "2025-09-01", summary: "更新了托列茨克至赫尔松的接触线，剩余部分制作中；俄军在Bila Hora方向取得了部分成功" },
  { date: "2025-08-31", summary: "更新了苏梅至托列茨克方向的前线，剩余部分制作中..." }
];

// 渲染更新列表
updates.forEach(item => {
  const div = document.createElement('div');
  div.className = 'update-item';
  div.textContent = `${item.date}：${item.summary}`;
  div.onclick = () => {
    const [yyyy, mm, dd] = item.date.split('-');
    const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    updateDate(date);
    updatePanel.classList.add('hidden');
  };
  updateList.appendChild(div);
});

syncSelectedToList();

/* ===== 永久选中高亮 ===== */

/** 让列表中对应日期的条目高亮，并在必要时滚动到可见 */
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

    // 如果不在可视区，就滚到“尽量靠近中间”的位置
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

/* 在面板首次打开或重新渲染时，把当前日期对应项设为选中 */
function syncSelectedToList(){
  const dateStr = document.getElementById('current-date')?.textContent?.trim();
  if (dateStr) setSelectedUpdateItem(dateStr);
}
