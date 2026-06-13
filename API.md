# WhatsApp Marketing Tool — API Guide

Base URL: `http://your-server:4000/api`

All authenticated endpoints require the `X-API-Key` header (see `.env` for your key).

---

## Authentication

```http
X-API-Key: your-api-key-here
```

---

## WhatsApp

### Check Status
```http
GET /api/whatsapp/status
X-API-Key: ...
```
Response: `{ "status": "connected" | "connecting" | "disconnected" }`

### Send Test Message
```http
POST /api/whatsapp/send-test
X-API-Key: ...
Content-Type: application/json

{ "phone": "+923483469617", "message": "Hello from API!" }
```
Response: `{ "success": true, "id": "true_123456@c.us_ABCDEF" }`

### Initiate Connection (show QR)
```http
POST /api/whatsapp/connect
X-API-Key: ...
```
Response: `{ "message": "QR generation initiated" }`
> QR is emitted via WebSocket — see the frontend `/connect` page.

---

## Campaigns

### List Campaigns
```http
GET /api/campaign
X-API-Key: ...
```

### Get Single Campaign
```http
GET /api/campaign/:id
X-API-Key: ...
```

### Create Campaign
```http
POST /api/campaign
X-API-Key: ...
Content-Type: application/json

{
    "name": "My Campaign",
    "message": "Hi {{name}}, check our offer!",
    "delay": 5,
    "delay_unit": "seconds",
    "send_mode": "interval"
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | string | — | Campaign name (required) |
| `message` | string | — | Message text. Use `{{name}}` for contact name |
| `delay` | number | `5` | Delay between messages |
| `delay_unit` | `"seconds"` / `"minutes"` | `"seconds"` | Unit for delay |
| `send_mode` | `"interval"` / `"cron"` | `"interval"` | Sending mode |

### Edit Campaign
```http
PUT /api/campaign/:id
X-API-Key: ...
Content-Type: application/json

{
    "name": "Updated Name",
    "message": "Updated message {{name}}",
    "delay": 10,
    "delay_unit": "minutes",
    "send_mode": "interval"
}
```
All fields are optional — only send what you want to change.

### Duplicate Campaign
```http
POST /api/campaign/:id/duplicate
X-API-Key: ...
```
Creates a copy with `" (copy)"` appended to the name, status `draft`, new token.

### Delete Campaign
```http
DELETE /api/campaign/:id
X-API-Key: ...
```
Only allowed when status is `draft`, `completed`, or `failed`.

---

## Campaign Actions

### Start (Interval mode only)
```http
POST /api/campaign/:id/start
X-API-Key: ...
```
Starts sending messages one by one with the configured delay.

### Pause
```http
POST /api/campaign/:id/pause
X-API-Key: ...
```

### Resume
```http
POST /api/campaign/:id/resume
X-API-Key: ...
```

### Stop
```http
POST /api/campaign/:id/stop
X-API-Key: ...
```

### Retry Failed Contacts
```http
POST /api/campaign/:id/retry
X-API-Key: ...
```
Resets all `failed` contacts back to `pending`. Sets campaign status to `draft`.

---

## Cron Trigger (No Auth)

This endpoint uses the campaign's secret token instead of API key. Designed for external schedulers.

### Send One Message (Cron Mode)
```http
GET /api/campaign/:id/trigger/:token
```
Response (success):
```json
{ "sent": true }
```
Response (no pending):
```json
{ "sent": false, "error": "No pending contacts" }
```
Response (failed):
```json
{ "sent": false, "error": "Message send failed" }
```
> Rate-limited to 1 call per 60 seconds.

### Start Full Campaign (Interval Mode)
```http
GET /api/campaign/:id/trigger/:token
```
Same URL behaves differently based on `send_mode`:
- **Cron**: sends 1 message
- **Interval**: starts the full campaign (same as POST /start)

---

## Contacts

### List Contacts
```http
GET /api/campaign/:id/contacts?page=1&limit=50
X-API-Key: ...
```
Response:
```json
{
    "contacts": [
        { "id": 1, "phone": "923483469617", "name": "John", "status": "pending", "retries": 0, "sent_at": null, "error": null }
    ],
    "total": 100,
    "page": 1,
    "limit": 50,
    "pages": 2
}
```

### Export Contacts as CSV
```http
GET /api/campaign/:id/export
X-API-Key: ...
```
Downloads a CSV file with columns: `phone, name, status, retries, sent_at, error`

### Upload CSV
```http
POST /api/campaign/:id/upload-csv
X-API-Key: ...
Content-Type: multipart/form-data

contacts=@file.csv
```
Expected CSV format:
```csv
phone,name
+923483469617,John Doe
+923001234567,Jane Smith
```
| Column | Required | Description |
|---|---|---|
| `phone` | Yes | International format (`+923001234567`) |
| `name` | No | Used with `{{name}}` in message template |

> ⚠ Do NOT open the CSV in Excel — it corrupts phone numbers. Use Notepad, VS Code, or the included `gen-csv.js` script.

---

## Logs

### Campaign Logs
```http
GET /api/campaign/:id/logs
X-API-Key: ...
```

### App Logs
```http
GET /api/campaign/logs/app
X-API-Key: ...
```

---

## Token Management

### Regenerate Trigger Token
```http
POST /api/campaign/:id/token/regenerate
X-API-Key: ...
```
Response: `{ "token": "new-token-here" }`

---

## Example: PHP Contact Form → WhatsApp

Below is a complete PHP script that sends form submissions to your WhatsApp via this API.

### PHP Script (send-to-whatsapp.php)

```php
<?php
/**
 * Send contact form submission to WhatsApp
 * 
 * Two approaches:
 *   1. Direct send — POST /api/whatsapp/send-test immediately
 *   2. Cron campaign — POST /api/campaign to create, upload CSV, then trigger via cron
 */

