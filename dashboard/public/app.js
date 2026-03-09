// ── app.js – Real-time IoT Dashboard Client ─────────────────────

const WS_URL = location.protocol === 'file:' ? 'ws://localhost:3000' : `ws://${location.host}`;
const MAX_POINTS = 40;   // chart history length

// ── Element refs ───────────────────────────────────────────────
const voltageEl = document.getElementById('voltageVal');
const currentEl = document.getElementById('currentVal');
const powerEl = document.getElementById('powerVal');
const voltBar = document.getElementById('voltBar');
const currBar = document.getElementById('currBar');
const powBar = document.getElementById('powBar');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const lastUpEl = document.getElementById('lastUpdated');
const serialLog = document.getElementById('serialLog');
const lcdRow0 = document.getElementById('lcdRow0');
const lcdRow1 = document.getElementById('lcdRow1');

// ── Chart setup ────────────────────────────────────────────────
const ctx = document.getElementById('liveChart').getContext('2d');

const makeDataset = (label, color) => ({
  label,
  data: [],
  borderColor: color,
  backgroundColor: color + '18',
  borderWidth: 2,
  pointRadius: 3,
  pointBackgroundColor: color,
  tension: 0.45,
  fill: true,
});

const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      makeDataset('Voltage (V)', '#60a5fa'),
      makeDataset('Current (A)', '#34d399'),
      makeDataset('Power (W)', '#fbbf24'),
    ],
  },
  options: {
    animation: { duration: 500 },
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(5,11,24,0.92)',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        titleFont: { family: 'Outfit', size: 12 },
        bodyFont: { family: 'JetBrains Mono', size: 11 },
        callbacks: {
          label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}`
        }
      }
    },
    scales: {
      x: {
        ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 8 },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
      y: {
        ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } },
        grid: { color: 'rgba(255,255,255,0.05)' },
        beginAtZero: true,
      }
    }
  }
});

// ── Helpers ────────────────────────────────────────────────────
function animateMetric(el, value, decimals = 1) {
  el.textContent = value.toFixed(decimals);
  el.classList.remove('pop');
  void el.offsetWidth;           // reflow to restart animation
  el.classList.add('pop');
  setTimeout(() => el.classList.remove('pop'), 300);
}

function setBar(barEl, value, max) {
  const pct = Math.min(100, (value / max) * 100);
  barEl.style.width = `${pct}%`;
}

function pushChart(ts, voltage, current, power) {
  const labels = chart.data.labels;
  labels.push(ts);
  chart.data.datasets[0].data.push(voltage);
  chart.data.datasets[1].data.push(current);
  chart.data.datasets[2].data.push(power);

  if (labels.length > MAX_POINTS) {
    labels.shift();
    chart.data.datasets.forEach(ds => ds.data.shift());
  }
  chart.update();
}

function addSerialLine(line, cls = '') {
  const placeholder = serialLog.querySelector('.serial-placeholder');
  if (placeholder) placeholder.remove();

  const span = document.createElement('span');
  span.className = `serial-line ${cls}`;

  // Timestamp prefix
  const ts = document.createElement('span');
  ts.className = 'ts';
  ts.textContent = `[${new Date().toLocaleTimeString()}] `;
  span.appendChild(ts);
  span.appendChild(document.createTextNode(line));

  serialLog.appendChild(span);
  serialLog.scrollTop = serialLog.scrollHeight;

  // Keep max 200 lines
  while (serialLog.children.length > 200) serialLog.removeChild(serialLog.firstChild);
}

function setConnectionStatus(connected, errorMsg) {
  if (connected) {
    statusDot.className = 'status-dot connected';
    statusText.textContent = 'Connected';
  } else {
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = errorMsg ? 'Serial Error' : 'Disconnected';
    if (errorMsg) addSerialLine(`⚠️  ${errorMsg}`, '');
  }
}

// ── LCD helper ─────────────────────────────────────────────────
function updateLCD(voltage, current) {
  const vStr = `V:${voltage.toFixed(1)}V`;
  const iStr = `I:${current.toFixed(2)}A`;
  // Pad to 16 chars (LCD width)
  lcdRow0.textContent = vStr.padEnd(16);
  lcdRow1.textContent = iStr.padEnd(16);
}

// ── WebSocket connection ────────────────────────────────────────
let ws;
let reconnectTimer;

function connectWS() {
  clearTimeout(reconnectTimer);
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[WS] connected');
  };

  ws.onclose = () => {
    console.warn('[WS] disconnected, retrying in 3s…');
    setConnectionStatus(false);
    reconnectTimer = setTimeout(connectWS, 3000);
  };

  ws.onerror = err => {
    console.error('[WS] error', err);
  };

  ws.onmessage = evt => {
    let msg;
    try { msg = JSON.parse(evt.data); } catch { return; }

    switch (msg.type) {

      case 'serialStatus':
        setConnectionStatus(msg.connected, msg.error);
        break;

      case 'raw': {
        // Detect line type for colouring
        let cls = '';
        if (/^V:/i.test(msg.line)) cls = 'v-line';
        else if (/^I:/i.test(msg.line)) cls = 'i-line';
        else if (/offset/i.test(msg.line)) cls = 'offset-line';
        addSerialLine(msg.line, cls);
        break;
      }

      case 'reading': {
        const { voltage, current, power, ts } = msg;

        // Cards
        animateMetric(voltageEl, voltage, 1);
        animateMetric(currentEl, current, 2);
        animateMetric(powerEl, power, 1);

        // Progress bars (max guesses: 260V, 20A, 5200W)
        setBar(voltBar, voltage, 260);
        setBar(currBar, current, 20);
        setBar(powBar, power, 5200);

        // Chart
        pushChart(ts, voltage, current, power);

        // LCD
        updateLCD(voltage, current);

        // Timestamp
        lastUpEl.textContent = `Updated: ${ts}`;
        break;
      }

      case 'mlStatus': {
        const mlValEl = document.getElementById('mlStatusVal');
        const statusBar = document.getElementById('statusBar');
        const alertBox = document.getElementById('emergencyAlert');

        mlValEl.textContent = msg.status;

        if (msg.status === 'High') {
          mlValEl.style.color = '#ef4444';
          mlValEl.style.textShadow = '0 0 20px rgba(239,68,68,0.4)';
          statusBar.style.background = 'linear-gradient(90deg, #ef4444, #fca5a5)';
          alertBox.style.display = 'block';
        } else {
          mlValEl.style.color = '#34d399';
          mlValEl.style.textShadow = '0 0 20px rgba(52,211,153,0.4)';
          statusBar.style.background = 'linear-gradient(90deg, #10b981, #6ee7b7)';
          alertBox.style.display = 'none';
        }
        break;
      }
    }
  };
}

// ── Clear buttons ───────────────────────────────────────────────
document.getElementById('clearChart').addEventListener('click', () => {
  chart.data.labels = [];
  chart.data.datasets.forEach(ds => ds.data = []);
  chart.update();
});

document.getElementById('clearSerial').addEventListener('click', () => {
  serialLog.innerHTML = '<div class="serial-placeholder">Waiting for data from ESP32…</div>';
});

// ── Boot ────────────────────────────────────────────────────────
connectWS();
