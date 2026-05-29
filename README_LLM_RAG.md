# Fitur LLM Knowledge RAG

Dokumen ini menjelaskan fitur LLM/RAG yang ditambahkan ke WhatsApp Chatbot: fungsi, cara kerja, konfigurasi LM Studio, dan cara mengelola knowledge dari dashboard.

## Ringkasan Fungsi

Fitur ini membuat bot bisa menjawab pertanyaan customer berdasarkan knowledge marketing, bukan hanya keyword statis.

Ada dua sumber knowledge di menu **Knowledge**:

1. **Jawaban Cepat**
   - Ini adalah fitur `Aturan` lama.
   - Admin mengisi `keyword`, tipe kecocokan, dan respons.
   - Cocok untuk jawaban pasti seperti salam, jam operasional, kontak admin, atau trigger promo.

2. **Dokumen**
   - Admin bisa upload file `TXT`, `MD`, `PDF`, `JPG`, `PNG`, `WEBP`.
   - Admin juga bisa mengetik knowledge langsung lewat tombol **Tambah Teks**.
   - Isi dokumen/teks akan dipecah menjadi chunk, dibuat embedding, lalu disimpan ke MongoDB.
   - Knowledge ini dipakai oleh LLM untuk menjawab pertanyaan marketing yang lebih fleksibel.

## Cara Kerja Bot

Alur auto-reply saat pesan WhatsApp masuk:

```text
Pesan customer masuk
-> Simpan inbound message
-> Cek Jawaban Cepat / Rules
-> Jika match: kirim respons rule
-> Jika tidak match: cari konteks di Knowledge RAG
-> Jika konteks relevan: LM Studio membuat jawaban formal
-> Jika konteks tidak cukup/off-topic: bot menolak halus dan pesan tetap butuh admin follow-up
```

Prioritasnya selalu:

```text
Jawaban Cepat > RAG Knowledge > Admin follow-up
```

Artinya, jika ada rule yang cocok, LLM tidak dipanggil.

Bot juga membawa memory percakapan pendek per nomor customer. Secara default, backend mengambil 8 pesan terakhir dari MongoDB dan mengirimkannya ke prompt RAG supaya model memahami follow-up question seperti:

```text
Customer: Saya tertarik program Gold Store.
Bot: Program Gold Store memiliki beberapa pilihan...
Customer: Kalau yang lite itu fiturnya apa saja?
```

Pada pertanyaan kedua, model akan memakai riwayat percakapan untuk memahami bahwa "yang lite" merujuk ke program Gold Store Lite.

Riwayat chat memakai mode hybrid. Backend tetap menyimpan cache pesan terbaru dari event WhatsApp untuk kebutuhan dashboard admin, reply, edit, delete, follow-up, dan memory pendek. Pesan yang sudah selesai akan diberi `expires_at` dan otomatis dibersihkan MongoDB sesuai `CHAT_HISTORY_RETENTION_DAYS`; pesan yang masih butuh follow-up admin tidak diberi expiry sampai resolved.

Jika customer mengirim gambar WhatsApp dengan caption, sistem akan:

```text
Download gambar
-> OCR teks di gambar
-> Gabungkan caption + teks gambar
-> Jalankan alur Jawaban Cepat/RAG seperti pesan teks biasa
```

Contoh: customer mengirim brosur gambar lalu bertanya "ini saya hubungi siapa?", bot bisa membaca teks kontak/alamat di gambar jika OCR berhasil dan menjawab berdasarkan caption serta hasil OCR.

Jika `WA_IMAGE_SAVE_TO_KNOWLEDGE=true`, hasil OCR dari gambar customer juga otomatis dibuat menjadi Knowledge baru. Jadi jika customer menanyakan topik yang sama lagi, teks dari gambar tersebut sudah masuk ke indeks RAG.

Admin juga bisa mengirim gambar dari dashboard **Riwayat Chat**:

