# This PowerShell script connects a local Windows environment to the Cloud IDE.
# It establishes a WebSocket connection with the server and periodically sends
# screen captures for GUI preview. It can also receive commands to execute.
# Usage:
#   .\connect.ps1 -ServerUrl https://your-cloud-ide.example.com -Token <authToken> [-Persist]

param(
  [Parameter(Mandatory=$true)]
  [string]$ServerUrl,
  [Parameter(Mandatory=$true)]
  [string]$Token,
  [switch]$Persist
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

function Capture-Screenshot {
    $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $base64 = [System.Convert]::ToBase64String($ms.ToArray())
    $graphics.Dispose(); $bmp.Dispose(); $ms.Dispose()
    return $base64
}

function Connect-And-Run {
    $wsUrl = $ServerUrl.TrimEnd('/') .Replace('https://','wss://') .Replace('http://','ws://')
    $uri = [System.Uri]::new($wsUrl)
    $client = [System.Net.WebSockets.ClientWebSocket]::new()
    # Set auth token header
    $client.Options.SetRequestHeader('x-auth-token',$Token)
    Write-Host "Connecting to $wsUrl..."
    $client.ConnectAsync($uri,[Threading.CancellationToken]::None).Wait()
    if ($client.State -ne [System.Net.WebSockets.WebSocketState]::Open) {
        throw "Failed to connect to WebSocket"
    }
    Write-Host "Connected.";
    # Send loop
    while ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        try {
            $frame = Capture-Screenshot
            # prepare JSON message
            $json = @{ event = 'gui-frame'; data = $frame } | ConvertTo-Json -Compress
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $buffer = New-Object System.ArraySegment[byte] -ArgumentList ,$bytes
            $client.SendAsync($buffer, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()
            Start-Sleep -Milliseconds 500
        } catch {
            Write-Warning $_.Exception.Message
            break
        }
    }
    $client.Dispose()
}

try {
    Connect-And-Run
} catch {
    Write-Error $_.Exception.Message
}

if ($Persist) {
    Write-Host "To enable persistence, add this script to Task Scheduler manually with the same parameters."
}
