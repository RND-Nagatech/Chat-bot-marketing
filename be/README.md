# WhatsApp Chatbot — Dokumentasi API Backend

Server berjalan di: `http://localhost:3000`

---

## Autentikasi

Semua endpoint **kecuali** `/api/auth/*` dan `/health` memerlukan header:

```
Authorization: Bearer <token>
```

Token didapat dari response login/register.

---

## Cara Cepat di Postman

1. Buat **Collection** baru bernama `WA Chatbot`
2. Di tab **Variables** collection, tambahkan:
   - `base_url` = `http://localhost:3000/api`
   - `token` = _(kosongkan dulu, isi setelah login)_
3. Di setiap request yang butuh auth, tambahkan header:
   - Key: `Authorization`
   - Value: `Bearer {{token}}`

---

## Endpoint

### 🔓 Health Check

#### `GET /health`

Cek apakah server jalan.

**Request:** _(tidak perlu header/body)_

**Response:**

```json
{
  "success": true,
  "message": "Server is running",
  "whatsapp_status": "disconnected"
}
```

---

### 🔐 Auth

#### `POST /api/auth/register`

Daftarkan akun baru. _(Gunakan ini pertama kali sebelum login)_

**Headers:**

```
Content-Type: application/json
```

**Body (raw JSON):**

```json
{
  "email": "admin@demo.com",
  "password": "password123"
}
```

**Response 201:**

```json
{
  "success": true,
  "token": "eyJhbGci...",
  "user": {
    "id": "664abc123...",
    "email": "admin@demo.com"
  }
}
```

---

#### `POST /api/auth/login`

Login dan dapatkan token JWT.

**Headers:**

```
Content-Type: application/json
```

**Body (raw JSON):**

```json
{
  "email": "admin@demo.com",
  "password": "password123"
}
```

**Response 200:**

```json
{
  "success": true,
  "token": "eyJhbGci...",
  "user": {
    "id": "664abc123...",
    "email": "admin@demo.com"
  }
}
```

> **Postman Tip:** Setelah request ini berhasil, salin nilai `token` lalu paste ke variable `token` di collection.

---

### 📋 Rules (Aturan Balas Otomatis)

Semua endpoint di bawah memerlukan `Authorization: Bearer {{token}}`

---

#### `GET /api/rules`

Ambil semua aturan.

**Response 200:**

```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "664abc123...",
      "keyword": "halo",
      "match_type": "contains",
      "response": "Halo! Ada yang bisa dibantu?",
      "is_active": true,
      "createdAt": "2026-04-07T10:00:00.000Z",
      "updatedAt": "2026-04-07T10:00:00.000Z"
    }
  ]
}
```

---

#### `POST /api/rules`

Buat aturan baru.

**Body (raw JSON):**

```json
{
  "keyword": "halo",
  "match_type": "contains",
  "response": "Halo! Ada yang bisa dibantu?",
  "is_active": true
}
```

> `match_type` hanya boleh: `"contains"` atau `"exact"`
> `is_active` bersifat opsional, default: `true`

**Response 201:**

```json
{
  "success": true,
  "data": {
    "_id": "664abc123...",
    "keyword": "halo",
    "match_type": "contains",
    "response": "Halo! Ada yang bisa dibantu?",
    "is_active": true,
    "createdAt": "2026-04-07T10:00:00.000Z",
    "updatedAt": "2026-04-07T10:00:00.000Z"
  }
}
```

---

#### `PUT /api/rules/:id`

Update aturan berdasarkan ID.

**URL:** `http://localhost:3000/api/rules/664abc123...`

**Body (raw JSON) — semua field bersifat opsional:**

```json
{
  "keyword": "hai",
  "match_type": "exact",
  "response": "Hai juga! Bisa kami bantu?",
  "is_active": false
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "_id": "664abc123...",
    "keyword": "hai",
    "match_type": "exact",
    "response": "Hai juga! Bisa kami bantu?",
    "is_active": false,
    "createdAt": "2026-04-07T10:00:00.000Z",
    "updatedAt": "2026-04-07T10:30:00.000Z"
  }
}
```

---

#### `DELETE /api/rules/:id`

Hapus aturan berdasarkan ID.

**URL:** `http://localhost:3000/api/rules/664abc123...`

**Response 200:**

```json
{
  "success": true,
  "message": "Rule deleted successfully"
}
```

---

### 💬 Messages (Riwayat Pesan)

#### `GET /api/messages`

Ambil semua riwayat pesan.

**Query Params (opsional):**

| Param   | Default | Keterangan                |
| ------- | ------- | ------------------------- |
| `limit` | `100`   | Jumlah pesan yang diambil |
| `skip`  | `0`     | Offset untuk pagination   |

**Contoh:** `GET /api/messages?limit=20&skip=0`

**Response 200:**

