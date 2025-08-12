# Cloud IDE

This repository contains a proof‑of‑concept for a web‑based development environment that runs entirely in the browser. It includes a Node.js/Express backend with REST APIs for file management and code execution, a simple frontend built with CodeMirror for editing, and a PowerShell script for optionally streaming a GUI from a local Windows machine to the web interface.

## Features

* **Browser‑based IDE** – Edit HTML, CSS, JavaScript, Python and other text files directly in your browser. The editor uses CodeMirror for syntax highlighting and supports saving via `Ctrl+S` and running via `Ctrl+Enter`.
* **File Manager** – Browse, upload, delete and create files/folders in a dedicated workspace on the server. All operations are performed via secure REST endpoints protected by an auth token.
* **Real‑time preview** – For HTML files, the preview pane updates automatically as you type. Preview updates are also broadcast to other connected sessions via Socket.IO.
* **Console output** – Run your scripts (Node.js, Python, Bash) and view the standard output and errors inside the IDE.
* **Secure authentication** – All API and WebSocket connections require an authentication token supplied via `x‑auth‑token` header or the Socket.IO auth field.
* **Optional GUI streaming** – The included PowerShell script (`powershell/connect.ps1`) can capture the screen of a local Windows machine and stream frames to the web IDE using WebSockets. This can be useful for visualising GUI applications under development.

## Getting Started

### Prerequisites

* Node.js 18+ and npm installed locally (for local development) or a free hosting service such as Render, Glitch, Railway or Replit.
* A valid auth token (choose any random string for development). In production you should store this as an environment variable `AUTH_TOKEN` on the hosting platform.

### Running locally

1. Install dependencies:

   ```bash
   cd cloud-ide
   npm install
   ```

2. Set the `AUTH_TOKEN` environment variable and start the server:

   ```bash
   export AUTH_TOKEN=yourSecretToken
   npm start
   ```

3. Visit `http://localhost:3000` in your browser. Enter your token to connect and start using the IDE.

### Deploying to Render

Render makes it easy to deploy Node.js applications for free. After creating a free account on [render.com](https://render.com), follow these steps:

1. Create a new **Web Service** and connect it to your GitHub repository containing this project.
2. Choose **Node** for the environment. Set the **Build Command** to:

   ```
   npm install
   ```

   and the **Start Command** to:

   ```
   npm start
   ```

3. Set the environment variable `AUTH_TOKEN` to a secure random string.
4. Deploy the service. Render will assign you a public HTTPS URL once the service is live.

After deployment, navigate to the public URL in your browser and enter the token to authenticate.

### PowerShell client (optional)

The script `powershell/connect.ps1` is a simple client that demonstrates how you might connect a local Windows environment to the web IDE and stream screen captures. To use it:

```powershell
cd powershell
.\connect.ps1 -ServerUrl https://your-render-url -Token yourSecretToken
```

The script connects to the WebSocket endpoint at the provided URL and repeatedly captures the screen at ~2 frames per second, sending each frame as a base64 encoded PNG. Frames are broadcast to all connected IDE clients via Socket.IO and displayed in the preview pane. The script is for demonstration purposes; you can extend it to handle incoming commands or to simulate keyboard/mouse events.

To configure the script to run persistently at startup, pass the `-Persist` switch and create an entry in the Windows Task Scheduler pointing to the script with the appropriate arguments.

## Security Considerations

* Use **HTTPS** when deploying publicly. Services like Render automatically provision TLS for you.
* Always set a strong `AUTH_TOKEN` and never expose it publicly. Consider implementing a proper authentication flow for multiple users.
* The `/api/execute` endpoint runs arbitrary code on the server. This is a convenience for demonstration and should be disabled or sandboxed in production.
* GUI streaming involves capturing and sending your screen contents. Ensure you trust the remote server and restrict access appropriately.

## Next Steps

This project is intentionally lightweight, but there are many ways you can expand it:

* Replace the simple file tree with a full‑featured explorer supporting rename, drag‑and‑drop, etc.
* Add user management and per‑workspace isolation.
* Integrate a terminal emulator (e.g. xterm.js) for a richer shell experience.
* Implement bidirectional GUI control via WebRTC to support interactive remote sessions.
* Use persistent storage (e.g. a database or cloud storage) instead of the local filesystem for the workspace.

Feel free to fork this repository and adapt it to your needs!