```text
Buka percakapan
-> Klik tombol gambar di composer
-> Pilih file JPG/PNG/WEBP maksimal 5MB
-> Isi caption jika perlu
-> Klik Kirim
```

Gambar dikirim ke WhatsApp customer sebagai image message dengan caption.

## Batasan Topik

LLM diarahkan hanya menjawab topik marketing, seperti:

- produk
- promo
- campaign
- brand
- benefit layanan
- harga atau paket jika ada di knowledge
- lead qualification
- informasi layanan yang relevan dengan marketing

Jika customer bertanya di luar topik marketing atau knowledge tidak cukup, bot akan membalas:

```text
Maaf, saya hanya dapat membantu pertanyaan seputar informasi marketing. Saya akan teruskan pertanyaan ini ke admin agar dapat dibantu lebih lanjut.
```

Pesan tersebut tetap ditandai perlu follow-up admin.

## Konfigurasi LM Studio

Backend memakai API OpenAI-compatible dari LM Studio.

Contoh konfigurasi di `be/.env`:

```env
AI_RAG_ENABLED=true
LM_STUDIO_BASE_URL=http://192.168.17.57:1234/v1
LM_STUDIO_CHAT_MODEL=gemma-4-26b-a4b-it
LM_STUDIO_EMBEDDING_MODEL=text-embedding-nomic-embed-text-v1.5
LM_STUDIO_TIMEOUT_MS=30000
KNOWLEDGE_MAX_FILE_MB=10
RAG_TOP_K=5
RAG_SIMILARITY_THRESHOLD=0.25
RAG_CHUNK_CHARS=1200
RAG_MEMORY_MESSAGES=8
KNOWLEDGE_OCR_ENABLED=true
KNOWLEDGE_OCR_LANG=eng
WA_IMAGE_OCR_ENABLED=true
WA_IMAGE_SAVE_TO_KNOWLEDGE=true
CHAT_HISTORY_RETENTION_DAYS=30
CHAT_THREAD_LIMIT=200
```

Keterangan:

| Env | Fungsi |
| --- | --- |
| `AI_RAG_ENABLED` | Mengaktifkan fallback RAG setelah Rules tidak match. |
| `LM_STUDIO_BASE_URL` | Base URL server LM Studio. Default umum: `http://localhost:1234/v1`. |
| `LM_STUDIO_CHAT_MODEL` | Model LLM untuk membuat jawaban chat. |
| `LM_STUDIO_EMBEDDING_MODEL` | Model embedding untuk indexing dan retrieval knowledge. |
| `LM_STUDIO_TIMEOUT_MS` | Timeout request ke LM Studio. |
| `KNOWLEDGE_MAX_FILE_MB` | Maksimal ukuran file upload knowledge. |
| `RAG_TOP_K` | Jumlah chunk knowledge teratas yang dikirim ke LLM. |
| `RAG_SIMILARITY_THRESHOLD` | Batas minimal relevansi konteks. |
| `RAG_CHUNK_CHARS` | Ukuran chunk teks saat indexing. |
| `RAG_MEMORY_MESSAGES` | Jumlah pesan terakhir per customer yang dikirim sebagai memory percakapan. |
| `KNOWLEDGE_OCR_ENABLED` | Mengaktifkan OCR fallback untuk PDF yang isinya gambar/scanned. |
| `KNOWLEDGE_OCR_LANG` | Bahasa OCR Tesseract. Default `eng`; bisa diganti jika language data tersedia. |
| `WA_IMAGE_OCR_ENABLED` | Mengaktifkan OCR untuk gambar yang dikirim customer melalui WhatsApp. |
| `WA_IMAGE_SAVE_TO_KNOWLEDGE` | Menyimpan hasil OCR gambar customer sebagai Knowledge baru. |
| `CHAT_HISTORY_RETENTION_DAYS` | Mode hybrid chat: pesan yang sudah selesai otomatis dihapus MongoDB setelah jumlah hari ini. Pending follow-up tetap disimpan sampai resolved. |
| `CHAT_THREAD_LIMIT` | Maksimal pesan terbaru yang ditampilkan per percakapan di dashboard agar thread tidak terlalu berat. |