```json
{
  "success": true,
  "count": 2,
  "total": 50,
  "data": [
    {
      "_id": "664def456...",
      "phone": "6281234567890",
      "message_in": "halo",
      "message_out": "Halo! Ada yang bisa dibantu?",
      "matched_rule": "664abc123...",
      "createdAt": "2026-04-07T10:05:00.000Z",
      "updatedAt": "2026-04-07T10:05:00.000Z"
    }
  ]
}
```

---

#### `GET /api/messages/phone/:phone`

Ambil riwayat pesan dari nomor tertentu.

**URL:** `http://localhost:3000/api/messages/phone/6281234567890`

**Query Params (opsional):**

| Param   | Default | Keterangan                |
| ------- | ------- | ------------------------- |
| `limit` | `50`    | Jumlah pesan yang diambil |

**Response 200:**

```json
{
   "success": true,
   "count": 3,
   "data": [ ... ]
}
```

---

### 📊 Dashboard

#### `GET /api/dashboard/stats`

Ambil statistik ringkasan untuk dasbor.

**Response 200:**

```json
{
  "success": true,
  "data": {
    "totalMessages": 150,
    "totalAutoReplies": 142,
    "totalRules": 5,
    "activeRules": 4
  }
}
```

---

### 📱 WhatsApp

#### `GET /api/wa/status`

Cek status koneksi WhatsApp.

**Response 200:**

```json
{
  "success": true,
  "data": {
    "status": "connected",
    "phone_number": "6281234567890",
    "qr_available": false
  }
}
```

> Nilai `status`: `"connected"` | `"connecting"` | `"disconnected"`

---

#### `GET /api/wa/qr`

Ambil kode QR untuk scan (hanya tersedia saat sedang proses koneksi).

**Response 200:**

```json
{
  "success": true,
  "data": {
    "qr_code": "data:image/png;base64,iVBORw..."
  }
}
```

**Response 404** (jika QR belum tersedia):

```json
{
  "success": false,
  "message": "QR code not available. Please connect first."
}
```

---

#### `POST /api/wa/connect`

Mulai proses koneksi WhatsApp. Setelah ini panggil `GET /api/wa/qr` untuk mendapat QR.

**Body:** _(kosong)_

**Response 200:**

```json
{
  "success": true,
  "message": "WhatsApp connection initiated. Scan QR code to continue."
}
```

---

#### `POST /api/wa/disconnect`

Putuskan koneksi WhatsApp.

**Body:** _(kosong)_

**Response 200:**

```json
{
  "success": true,
  "message": "WhatsApp disconnected successfully"
}
```

---

## Kode Error Umum

| Status | Keterangan                                     |
| ------ | ---------------------------------------------- |
| `400`  | Request tidak valid / field wajib kosong       |
| `401`  | Token tidak ada, tidak valid, atau kedaluwarsa |
| `404`  | Data tidak ditemukan                           |
| `500`  | Error internal server                          |

---

## Urutan Test di Postman

1. `POST /api/auth/register` — buat akun
2. `POST /api/auth/login` — ambil token, simpan ke variable `token`
3. `POST /api/rules` — buat beberapa aturan
4. `GET /api/rules` — verifikasi aturan tersimpan
5. `POST /api/wa/connect` — mulai koneksi WhatsApp
6. `GET /api/wa/qr` — ambil QR, scan via WhatsApp di ponsel
7. `GET /api/wa/status` — verifikasi status `connected`
8. Kirim pesan WA ke nomor yang terhubung, lalu cek `GET /api/messages`
9. `GET /api/dashboard/stats` — lihat statistik

- **WhatsApp Integration** using Baileys
- **QR Code Authentication** for easy WhatsApp connection
- **Rules Engine** with keyword matching (exact/contains)
- **Auto-Reply System** with fallback messages
- **Message History** tracking
- **REST API** for frontend dashboard
- **JWT Authentication** for secure access
- **MongoDB Database** for data persistence
- **Auto-Reconnect** handling for WhatsApp
- **Comprehensive Logging** with Winston

## Tech Stack

- Node.js
- Express.js
- MongoDB
- Mongoose (ODM)
- Baileys (WhatsApp Web API)
- JWT Authentication
- Winston Logger

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── messagesController.js
│   │   ├── rulesController.js
│   │   └── whatsappController.js
│   ├── middleware/
│   │   └── authMiddleware.js
│   ├── models/
│   │   ├── Message.js
│   │   ├── Rule.js
│   │   ├── User.js
│   │   └── WhatsAppSession.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── messagesRoutes.js
│   │   ├── rulesRoutes.js
│   │   ├── whatsappRoutes.js
│   │   └── index.js
│   ├── services/
│   │   ├── messageService.js
│   │   ├── rulesEngine.js
│   │   └── whatsappService.js
│   ├── utils/
│   │   └── logger.js
│   └── server.js
├── .env.example
├── package.json
└── README.md
```

## Installation

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (running locally or MongoDB Atlas)
- npm or yarn

### Setup Steps

1. **Clone the repository**

   ```bash
   cd backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Setup environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and configure:

   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/whatsapp-chatbot
   JWT_SECRET=your-super-secret-jwt-key
   AUTO_CONNECT_WHATSAPP=false
   FALLBACK_MESSAGE=Sorry, I didn't understand that.
   ```

4. **Create initial user (Optional)**

   You can create a user via the `/api/auth/register` endpoint:

   ```bash
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"password123"}'
   ```

5. **Start the server**

   ```bash
   npm run dev
   ```

   Server will run on `http://localhost:3000`

