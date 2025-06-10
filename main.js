const currentDateEl = document.getElementById('current-date');
const datePicker = document.getElementById('date-picker');
const calendarPopup = document.getElementById('calendar-popup');

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

// 底图
// 卫星底图
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri'
}).addTo(map);

// 地名注记覆盖层
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Labels © Esri',
  pane: 'overlayPane'  // 保证显示在图层上方
}).addTo(map);

// 当前图层引用（全局变量）
let currentLayer = null;

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

// 初始化为最新日期（由 latest.json 提供）
fetch("data/latest.json")
  .then(res => res.json())
  .then(obj => {
    const [yyyy, mm, dd] = obj.date.split('-');
    updateDate(new Date(Number(yyyy), Number(mm) - 1, Number(dd)));
  })
  .catch(() => {
    // 如果 latest.json 加载失败，默认使用今天
    updateDate(new Date());
  });

// 加载前线图层
function loadDataForDate(dateStr) {
  const iso = toIsoDate(parseDate(dateStr));
  const url = `data/frontline-${iso}.json`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (window.currentLayer) {
        map.removeLayer(window.currentLayer);
      }

      window.currentLayer = L.geoJSON(data, {
        style: feature => {
          const name = feature.properties.Name?.toLowerCase(); // 关键在这里
          if (name === 'red') return { color: 'red', fillOpacity: 0.25, weight: 0 };
          if (name === 'contested') return { color: 'white', fillOpacity: 0.25, weight: 0 };
          if (name === 'dpr') return { color: 'purple', fillOpacity: 0.3, weight: 0 };
          return { color: 'black', fillOpacity: 0.3 };
        }
      }).addTo(map);

    })
    .catch(() => {
      console.warn('地图数据加载失败：' + url);
      if (window.currentLayer) {
        map.removeLayer(window.currentLayer);
        window.currentLayer = null;
      }
    });
}

// 设置日期并更新 UI + 地图
function updateDate(date) {
  const formatted = formatDate(date);
  currentDateEl.textContent = formatted;
  datePicker.value = toIsoDate(date);
  loadDataForDate(formatted);
}

// ← 前一天
document.getElementById('prev-day').onclick = () => {
  const date = parseDate(currentDateEl.textContent);
  date.setDate(date.getDate() - 1);
  updateDate(date);
};

// → 后一天
document.getElementById('next-day').onclick = () => {
  const date = parseDate(currentDateEl.textContent);
  date.setDate(date.getDate() + 1);
  updateDate(date);
};

// ⬇️ 日历弹出逻辑
document.getElementById('open-calendar').onclick = () => {
  calendarPopup.classList.toggle('hidden');
};

datePicker.onchange = () => {
  const [yyyy, mm, dd] = datePicker.value.split('-');
  updateDate(new Date(Number(yyyy), Number(mm) - 1, Number(dd)));
  calendarPopup.classList.add('hidden');
};

document.getElementById('today-button').onclick = () => {
  const today = new Date();
  updateDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  calendarPopup.classList.add('hidden');
};

document.getElementById('close-calendar').onclick = () => {
  calendarPopup.classList.add('hidden');
};

document.getElementById('jump-latest').onclick = () => {
  fetch("data/latest.json")
    .then(res => res.json())
    .then(obj => {
      const [yyyy, mm, dd] = obj.date.split('-');
      updateDate(new Date(Number(yyyy), Number(mm) - 1, Number(dd)));
    })
    .catch(() => {
      updateDate(new Date());
    });
};