Setelah mengubah `.env`, restart backend.

## Setup LM Studio

1. Buka LM Studio.
2. Masuk ke menu **Developer** atau **Local Server**.
3. Load model chat, misalnya `gemma-4-26b-a4b-it`.
4. Load model embedding, misalnya `text-embedding-nomic-embed-text-v1.5`.
5. Start server di port `1234`.
6. Pastikan backend bisa mengakses endpoint model:

```bash
curl http://192.168.17.57:1234/v1/models
```

Jika berhasil, response akan berisi daftar model.

## Cara Menggunakan di Dashboard

1. Login ke dashboard.
2. Buka menu **Knowledge**.
3. Untuk respons pasti, masuk tab **Jawaban Cepat**:
   - klik **Tambah Jawaban**
   - isi keyword, tipe match, respons, dan status aktif
4. Untuk RAG, masuk tab **Dokumen**:
   - upload file `TXT`, `MD`, `PDF`, atau gambar `JPG/PNG/WEBP`, atau
   - klik **Tambah Teks** untuk mengetik knowledge langsung
   - PDF hasil scan atau file gambar akan dicoba dibaca dengan OCR
5. Gunakan tombol edit untuk mengubah judul atau isi knowledge, lalu sistem akan reindex otomatis.
6. Gunakan tombol delete untuk menonaktifkan knowledge. Data tidak dihapus permanen, hanya `status_active` diubah menjadi `true`.
7. Knowledge yang sudah dinonaktifkan tetap muncul sebagai **Tidak Aktif** dan bisa dipulihkan dengan tombol **Aktifkan**.
8. Pastikan status dokumen menjadi **Indexed**.
9. Kirim pesan WhatsApp yang tidak match Jawaban Cepat, tapi jawabannya ada di Knowledge.
10. Bot akan menjawab menggunakan LM Studio berdasarkan konteks knowledge.

## API Knowledge

Semua endpoint di bawah membutuhkan header:

```text
Authorization: Bearer <token>
```

### Cek Status RAG dan LM Studio

```http
GET /api/knowledge/status
```

Response contoh:

```json
{
  "success": true,
  "data": {
    "rag_enabled": true,
    "lm_studio": {
      "connected": true,
      "base_url": "http://192.168.17.57:1234/v1",
      "chat_model": "gemma-4-26b-a4b-it",
      "embedding_model": "text-embedding-nomic-embed-text-v1.5"
    }
  }
}
```

### List Dokumen Knowledge

```http
GET /api/knowledge/documents
```

### Upload File Knowledge

```http
POST /api/knowledge/documents
Content-Type: multipart/form-data
```

Field:

```text
file=<TXT/MD/PDF/JPG/PNG/WEBP>
```

### Tambah Knowledge dari Teks

```http
POST /api/knowledge/documents/text
Content-Type: application/json
```

Body:

```json
{
  "title": "Promo Paket Website Mei",
  "text": "Promo bulan ini diskon 20% untuk paket website company profile..."
}
```

### Edit Knowledge

```http
PUT /api/knowledge/documents/:id
Content-Type: application/json
```

Body:

```json
{
  "title": "Promo Paket Website Mei Updated",
  "text": "Isi knowledge terbaru..."
}
```

Setelah edit, dokumen akan otomatis diindex ulang.

### Reindex Dokumen

```http
POST /api/knowledge/documents/:id/reindex
```

### Hapus Dokumen

```http
DELETE /api/knowledge/documents/:id
```

Delete bersifat soft delete:

- belum dihapus: `status_active=false`
- sudah dihapus: `status_active=true`
- dokumen yang sudah soft deleted tetap muncul di dashboard sebagai **Tidak Aktif**
- dokumen yang tidak aktif tidak dipakai sebagai konteks RAG

### Aktifkan Kembali Knowledge

```http
POST /api/knowledge/documents/:id/activate
```

