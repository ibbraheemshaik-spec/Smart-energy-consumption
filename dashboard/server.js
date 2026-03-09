// ============================================================
//  IoT Dashboard – Serial-to-WebSocket Bridge
//  ESP32 AC Voltage / Current Monitor
// ============================================================
//  ⚙️  CONFIGURE YOUR COM PORT BELOW  ⚙️
const COM_PORT = 'COM3';   // <-- Change to your ESP32 port (e.g. COM5, COM8)
const BAUD_RATE = 115200;
const HTTP_PORT = 3000;
// ============================================================

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const path = require('path');

// ── Express + HTTP server ────────────────────────────────────
const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, 'public')));

// ── WebSocket server ─────────────────────────────────────────
const wss = new WebSocket.Server({ server });

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// ── Serial port setup ─────────────────────────────────────────
let serialConnected = false;
let pendingVoltage = null;
let pendingCurrent = null;

function connectSerial() {
  let port;
  try {
    port = new SerialPort({ path: COM_PORT, baudRate: BAUD_RATE });
  } catch (err) {
    console.error(`[Serial] Cannot open ${COM_PORT}:`, err.message);
    broadcast({ type: 'serialStatus', connected: false, error: err.message });
    setTimeout(connectSerial, 5000);
    return;
  }

  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

  port.on('open', () => {
    serialConnected = true;
    console.log(`[Serial] Opened ${COM_PORT} @ ${BAUD_RATE} baud`);
    broadcast({ type: 'serialStatus', connected: true });
  });

  port.on('error', err => {
    console.error('[Serial] Error:', err.message);
    broadcast({ type: 'serialStatus', connected: false, error: err.message });

    // Auto-retry if port was denied or disconnected
    if (!serialConnected) {
      console.warn('[Serial] Port error while disconnected. Retrying in 5s…');
      setTimeout(connectSerial, 5000);
    }
  });

  port.on('close', () => {
    serialConnected = false;
    console.warn('[Serial] Port closed. Retrying in 5s…');
    broadcast({ type: 'serialStatus', connected: false });
    setTimeout(connectSerial, 5000);
  });

  // ── Parse lines from Arduino ──────────────────────────────
  parser.on('data', rawLine => {
    const line = rawLine.trim();

    // Broadcast raw line to Serial Monitor panel
    broadcast({ type: 'raw', line });
    console.log('[Serial]', line);

    // Parse "V: 230.40" or "I: 1.23" anywhere in the line
    const vMatch = line.match(/V:\s*([\d.]+)/);
    const iMatch = line.match(/I:\s*([\d.]+)/);

    if (vMatch) {
      pendingVoltage = parseFloat(vMatch[1]);
    }
    if (iMatch) {
      pendingCurrent = parseFloat(iMatch[1]);
    }

    // Once we have both, send a reading packet
    if (pendingVoltage !== null && pendingCurrent !== null) {
      const voltage = pendingVoltage;
      const current = pendingCurrent;
      const power = parseFloat((voltage * current).toFixed(2));
      const ts = new Date().toLocaleTimeString();

      console.log(`[Packet dispatched] V: ${voltage}, I: ${current}, P: ${power}`);
      broadcast({ type: 'reading', voltage, current, power, ts });

      // Send to Python ML bridge
      if (pyProcess && !pyProcess.killed) {
        pyProcess.stdin.write(JSON.stringify({ voltage, current }) + '\n');
      }

      pendingVoltage = null;
      pendingCurrent = null;
    }
  });
}

// ── Python ML Bridge ─────────────────────────────────────────
const { spawn } = require('child_process');
const pyPath = path.join(__dirname, '../iot_ml/ml_bridge.py');
const pyCwd = path.join(__dirname, '../iot_ml');

console.log(`[ML] Starting Python bridge at ${pyPath}...`);
const pyProcess = spawn('python', [pyPath], { cwd: pyCwd });

pyProcess.stdout.on('data', data => {
  const lines = data.toString().split('\n');
  lines.forEach(line => {
    line = line.trim();
    if (!line) return;
    if (line === 'READY') {
      console.log('[ML] Python ML bridge is ready.');
      return;
    }
    try {
      const msg = JSON.parse(line);
      if (msg.status) {
        broadcast({ type: 'mlStatus', status: msg.status });
      }
    } catch (e) {
      // Ignore non-json stdout from python
      console.log(`[ML Log] ${line}`);
    }
  });
});

pyProcess.stderr.on('data', data => {
  console.error(`[ML Error] ${data.toString().trim()}`);
});

pyProcess.on('close', code => {
  console.log(`[ML] Python process exited with code ${code}`);
});

// ── WebSocket: send current serial status on connect ─────────
wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'serialStatus', connected: serialConnected }));
  console.log('[WS] Client connected');
});

// ── Start ────────────────────────────────────────────────────
server.listen(HTTP_PORT, () => {
  console.log(`\n🌐  Dashboard → http://localhost:${HTTP_PORT}`);
  console.log(`🔌  Connecting to ${COM_PORT}...\n`);
  connectSerial();
});
