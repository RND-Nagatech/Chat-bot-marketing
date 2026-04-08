# Chat Bot WhatsApp

Panduan singkat untuk menjalankan backend (BE) dan frontend (FE) di local.

## Prasyarat

- Node.js 16+
- npm
- MongoDB lokal atau MongoDB Atlas

## 1) Jalankan Backend (BE)

Masuk ke folder backend dan install dependency:

```bash
cd be
npm install
```

Buat file environment dari template:

```bash
cp .env.example .env
```

Pastikan isi minimal `.env` seperti ini:

```env
PORT=3000
FRONTEND_URL=http://localhost:8080
MONGODB_URI=mongodb://localhost:27017/whatsapp-chatbot
JWT_SECRET=change-this-secret
JWT_EXPIRES_IN=7d
AUTO_CONNECT_WHATSAPP=false
LOG_LEVEL=info
```

Jalankan backend:

```bash
npm run dev
```

Backend akan aktif di:

- API: http://localhost:3000/api
- Health check: http://localhost:3000/health

## 2) Jalankan Frontend (FE)

Buka terminal baru, lalu masuk ke folder frontend dan install dependency:

```bash
cd fe
npm install
```

Opsional: jika ingin override URL API backend, buat file `.env` di folder `fe`:

```env
VITE_API_URL=http://localhost:3000/api
```

Jalankan frontend:

```bash
npm run dev
```

Frontend akan aktif di:

- http://localhost:8080

## 3) Alur Menjalankan Project

1. Jalankan MongoDB.
2. Jalankan BE dengan `npm run dev` di folder `be`.
3. Jalankan FE dengan `npm run dev` di folder `fe`.
4. Buka browser ke http://localhost:8080.

## Command Ringkas

Terminal 1 (Backend):

```bash
cd be
cp .env.example .env
npm install
npm run dev
```

Terminal 2 (Frontend):

```bash
cd fe
npm install
npm run dev
```
