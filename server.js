const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { exec } = require('child_process');
const http = require('http');

// Environment variables
const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'changeme';

// Workspace directory – this is where user files live.
const WORKSPACE_ROOT = path.join(__dirname, 'workspace');
if (!fs.existsSync(WORKSPACE_ROOT)) {
  fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
}

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: '*'
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Helper: check token from headers or query
function checkAuth(req, res, next) {
  const token = req.headers['x-auth-token'] || req.query.token;
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Helper: resolve safe file paths within workspace
function resolvePath(userPath) {
  const safePath = path.normalize('/' + userPath).replace(/^\/+/,'');
  const fullPath = path.join(WORKSPACE_ROOT, safePath);
  if (!fullPath.startsWith(WORKSPACE_ROOT)) {
    throw new Error('Invalid path');
  }
  return fullPath;
}

// API: list files and directories
app.get('/api/files', checkAuth, (req, res) => {
  const dir = req.query.path || '';
  let target;
  try {
    target = resolvePath(dir);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  fs.readdir(target, { withFileTypes: true }, (err, entries) => {
    if (err) return res.status(500).json({ error: err.message });
    const result = entries.map(e => ({ name: e.name, isDir: e.isDirectory() }));
    res.json(result);
  });
});

// Configure multer for file uploads
const upload = multer({ dest: path.join(__dirname, 'tmp_uploads') });

// API: upload a file
app.post('/api/files/upload', checkAuth, upload.single('file'), (req, res) => {
  const destDir = req.query.path || '';
  let targetDir;
  try {
    targetDir = resolvePath(destDir);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const tmpPath = req.file.path;
  const destPath = path.join(targetDir, req.file.originalname);
  fs.rename(tmpPath, destPath, err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// API: download a file
app.get('/api/files/download', checkAuth, (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  let target;
  try {
    target = resolvePath(filePath);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  res.download(target);
});

// API: delete a file or directory
app.delete('/api/files', checkAuth, (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  let target;
  try {
    target = resolvePath(filePath);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  fs.rm(target, { recursive: true, force: true }, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// API: create a directory
app.post('/api/files/mkdir', checkAuth, (req, res) => {
  const dirPath = req.query.path;
  if (!dirPath) return res.status(400).json({ error: 'path required' });
  let target;
  try {
    target = resolvePath(dirPath);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  fs.mkdir(target, { recursive: true }, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// API: execute a script/command
app.post('/api/execute', checkAuth, (req, res) => {
  const { language, code } = req.body;
  if (!language || !code) {
    return res.status(400).json({ error: 'language and code required' });
  }
  // Determine interpreter
  let cmd;
  switch (language) {
    case 'node':
      cmd = `node -e ${JSON.stringify(code)}`;
      break;
    case 'python':
      cmd = `python -c ${JSON.stringify(code)}`;
      break;
    case 'bash':
      cmd = code;
      break;
    default:
      return res.status(400).json({ error: 'Unsupported language' });
  }
  exec(cmd, { cwd: WORKSPACE_ROOT, timeout: 10000 }, (error, stdout, stderr) => {
    if (error) {
      return res.json({ stdout, stderr: error.message + '\n' + stderr });
    }
    res.json({ stdout, stderr });
  });
});

// Socket.io: manage real‑time events
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token !== AUTH_TOKEN) {
    return next(new Error('Unauthorized'));
  }
  next();
});

io.on('connection', socket => {
  console.log('Socket connected');

  // Example events: log from client, broadcast to others
  socket.on('log', msg => {
    socket.broadcast.emit('log', msg);
  });

  // Relay code preview updates
  socket.on('preview-update', html => {
    socket.broadcast.emit('preview-update', html);
  });

  // Placeholder for GUI stream events (to be implemented with WebRTC)
  socket.on('gui-frame', data => {
    // Broadcast to watchers
    socket.broadcast.emit('gui-frame', data);
  });
});

server.listen(PORT, () => {
  console.log(`Cloud IDE server running on port ${PORT}`);
});
