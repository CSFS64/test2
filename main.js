const currentDateEl = document.getElementById('current-date');
const datePicker = document.getElementById('date-picker');
const calendarPopup = document.getElementById('calendar-popup');

// 地图初始化
const map = L.map('map', {
  zoomControl: false
}).setView([48.6, 37.9], 10);

L.control.scale({
  position: 'bottomleft',
  imperial: true,
  metric: true,
  maxWidth: 100,
  updateWhenIdle: false
}).addTo(map);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// 日期工具
function formatDate(date) {
  return date.toLocaleDateString('en-GB').split('/').join('.');
}
function parseDate(str) {
  const [dd, mm, yyyy] = str.split('.');
  return new Date(`${yyyy}-${mm}-${dd}`);
}
function toIsoDate(date) {
  return date.toISOString().split('T')[0];
}

function loadDataForDate(dateStr) {
  console.log('加载地图图层：' + dateStr);
}

function updateDate(date) {
  const formatted = formatDate(date);
  currentDateEl.textContent = formatted;
  datePicker.value = toIsoDate(date);
  loadDataForDate(formatted);
}

// 初始化日期
updateDate(new Date());

// 日期控制
document.getElementById('prev-day').onclick = () => {
  const date = parseDate(currentDateEl.textContent);
  date.setDate(date.getDate() - 1);
  updateDate(date);
};

document.getElementById('next-day').onclick = () => {
  const date = parseDate(currentDateEl.textContent);
  date.setDate(date.getDate() + 1);
  updateDate(date);
};

document.getElementById('open-calendar').onclick = () => {
  calendarPopup.classList.toggle('hidden');
};

datePicker.onchange = () => {
  updateDate(new Date(datePicker.value));
  calendarPopup.classList.add('hidden');
};

document.getElementById('today-button').onclick = () => {
  updateDate(new Date());
  calendarPopup.classList.add('hidden');
};

document.getElementById('close-calendar').onclick = () => {
  calendarPopup.classList.add('hidden');
};

document.getElementById('jump-latest').onclick = () => {
  updateDate(new Date());
};

// 自动缩放 UI wrapper
function applyUIScale() {
  const height = window.innerHeight;
  const scale = Math.min(1, height / 850);
  document.getElementById('ui-wrapper').style.transform = `scale(${scale})`;
}

window.addEventListener('resize', applyUIScale);
window.addEventListener('DOMContentLoaded', applyUIScale);