Endpoint ini mengubah `status_active` kembali menjadi `false`, sehingga knowledge aktif lagi dan bisa dipakai RAG jika status indexing-nya valid.

## Data yang Disimpan

Fitur ini menambah dua collection MongoDB:

- `KnowledgeDocument`
  - metadata dokumen
  - judul
  - nama file
  - teks hasil ekstraksi
  - status indexing
  - jumlah chunk
  - `status_active`, yaitu flag soft delete

- `KnowledgeChunk`
  - potongan teks knowledge
  - embedding vector
  - relasi ke dokumen asal

Vector store v1 memakai MongoDB, bukan vector database terpisah.

## Troubleshooting

### Status LM Studio Tidak Terhubung

Cek server LM Studio:

```bash
curl http://192.168.17.57:1234/v1/models
```

Jika gagal:

- pastikan LM Studio server sudah start
- pastikan IP dan port benar
- pastikan komputer backend bisa mengakses IP tersebut
- pastikan firewall tidak memblokir port `1234`

### Upload atau Tambah Teks Gagal Index

Kemungkinan penyebab:

- `AI_RAG_ENABLED` belum `true`
- model embedding belum loaded di LM Studio
- nama `LM_STUDIO_EMBEDDING_MODEL` salah
- LM Studio timeout
- file tidak punya teks yang bisa dibaca
- PDF/gambar berupa scan tapi OCR gagal atau `KNOWLEDGE_OCR_ENABLED=false`

### PDF Gambar/Scan Tidak Terbaca

Sistem akan mencoba OCR otomatis jika `pdf-parse` tidak menemukan teks di PDF. Untuk lingkungan lokal Mac, OCR fallback memakai:

- macOS Quick Look (`qlmanage`) untuk render PDF menjadi gambar sementara
- `tesseract.js` untuk membaca teks dari gambar tersebut

Catatan: OCR paling stabil untuk PDF 1 halaman atau dokumen gambar yang jelas. Jika hasil OCR kurang rapi, gunakan **Tambah Teks** dan paste isi materi secara manual.

### Upload Gambar Knowledge

Admin bisa upload brosur/poster langsung sebagai `JPG`, `PNG`, atau `WEBP`. Sistem akan OCR teks di gambar, lalu hasil OCR disimpan sebagai knowledge dan diindex untuk RAG.

Contoh file:

```text
brosur-produk.png
poster-promo.jpg
flyer-event.webp
```

Jika gambar berisi kontak, alamat, nama program, benefit produk, atau daftar paket, bot bisa memakai teks tersebut untuk menjawab pertanyaan customer.

### Gambar WhatsApp Tidak Terbaca

Untuk gambar dari customer, sistem memakai OCR yang sama dengan knowledge image/PDF. Batasannya:

- gambar harus cukup jelas
- teks tidak terlalu kecil/blur
- OCR membaca teks, bukan memahami objek visual secara penuh
- jika gambar tidak ada teks, bot hanya bisa mengandalkan caption customer.

### Bot Tidak Menjawab dari RAG

Cek hal ini:

- tidak ada Jawaban Cepat yang match lebih dulu
- dokumen sudah berstatus **Indexed**
- pertanyaan customer relevan dengan isi knowledge
- `RAG_SIMILARITY_THRESHOLD` tidak terlalu tinggi
- backend sudah direstart setelah ubah `.env`

### Jawaban Terlalu Sering Masuk Admin Follow-Up

Turunkan threshold:

```env
RAG_SIMILARITY_THRESHOLD=0.20
```

Lalu restart backend dan reindex knowledge jika perlu.

## Catatan Operasional

- Gunakan **Jawaban Cepat** untuk jawaban yang harus selalu konsisten.
- Gunakan **Dokumen** atau **Tambah Teks** untuk knowledge panjang dan sering berubah.
- Setelah mengganti model embedding, sebaiknya reindex semua dokumen.
- Jangan masukkan data rahasia yang tidak boleh dipakai sebagai konteks jawaban bot.
