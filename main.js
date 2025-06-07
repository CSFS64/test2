const currentDateEl = document.getElementById('current-date');
const datePicker = document.getElementById('date-picker');
const calendarPopup = document.getElementById('calendar-popup');

// 地图初始化
const map = L.map('map', {
  zoomControl: false  // ⛔ 禁用缩放控件
}).setView([48.6, 37.9], 10);

L.control.scale({
  position: 'bottomleft',  // 默认就是 bottomleft，可省略
  imperial: true,         // 只显示米制
  metric: true,
  maxWidth: 100,
  updateWhenIdle: false
}).addTo(map);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// 日期格式工具
function formatDate(date) {
  return date.toLocaleDateString('en-GB').split('/').join('.');
}
function parseDate(str) {
  const [dd, mm, yyyy] = str.split('.');
  return new Date(${yyyy}-${mm}-${dd});
}
function toIsoDate(date) {
  return date.toISOString().split('T')[0];
}

// 加载数据函数（此处占位）
function loadDataForDate(dateStr) {
  console.log('加载地图图层：' + dateStr);
}

// 设置日期
function updateDate(date) {
  const formatted = formatDate(date);
  currentDateEl.textContent = formatted;
  datePicker.value = toIsoDate(date);
  loadDataForDate(formatted);
}

// 初始化为今天
updateDate(new Date());

// 控制按钮事件
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
  updateDate(new Date()); // 可以改成你的“最新有数据的日期”
};
