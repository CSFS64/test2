let currentLayers = [];

const map = L.map('map').setView([48.6, 37.9], 12);
L.tileLayer('https://tile.maptiler.com/maps/satellite/{z}/{x}/{y}.jpg?key=YOUR_MAPTILER_KEY', {
  attribution: '© MapTiler © OpenStreetMap contributors'
}).addTo(map);

function clearLayers() {
  currentLayers.forEach(layer => map.removeLayer(layer));
  currentLayers = [];
}

function loadDate(dateStr) {
  const path = `data/${dateStr}.json`;
  fetch(path)
    .then(res => {
      if (!res.ok) throw new Error('No data for this date');
      return res.json();
    })
    .then(json => {
      clearLayers();

      if (json.red) {
        const red = L.geoJSON(json.red, {
          style: { color: 'rgba(200, 0, 0, 0.4)', fillOpacity: 0.4 }
        }).addTo(map);
        currentLayers.push(red);
      }

      if (json.contested) {
        const contested = L.geoJSON(json.contested, {
          style: { color: 'orange', fillOpacity: 0.4 }
        }).addTo(map);
        currentLayers.push(contested);
      }
    })
    .catch(err => {
      alert('找不到该日期的数据。');
    });
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function getLatestDateFromDataFolder() {
  // 手动设置默认加载日期（你也可以用服务器端生成最新的）
  return '2025-06-06'; // 改成你当前的最新日期
}

const datePicker = document.getElementById('date-picker');
const prevBtn = document.getElementById('prev-date');
const nextBtn = document.getElementById('next-date');

function shiftDate(offset) {
  const date = new Date(datePicker.value);
  date.setDate(date.getDate() + offset);
  const newDateStr = formatDate(date);
  datePicker.value = newDateStr;
  loadDate(newDateStr);
}

datePicker.addEventListener('change', () => {
  loadDate(datePicker.value);
});

prevBtn.addEventListener('click', () => shiftDate(-1));
nextBtn.addEventListener('click', () => shiftDate(1));

// 默认加载最新日期
const defaultDate = getLatestDateFromDataFolder();
datePicker.value = defaultDate;
loadDate(defaultDate);
