// Global variables
let token = localStorage.getItem('authToken') || '';
let currentFile = null;
let editor;
let socket;

document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('tokenInput');
  const connectBtn = document.getElementById('connectBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const fileTree = document.getElementById('fileTree');
  const newFileBtn = document.getElementById('newFileBtn');
  const uploadBtn = document.getElementById('uploadBtn');
  const fileInput = document.getElementById('fileInput');
  const consoleEl = document.getElementById('console');
  const previewFrame = document.getElementById('previewFrame');

  // Initialize CodeMirror editor
  editor = CodeMirror(document.getElementById('editor'), {
    value: '',
    mode: 'javascript',
    theme: 'monokai',
    lineNumbers: true,
    viewportMargin: Infinity
  });

  // Load token into input if available
  tokenInput.value = token;

  connectBtn.addEventListener('click', () => {
    token = tokenInput.value.trim();
    if (!token) {
      alert('Token required');
      return;
    }
    localStorage.setItem('authToken', token);
    connectSocket();
    loadFileTree('');
  });

  refreshBtn.addEventListener('click', () => {
    loadFileTree('');
  });

  newFileBtn.addEventListener('click', () => {
    const fileName = prompt('New file name (relative to current directory):');
    if (!fileName) return;
    currentFile = fileName;
    editor.setValue('');
    updatePreview();
  });

  uploadBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (evt) => {
    const file = evt.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    fetch(`/api/files/upload?path=`, {
      method: 'POST',
      headers: { 'x-auth-token': token },
      body: formData
    })
      .then(res => res.json())
      .then(() => {
        loadFileTree('');
      })
      .catch(err => alert(err));
  });

  // Save on Ctrl+S
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentFile();
    }
  });

  // Execute code on Ctrl+Enter
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      runCurrentFile();
    }
  });

  /**
   * Connect to socket.io server with token
   */
  function connectSocket() {
    if (socket) {
      socket.disconnect();
    }
    socket = io({
      auth: { token }
    });
    socket.on('connect', () => {
      appendConsole('Connected to socket server');
    });
    socket.on('log', msg => {
      appendConsole(msg);
    });
    socket.on('preview-update', html => {
      previewFrame.srcdoc = html;
    });
    socket.on('gui-frame', data => {
      // Data could be image base64; display in preview for now
      const img = new Image();
      img.src = data;
      const doc = previewFrame.contentDocument;
      if (doc) {
        doc.body.innerHTML = '';
        doc.body.appendChild(img);
      }
    });
  }

  /**
   * Fetch and render file tree
   */
  function loadFileTree(dir) {
    fetch(`/api/files?path=${encodeURIComponent(dir)}`, {
      headers: { 'x-auth-token': token }
    })
      .then(res => res.json())
      .then(list => {
        fileTree.innerHTML = '';
        const ul = buildFileList(list, '');
        fileTree.appendChild(ul);
      })
      .catch(err => console.error(err));
  }

  /**
   * Build file tree recursively (flat for now)
   */
  function buildFileList(items, parentPath) {
    const ul = document.createElement('ul');
    ul.className = 'file-list';
    items.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item.name + (item.isDir ? '/' : '');
      li.dataset.path = parentPath ? parentPath + '/' + item.name : item.name;
      if (item.isDir) {
        li.style.fontWeight = 'bold';
        li.addEventListener('click', () => {
          // Load directory contents
          fetch(`/api/files?path=${encodeURIComponent(li.dataset.path)}`, {
            headers: { 'x-auth-token': token }
          })
            .then(res => res.json())
            .then(childList => {
              const childUl = buildFileList(childList, li.dataset.path);
              // Remove existing sibling ul if any
              const next = li.nextElementSibling;
              if (next && next.tagName === 'UL') next.remove();
              li.insertAdjacentElement('afterend', childUl);
            });
        });
      } else {
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          openFile(li.dataset.path);
        });
      }
      ul.appendChild(li);
    });
    return ul;
  }

  /**
   * Open a file and load into editor
   */
  function openFile(filePath) {
    fetch(`/api/files/download?path=${encodeURIComponent(filePath)}`, {
      headers: { 'x-auth-token': token }
    })
      .then(res => res.text())
      .then(text => {
        currentFile = filePath;
        editor.setValue(text);
        setEditorModeByFileName(filePath);
        updatePreview();
        appendConsole('Opened ' + filePath);
      })
      .catch(err => {
        console.error(err);
        appendConsole('Error: ' + err);
      });
  }

  /**
   * Save current file
   */
  function saveCurrentFile() {
    if (!currentFile) {
      alert('No file selected');
      return;
    }
    const blob = new Blob([editor.getValue()], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', new File([blob], currentFile.split('/').pop()));
    fetch(`/api/files/upload?path=${encodeURIComponent(getDir(currentFile))}`, {
      method: 'POST',
      headers: { 'x-auth-token': token },
      body: formData
    })
      .then(res => res.json())
      .then(() => {
        appendConsole('Saved ' + currentFile);
        loadFileTree('');
      })
      .catch(err => alert(err));
  }

  /**
   * Run current file (Node or Python based on extension)
   */
  function runCurrentFile() {
    if (!currentFile) {
      alert('No file selected');
      return;
    }
    const ext = currentFile.split('.').pop();
    let language;
    if (ext === 'js') language = 'node';
    else if (ext === 'py') language = 'python';
    else if (ext === 'sh') language = 'bash';
    else {
      alert('Unsupported file type for execution');
      return;
    }
    const code = editor.getValue();
    fetch('/api/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token
      },
      body: JSON.stringify({ language, code })
    })
      .then(res => res.json())
      .then(res => {
        appendConsole('----- RUN OUTPUT -----');
        if (res.stdout) appendConsole(res.stdout);
        if (res.stderr) appendConsole(res.stderr);
        appendConsole('----------------------');
      })
      .catch(err => alert(err));
  }

  /**
   * Append message to console
   */
  function appendConsole(msg) {
    consoleEl.textContent += msg + '\n';
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  /**
   * Determine editor mode based on file extension
   */
  function setEditorModeByFileName(name) {
    const ext = name.split('.').pop();
    let mode = 'javascript';
    if (ext === 'js') mode = 'javascript';
    else if (ext === 'py') mode = 'python';
    else if (ext === 'html') mode = 'htmlmixed';
    else if (ext === 'css') mode = 'css';
    editor.setOption('mode', mode);
  }

  /**
   * Extract directory part of a path
   */
  function getDir(path) {
    const idx = path.lastIndexOf('/');
    return idx === -1 ? '' : path.substring(0, idx);
  }

  /**
   * Update preview pane for HTML files
   */
  function updatePreview() {
    if (!currentFile) return;
    const ext = currentFile.split('.').pop();
    if (ext === 'html') {
      const html = editor.getValue();
      // send to server via socket for broadcasting
      if (socket) {
        socket.emit('preview-update', html);
      }
      previewFrame.srcdoc = html;
    }
  }

  // Update preview on content changes (debounced)
  let previewTimeout;
  editor.on('change', () => {
    clearTimeout(previewTimeout);
    previewTimeout = setTimeout(() => {
      updatePreview();
    }, 500);
  });
});