## WhatsApp Setup

### Connect to WhatsApp

1. **Start the connection**

   ```bash
   POST /api/wa/connect
   ```

2. **Get QR Code**

   ```bash
   GET /api/wa/qr
   ```

3. **Scan the QR code** with your WhatsApp mobile app:
   - Open WhatsApp on your phone
   - Go to Settings > Linked Devices
   - Tap "Link a Device"
   - Scan the QR code from the API response

4. **Check connection status**
   ```bash
   GET /api/wa/status
   ```

## API Documentation

### Authentication

#### Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

Response:
{
  "success": true,
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "user@example.com"
  }
}
```

### Rules Management

All rule endpoints require authentication header:

```
Authorization: Bearer <your-jwt-token>
```

#### Get All Rules

```http
GET /api/rules
```

#### Create Rule

```http
POST /api/rules
Content-Type: application/json

{
  "keyword": "hello",
  "match_type": "contains",
  "response": "Hi there! How can I help you?",
  "is_active": true
}
```

**Match Types:**

- `exact` - Message must exactly match the keyword
- `contains` - Message must contain the keyword

#### Update Rule

```http
PUT /api/rules/:id
Content-Type: application/json

{
  "keyword": "hi",
  "match_type": "exact",
  "response": "Hello! Welcome!",
  "is_active": true
}
```

#### Delete Rule

```http
DELETE /api/rules/:id
```

### Messages

#### Get All Messages

```http
GET /api/messages?limit=100&skip=0
```

#### Get Messages by Phone

```http
GET /api/messages/phone/1234567890
```

### WhatsApp Control

#### Get Status

```http
GET /api/wa/status
```

#### Get QR Code

```http
GET /api/wa/qr
```

#### Connect

```http
POST /api/wa/connect
```

#### Disconnect

```http
POST /api/wa/disconnect
```

## Message Flow

1. **Incoming Message Received**
   - WhatsApp service captures message
   - Extracts sender and message text

2. **Message Normalization**
   - Converts to lowercase
   - Trims whitespace

3. **Rule Matching**
   - Fetches active rules from database
   - Matches against normalized message
   - First matching rule wins

4. **Auto-Reply**
   - If rule matches: send rule response
   - If no match: send fallback message (if configured)

5. **Database Storage**
   - Saves incoming message
   - Saves outgoing reply
   - Links to matched rule

## Database Models

### User

```javascript
{
  email: String,
  password: String (hashed),
  createdAt: Date,
  updatedAt: Date
}
```

### Rule

```javascript
{
  keyword: String,
  match_type: String (contains|exact),
  response: String,
  is_active: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Message

```javascript
{
  phone: String,
  message_in: String,
  message_out: String,
  matched_rule: ObjectId (ref: Rule),
  createdAt: Date,
  updatedAt: Date
}
```

### WhatsAppSession

```javascript
{
  session_data: Object,
  status: String (disconnected|connecting|connected|qr_ready),
  qr_code: String,
  phone_number: String,
  createdAt: Date,
  updatedAt: Date
}
```

## Logging

Logs are stored in the `logs/` directory:

- `error.log` - Error messages only
- `combined.log` - All log messages

Console logging is enabled in development mode.

## Error Handling

All API endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description"
}
```

## Security Features

- JWT token authentication
- Password hashing with bcrypt
- Environment variable protection
- Request validation
- Error message sanitization

## Production Deployment

1. Set `NODE_ENV=production`
2. Use strong `JWT_SECRET`
3. Use MongoDB Atlas or production MongoDB
4. Enable SSL/TLS
5. Set up process manager (PM2)
6. Configure reverse proxy (Nginx)
7. Set up firewall rules

## Troubleshooting

### WhatsApp won't connect

- Check internet connection
- Verify MongoDB is running
- Check logs for errors
- Try regenerating QR code

### Rules not matching

- Verify rule is active (`is_active: true`)
- Check keyword spelling
- Ensure match_type is correct
- Review message normalization

### Authentication errors

- Verify JWT_SECRET is set
- Check token expiration
- Ensure Bearer token format

## Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create pull request

## License

ISC

## Support

For issues and questions, please create an issue in the repository.
