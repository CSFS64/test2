const currentDateEl = document.getElementById('current-date');
const datePicker = document.getElementById('date-picker');
const calendarPopup = document.getElementById('calendar-popup');

let latestDate = null; // 🔹 记录最新可用日期
let currentLayer = null; // 当前图层

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

// 日期格式工具
function formatDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}
function parseDate(str) {
  const [dd, mm, yyyy] = str.split('.');
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}
function toIsoDate(date) {
  return date.toISOString().split('T')[0];
}

// 显示提醒
function showMessage(msg) {
  alert(msg); // 可以替换为你网站样式更合适的弹窗系统
}

// 加载图层
function loadDataForDate(dateStr) {
  const iso = toIsoDate(parseDate(dateStr));
  const url = `data/frontline-${iso}.json`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (currentLayer) map.removeLayer(currentLayer);

      currentLayer = L.geoJSON(data, {
        style: feature => {
          const name = feature.properties.Name?.toLowerCase();
          if (name === 'red') return { color: 'red', fillOpacity: 0.25, weight: 0 };
          if (name === 'lib') return { color: 'blue', fillOpacity: 0.25, weight: 0 };
          if (name === 'contested') return { color: 'white', fillOpacity: 0.25, weight: 0 };
          if (name === 'dpr') return { color: 'purple', fillOpacity: 0.3, weight: 0 };
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

// 设置并更新日期
function updateDate(date) {
  const formatted = formatDate(date);
  currentDateEl.textContent = formatted;
  datePicker.value = toIsoDate(date);
  loadDataForDate(formatted);
}

// 初始化为 latest.json 日期
fetch("data/latest.json")
  .then(res => res.json())
  .then(obj => {
    const [yyyy, mm, dd] = obj.date.split('-');
    latestDate = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    datePicker.max = toIsoDate(latestDate); // 限制日历最大值
    updateDate(latestDate);
  })
  .catch(() => {
    latestDate = new Date();
    updateDate(latestDate);
  });

// ⬅️ 前一天
document.getElementById('prev-day').onclick = () => {
  const date = parseDate(currentDateEl.textContent);
  date.setDate(date.getDate() - 1);
  updateDate(date);
};

// ➡️ 后一天（不能超过 latestDate）
document.getElementById('next-day').onclick = () => {
  const date = parseDate(currentDateEl.textContent);
  date.setDate(date.getDate() + 1);
  if (latestDate && date > latestDate) {
    showMessage('当日暂未更新');
    return;
  }
  updateDate(date);
};

// 📅 打开日历
document.getElementById('open-calendar').onclick = () => {
  calendarPopup.classList.toggle('hidden');
};

// 📅 选择日期
datePicker.onchange = () => {
  const [yyyy, mm, dd] = datePicker.value.split('-');
  const selected = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
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
  const selected = new Date(today.getFullYear(), today.getMonth(), today.getDate());
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
      const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      updateDate(date);
    })
    .catch(() => {
      updateDate(new Date());
    });
};
