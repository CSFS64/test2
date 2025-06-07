const map = L.map('map').setView([48.6, 37.9], 10);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

const currentDateEl = document.getElementById('current-date');
const datePicker = document.getElementById('date-picker');
const calendarPopup = document.getElementById('calendar-popup');

// 工具函数
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

// 加载数据（你可以改成加载 JSON 图层）
function loadDataForDate(dateStr) {
  console.log(`加载前线数据：${dateStr}`);
}

// 日期切换逻辑
function updateDate(date) {
  const formatted = formatDate(date);
  currentDateEl.textContent = formatted;
  datePicker.value = toIsoDate(date);
  loadDataForDate(formatted);
}

// 初始化为今天
updateDate(new Date());

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