$apiUrl = 'http://your-server:4000/api';
$apiKey = 'your-api-key-here';

// --- Approach 1: Direct (for simple notifications) ---

function sendWhatsAppDirect($phone, $message) {
    global $apiUrl, $apiKey;

    $ch = curl_init("$apiUrl/whatsapp/send-test");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            "X-API-Key: $apiKey",
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode([
            'phone' => $phone,
            'message' => $message,
        ]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200) {
        return ['success' => true, 'data' => json_decode($response, true)];
    }
    return ['success' => false, 'error' => $response];
}

// Example: notify admin when contact form is submitted
$contactName = $_POST['name'] ?? '';
$contactEmail = $_POST['email'] ?? '';
$contactMessage = $_POST['message'] ?? '';

$adminPhone = '+923483469617'; // Your WhatsApp number

$notification = "New Contact Form Submission\n"
    . "Name: $contactName\n"
    . "Email: $contactEmail\n"
    . "Message: $contactMessage";

$result = sendWhatsAppDirect($adminPhone, $notification);

if ($result['success']) {
    echo "Notification sent to admin.";
} else {
    echo "Failed: " . $result['error'];
    error_log("WhatsApp send failed: " . $result['error']);
}


// --- Approach 2: Cron Campaign (for bulk or scheduled) ---

function createAndTriggerCampaign($contacts, $message, $delayMinutes = 1) {
    global $apiUrl, $apiKey;

    // 1. Create campaign
    $ch = curl_init("$apiUrl/campaign");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            "X-API-Key: $apiKey",
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode([
            'name' => 'Form Submission ' . date('Y-m-d H:i'),
            'message' => $message,
            'delay' => $delayMinutes,
            'delay_unit' => 'minutes',
            'send_mode' => 'cron', // 1 trigger = 1 message
        ]),
        CURLOPT_RETURNTRANSFER => true,
    ]);
    $campaignData = json_decode(curl_exec($ch), true);
    curl_close($ch);

    if (!isset($campaignData['id'])) {
        return ['error' => 'Campaign creation failed'];
    }
    $campaignId = $campaignData['id'];
    $token = $campaignData['token'];

    // 2. Create CSV content
    $csv = "phone,name\n";
    foreach ($contacts as $c) {
        $csv .= $c['phone'] . ',' . $c['name'] . "\n";
    }
    $tmpFile = tempnam(sys_get_temp_dir(), 'wa_');
    file_put_contents($tmpFile, $csv);

    // 3. Upload CSV
    $ch = curl_init("$apiUrl/campaign/$campaignId/upload-csv");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ["X-API-Key: $apiKey"],
        CURLOPT_POSTFIELDS => [
            'contacts' => new CURLFile($tmpFile, 'text/csv', 'contacts.csv'),
        ],
        CURLOPT_RETURNTRANSFER => true,
    ]);
    curl_exec($ch);
    curl_close($ch);
    unlink($tmpFile);

    // 4. Trigger first message (cron mode: sends 1)
    $triggerUrl = "$apiUrl/campaign/$campaignId/trigger/$token";
    $result = file_get_contents($triggerUrl);

    return [
        'campaign_id' => $campaignId,
        'token' => $token,
        'trigger_url' => $triggerUrl,
        'first_trigger' => json_decode($result, true),
    ];
}
```

### Cron Job Setup (cron-job.org)

1. Create a campaign with `send_mode: "cron"`
2. Copy the **Trigger URL** from the campaign detail page
3. Add a cron job at cron-job.org or any scheduler:

```
URL: http://your-server:4000/api/campaign/42/trigger/abc123
Interval: Every 5 minutes
```

Each execution sends exactly 1 message. For 100 contacts at 5-minute intervals, it takes 500 minutes (~8.3 hours).

### cURL Examples

```bash
# Check WhatsApp status
curl -H "X-API-Key: your-key" http://localhost:4000/api/whatsapp/status

# Send test message
curl -X POST -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+923483469617","message":"Hello from cURL"}' \
  http://localhost:4000/api/whatsapp/send-test

# Create campaign (cron mode, 2min delay)
curl -X POST -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","message":"Hi {{name}}","delay":2,"delay_unit":"minutes","send_mode":"cron"}' \
  http://localhost:4000/api/campaign

# Trigger 1 message (no auth needed)
curl http://localhost:4000/api/campaign/1/trigger/your-token-here

# List contacts
curl -H "X-API-Key: your-key" http://localhost:4000/api/campaign/1/contacts

# Retry failed
curl -X POST -H "X-API-Key: your-key" http://localhost:4000/api/campaign/1/retry

# Export CSV
curl -H "X-API-Key: your-key" http://localhost:4000/api/campaign/1/export -o export.csv
```

---

## WebSocket Events

Connect to `http://your-server:4000` with Socket.IO client.

| Event | Direction | Payload | Description |
|---|---|---|---|
| `whatsapp:qr` | server→client | `string` (base64 PNG) | QR code for scanning |
| `whatsapp:status` | server→client | `"connected"` / `"disconnected"` / `"connecting"` | Connection state |
| `campaign:progress` | server→client | `{ total, sent, failed, pending }` | Per-campaign progress |
| `campaign:complete` | server→client | `{ stats }` | Campaign finished |
| `campaign:paused` | server→client | `{ stats }` | Campaign paused |
| `campaign:stopped` | server→client | `{ stats }` | Campaign stopped |

### JavaScript Example

```js
const socket = io('http://your-server:4000');

// Listen for campaign progress
socket.emit('join', 'campaign-42');
socket.on('campaign:progress', (stats) => {
    console.log(`Sent: ${stats.sent}/${stats.total}`);
});
```
