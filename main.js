const currentDateEl = document.getElementById('current-date');
const datePicker = document.getElementById('date-picker');
const calendarPopup = document.getElementById('calendar-popup');

let latestDate = null; // 最新图层日期
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

// 卫星图层 + 注记
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri'
}).addTo(map);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Labels © Esri',
  pane: 'overlayPane'
}).addTo(map);

// 日期工具
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

// 弹窗消息
function showMessage(msg) {
  alert(msg);
}

// 加载数据图层
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
          if (name === 'red') return { color: 'red', fillOpacity: 0.2, weight: 0 };
          if (name === 'lib') return { color: 'blue', fillOpacity: 0.2, weight: 0 };
          if (name === 'contested') return { color: 'white', fillOpacity: 0.25, weight: 0 };
          if (name === 'dpr') return { color: 'purple', fillOpacity: 0.25, weight: 0 };
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

// 设置并更新当前日期
function updateDate(date) {
  const formatted = formatDate(date);
  currentDateEl.textContent = formatted;
  datePicker.value = toIsoDate(date);
  loadDataForDate(formatted);
  localStorage.setItem('lastViewedDate', toIsoDate(date));
}

// 初始化 latest.json
fetch("data/latest.json")
  .then(res => res.json())
  .then(obj => {
    const [yyyy, mm, dd] = obj.date.split('-');
    latestDate = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    datePicker.max = toIsoDate(latestDate);

    const lastViewed = localStorage.getItem('lastViewedDate');
    const lastDate = lastViewed ? new Date(lastViewed) : latestDate;

    updateDate(lastDate);

    if (toIsoDate(lastDate) !== toIsoDate(latestDate)) {
      setTimeout(() => {
        showMessage("发现更新！");
      }, 300);
    }
  })
  .catch(() => {
    latestDate = new Date();
    updateDate(latestDate);
  });

// 控制按钮逻辑
document.getElementById('prev-day').onclick = () => {
  const date = parseDate(currentDateEl.textContent);
  date.setDate(date.getDate() - 1);
  updateDate(date);
};

document.getElementById('next-day').onclick = () => {
  const date = parseDate(currentDateEl.textContent);
  date.setDate(date.getDate() + 1);
  if (latestDate && date > latestDate) {
    showMessage('当日暂未更新');
    return;
  }
  updateDate(date);
};

document.getElementById('open-calendar').onclick = () => {
  calendarPopup.classList.toggle('hidden');
};

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

document.getElementById('close-calendar').onclick = () => {
  calendarPopup.classList.add('hidden');
};

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

// 🔔 更新按钮逻辑
const bellButton = document.querySelector('.icon-group .icon:nth-child(3)');
const updatePanel = document.getElementById('update-panel');
const updateList = document.getElementById('update-list');
const closeUpdatePanel = document.getElementById('close-update-panel');

bellButton.onclick = () => {
  updatePanel.classList.toggle('hidden');
};

closeUpdatePanel.onclick = () => {
  updatePanel.classList.add('hidden');
};

// 模拟更新数据（你可以替换为 fetch 外部 JSON）
const updates = [
  { date: "2025-06-09", summary: "更新苏梅、卢甘茨克方向前线和顿涅茨克部分方向前线" },
  { date: "2025-06-08", summary: "更新哈尔科夫方向前线" }
];

updates.forEach(item => {
  const div = document.createElement('div');
  div.className = 'update-item';
  div.textContent = `${item.date}：${item.summary}`;
  div.onclick = () => {
    const [yyyy, mm, dd] = item.date.split('-');
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    updateDate(date);
    updatePanel.classList.add('hidden');
  };
  updateList.appendChild(div);
});
