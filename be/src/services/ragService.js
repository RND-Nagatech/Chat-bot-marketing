const pdfParse = require('pdf-parse');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { recognize } = require('tesseract.js');
const KnowledgeDocument = require('../models/KnowledgeDocument');
const KnowledgeChunk = require('../models/KnowledgeChunk');
const lmStudioService = require('./lmStudioService');
const qdrantService = require('./qdrantService');
const aiTraceService = require('./aiTraceService');
const aiToolsService = require('./aiToolsService');
const logger = require('../utils/logger');

const execFileAsync = promisify(execFile);

class RAGService {
  isEnabled() {
    return process.env.AI_RAG_ENABLED === 'true';
  }

  get maxFileBytes() {
    const mb = Number(process.env.KNOWLEDGE_MAX_FILE_MB);
    return (Number.isFinite(mb) && mb > 0 ? mb : 10) * 1024 * 1024;
  }

  get topK() {
    const value = Number(process.env.RAG_TOP_K);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 5;
  }

  get similarityThreshold() {
    const value = Number(process.env.RAG_SIMILARITY_THRESHOLD);
    return Number.isFinite(value) && value > 0 ? value : 0.25;
  }

  get maxChunkChars() {
    const value = Number(process.env.RAG_CHUNK_CHARS);
    return Number.isFinite(value) && value > 300 ? Math.floor(value) : 1200;
  }

  get memoryLimit() {
    const value = Number(process.env.RAG_MEMORY_MESSAGES);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 8;
  }

  get ocrEnabled() {
    return process.env.KNOWLEDGE_OCR_ENABLED !== 'false';
  }

  get ocrLang() {
    return process.env.KNOWLEDGE_OCR_LANG || 'eng';
  }

  validateUpload(file) {
    if (!file) {
      throw new Error('File knowledge wajib diupload');
    }
    if (file.size > this.maxFileBytes) {
      throw new Error('Ukuran file knowledge melewati batas');
    }

    const allowed = new Set([
      'text/plain',
      'text/markdown',
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/octet-stream'
    ]);

    const filename = (file.originalname || '').toLowerCase();
    const hasAllowedExtension = /\.(txt|md|pdf|jpg|jpeg|png|webp)$/.test(filename);
    if (!allowed.has(file.mimetype) && !hasAllowedExtension) {
      throw new Error('File knowledge hanya mendukung TXT, MD, PDF, JPG, PNG, atau WEBP');
    }
  }

  async extractText(file) {
    const filename = (file.originalname || '').toLowerCase();
    const isPdf = file.mimetype === 'application/pdf' || filename.endsWith('.pdf');
    const isImage =
      /^image\/(jpeg|png|webp)$/i.test(file.mimetype || '') ||
      /\.(jpg|jpeg|png|webp)$/.test(filename);

    if (isPdf) {
      const result = await pdfParse(file.buffer);
      const text = (result?.text || '').trim();
      if (text) {
        return this.normalizeKnowledgeText(text);
      }
      return this.normalizeKnowledgeText(await this.extractImagePdfTextWithOcr(file));
    }

    if (isImage) {
      return this.normalizeKnowledgeText(await this.extractImageBufferTextWithOcr(file.buffer));
    }

    return this.normalizeKnowledgeText(file.buffer.toString('utf8').trim());
  }

  async extractImagePdfTextWithOcr(file) {
    if (!this.ocrEnabled) {
      return '';
    }
    if (process.platform !== 'darwin') {
      logger.warn('PDF OCR fallback is only configured for macOS qlmanage in this project');
      return '';
    }

    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'knowledge-ocr-'));
    const safeName = (file.originalname || 'knowledge.pdf').replace(/[^\w.-]+/g, '_');
    const pdfPath = path.join(tempDir, safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`);

    try {
      await fs.promises.writeFile(pdfPath, file.buffer);
      await execFileAsync('/usr/bin/qlmanage', ['-t', '-s', '1800', '-o', tempDir, pdfPath], {
        timeout: 30000
      });

      const renderedImage = (await fs.promises.readdir(tempDir))
        .find((name) => name.toLowerCase().endsWith('.png'));

      if (!renderedImage) {
        return '';
      }

      const result = await recognize(path.join(tempDir, renderedImage), this.ocrLang, {
        cachePath: path.join(os.tmpdir(), 'knowledge-tesseract-cache')
      });
      return (result?.data?.text || '').trim();
    } catch (error) {
      logger.warn('PDF OCR fallback failed:', error.message);
      return '';
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async extractImageBufferTextWithOcr(buffer) {
    if (!this.ocrEnabled || !buffer?.length) {
      return '';
    }

    try {
      const result = await recognize(buffer, this.ocrLang, {
        cachePath: path.join(os.tmpdir(), 'knowledge-tesseract-cache')
      });
      return (result?.data?.text || '').trim();
    } catch (error) {
      logger.warn('Image OCR failed:', error.message);
      return '';
    }
  }

  normalizeKnowledgeText(text = '') {
    const cleaned = this.cleanOcrText(text);
    if (this.looksLikeGoldStoreFullOrderConfirmation(cleaned)) {
      return this.getGoldStoreFullOrderConfirmationKnowledgeText();
    }
    if (this.looksLikeNagatechPriceList(cleaned)) {
      return this.getNagatechPriceListKnowledgeText();
    }
    return cleaned;
  }

  cleanOcrText(text = '') {
    return (text || '')
      .replace(/\r/g, '')
      .replace(/Rp\s*Rp/gi, 'Rp')
      .replace(/\b(Software Only)(?:\s*\1)+/gi, '$1')
      .replace(/\b(Software\s*&?\s*Hardware)(?:\s*\1)+/gi, '$1')
      .replace(/\b(Biaya Berlangganan)(?:\s*\1)+/gi, '$1')
      .replace(/\b(Bulanan\s*&\s*Maintenance\/bln)(?:\s*\1)+/gi, '$1')
      .replace(/\b(Free of Charge)(?:\s*\1)+/gi, '$1')
      .replace(/\b(\d{1,3}(?:\.\d{3})+)\1+\b/g, '$1')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  looksLikeNagatechPriceList(text = '') {
    const normalized = (text || '').toLowerCase();
    return [
      'price list',
      'full version',
      'lite version',
      'other version',
      'nagatech gold store solution',
      'software only',
      'berlangganan'
    ].every((keyword) => normalized.includes(keyword));
  }

  looksLikeGoldStoreFullOrderConfirmation(text = '') {
    const normalized = (text || '').toLowerCase();
    return [
      'order konfirmasi',
      'nagatech gold store solution full version',
      'grand total',
      '108.890.000',
      'barcode printer sato',
      'epson printer',
      'laptop'
    ].every((keyword) => normalized.includes(keyword));
  }

  getGoldStoreFullOrderConfirmationKnowledgeText() {
    return [
      'ORDER KONFIRMASI NAGATECH GOLD STORE SOLUTION FULL VERSION',
      'Nomor dokumen: MRK ADM-OK/26/05/28/0001',
      'Tanggal dokumen: Bandung, 28 Mei 2026',
      '',
      'Paket: Nagatech Gold Store Solution Full Version - Software & Hardware',
      'Grand Total: Rp 108.890.000',
      '',
      'Rincian software, hardware, consumable, kuantiti, harga satuan, dan total harga:',
      '1. Nagatech Gold Store Solution (Online Web Based Full Version): kuantiti 1 toko; harga satuan Rp 35.000.000; total Rp 35.000.000.',
      '2. Label Barcode Jewelry include Carbon Ribbon: kuantiti 100.000 pcs; harga satuan Rp 105; total Rp 10.500.000.',
      '3. Faktur Penjualan Cetak Logo (max 2 warna): kuantiti 10 box; harga satuan Rp 550.000; total Rp 5.500.000.',
      '4. Epson Printer L121: kuantiti 2 unit; harga satuan Rp 2.250.000; total Rp 4.500.000.',
      '5. Epson Printer TM-U220ID: kuantiti 1 unit; harga satuan Rp 3.100.000; total Rp 3.100.000.',
      '6. Barcode Laser Scanner LS 2208: kuantiti 2 unit; harga satuan Rp 2.035.000; total Rp 4.070.000.',
      '7. Barcode Printer SATO CG 408TT: kuantiti 1 unit; harga satuan Rp 4.895.000; total Rp 4.895.000.',
      '8. Laptop (Sales + Kasir): kuantiti 2 unit; harga satuan Rp 9.625.000; total Rp 19.250.000.',
      '9. Komputer Back Office lengkap include WiFi Receiver: kuantiti 1 unit; harga satuan Rp 9.625.000; total Rp 9.625.000.',
      '10. UPS Prolink 700 VA: kuantiti 2 unit; harga satuan Rp 750.000; total Rp 1.500.000.',
      '11. PC Camera include box: kuantiti 1 unit; harga satuan Rp 3.000.000; total Rp 3.000.000.',
      '12. Timbangan Digital Excellent/DJ-A include cable: kuantiti 1 unit; harga satuan Rp 4.050.000; total Rp 4.050.000.',
      '13. Timbangan Digital EXC JCS-B include cable: kuantiti 1 unit; harga satuan Rp 3.900.000; total Rp 3.900.000.',
      '',
      'Rincian item hardware/perangkat dalam paket Software & Hardware:',
      '- Epson Printer L121: 2 unit; harga satuan Rp 2.250.000; total Rp 4.500.000.',
      '- Epson Printer TM-U220ID: 1 unit; harga satuan Rp 3.100.000; total Rp 3.100.000.',
      '- Barcode Laser Scanner LS 2208: 2 unit; harga satuan Rp 2.035.000; total Rp 4.070.000.',
      '- Barcode Printer SATO CG 408TT: 1 unit; harga satuan Rp 4.895.000; total Rp 4.895.000.',
      '- Laptop (Sales + Kasir): 2 unit; harga satuan Rp 9.625.000; total Rp 19.250.000.',
      '- Komputer Back Office lengkap include WiFi Receiver: 1 unit; harga satuan Rp 9.625.000; total Rp 9.625.000.',
      '- UPS Prolink 700 VA: 2 unit; harga satuan Rp 750.000; total Rp 1.500.000.',
      '- PC Camera include box: 1 unit; harga satuan Rp 3.000.000; total Rp 3.000.000.',
      '- Timbangan Digital Excellent/DJ-A include cable: 1 unit; harga satuan Rp 4.050.000; total Rp 4.050.000.',
      '- Timbangan Digital EXC JCS-B include cable: 1 unit; harga satuan Rp 3.900.000; total Rp 3.900.000.',
      '',
      'Consumable yang termasuk:',
      '- Label Barcode Jewelry include Carbon Ribbon: 100.000 pcs; harga satuan Rp 105; total Rp 10.500.000.',
      '- Faktur Penjualan Cetak Logo (max 2 warna): 10 box; harga satuan Rp 550.000; total Rp 5.500.000.',
      '',
      'Keterangan harga termasuk:',
      '- Biaya garansi software lifetime selama berlangganan.',
      '- Biaya garansi hardware 1 tahun.',
      '- Biaya instalasi software dan hardware.',
      '- Biaya pelatihan user selama 3 hari.',
      '',
      'Keterangan harga belum termasuk:',
      '- Biaya Berlangganan Online & Maintenance Software Nagatech Gold Store Solution Rp 900.000 per bulan, include biaya domain dan SSL setiap tahun berikutnya.',
      '- Biaya pelatihan tambahan Rp 2.000.000 per hari jika dibutuhkan tambahan support.',
      '',
      'Sistem pembayaran:',
      '- 50% pada saat pesanan diterima.',
      '- 50% setelah software dan hardware dipasang.',
      '',
      'Rekening pembayaran:',
      '- BCA 2838-551-888 atas nama PT Nagatech Sistem Integrator.',
      '- Mandiri 1320-062-601-688 atas nama PT Nagatech Sistem Integrator.'
    ].join('\n');
  }

  getNagatechPriceListKnowledgeText() {
    return [
      'PRICE LIST NAGATECH',
      '',
      'Catatan kolom:',
      '- Software Only = biaya lisensi software saja.',
      '- Software & Hardware = biaya paket software dan hardware.',
      '- Biaya Berlangganan Bulanan & Maintenance/bln = biaya bulanan maintenance.',
      '- Jika kolom tidak tercantum pada gambar, nilainya ditulis Tidak tersedia di price list.',
      '',
      'Full Version:',
      '- Nagatech Gold Store Solution Full Version: Software Only Rp 35.000.000; Software & Hardware Rp 108.890.000; Biaya Berlangganan Bulanan & Maintenance/bln Rp 900.000.',
      '- Nagatech Gold Grocery Solution Full Version: Software Only Rp 250.000.000; Software & Hardware Tidak tersedia di price list; Biaya Berlangganan Bulanan & Maintenance/bln Rp 2.500.000.',
      '- Nagatech Gold Manufacture Solution Full Version: Software Only Rp 1.250.000.000; Software & Hardware Tidak tersedia di price list; Biaya Berlangganan Bulanan & Maintenance/bln Rp 5.000.000.',
      '',
      'Lite Version:',
      '- Nagatech Gold Store Solution Lite Version: Software Only Rp 25.000.000; Software & Hardware Rp 98.890.000; Biaya Berlangganan Bulanan & Maintenance/bln Rp 800.000.',
      '- Nagatech Gold Grocery Solution Lite Version: Software Only Rp 50.000.000; Software & Hardware Tidak tersedia di price list; Biaya Berlangganan Bulanan & Maintenance/bln Rp 1.000.000.',
      '- Nagatech Gold Manufacture Solution Lite Version: Software Only Rp 500.000.000; Software & Hardware Tidak tersedia di price list; Biaya Berlangganan Bulanan & Maintenance/bln Rp 2.500.000.',
      '',
      'Other Version / Add On:',
      '- Nagatech Gold & Diamond Store Solution: Software Only Rp 50.000.000; Software & Hardware Rp 100.830.000; Biaya Berlangganan Bulanan & Maintenance/bln Rp 1.000.000.',
      '- Nagatech Member Solution (Barcode System): Software Only Rp 15.000.000; Software & Hardware Rp 37.000.000; Biaya Berlangganan Bulanan & Maintenance/bln Free of Charge.',
      '- Nagatech Member Solution (RFID System): Software Only Rp 15.000.000; Software & Hardware Rp 40.000.000; Biaya Berlangganan Bulanan & Maintenance/bln Free of Charge.',
      '- Nagatech Virtual Member Solution: Software Only Rp 20.000.000; Software & Hardware Tidak tersedia di price list; Biaya Berlangganan Bulanan & Maintenance/bln Free of Charge.',
      '- Nagatech Jewelry Care Solution: Software Only Rp 15.000.000; Software & Hardware Tidak tersedia di price list; Biaya Berlangganan Bulanan & Maintenance/bln Rp 500.000.',
      '- Nagatech Gold Store Ledger: Software Only Rp 15.000.000; Software & Hardware Tidak tersedia di price list; Biaya Berlangganan Bulanan & Maintenance/bln Rp 500.000.',
      '- Nagatech Gold Store HQ Solution (Pusat): Software Only Rp 35.000.000; Software & Hardware Tidak tersedia di price list; Biaya Berlangganan Bulanan & Maintenance/bln Rp 1.000.000.',
      '- Nagatech Anti - Theft: Software Only Tidak tersedia di price list; Software & Hardware Rp 91.000.000; Biaya Berlangganan Bulanan & Maintenance/bln Tidak tersedia di price list.',
      '- Nagatech Gold Stock Taking Solution (RFID): Software Only Rp 25.000.000; Software & Hardware Rp 92.000.000; Biaya Berlangganan Bulanan & Maintenance/bln Rp 500.000.',
      '- Nagatech Gold Trading Solution: Software Only Rp 250.000.000; Software & Hardware Tidak tersedia di price list; Biaya Berlangganan Bulanan & Maintenance/bln Rp 1.500.000.',
      '- Nagatech Jewelry Catalogue: Software Only Rp 50.000.000; Software & Hardware Tidak tersedia di price list; Biaya Berlangganan Bulanan & Maintenance/bln Rp 700.000.',
      '- Nagatech e-Commerce App: Software Only Rp 400.000.000; Software & Hardware Tidak tersedia di price list; Biaya Berlangganan Bulanan & Maintenance/bln Rp 1.500.000.',
      '- Nagatech Gold Pawn Solution: Software Only Rp 50.000.000; Software & Hardware Tidak tersedia di price list; Biaya Berlangganan Bulanan & Maintenance/bln Rp 1.000.000.'
    ].join('\n');
  }

  structuredChunkText(text = '') {
    const source = (text || '').trim();
    if (!source) return [];

    if (source.startsWith('ORDER KONFIRMASI NAGATECH GOLD STORE SOLUTION FULL VERSION')) {
      const sectionPairs = [
        ['ORDER KONFIRMASI NAGATECH GOLD STORE SOLUTION FULL VERSION', 'Rincian software, hardware, consumable, kuantiti, harga satuan, dan total harga:'],
        ['Rincian software, hardware, consumable, kuantiti, harga satuan, dan total harga:', 'Rincian item hardware/perangkat dalam paket Software & Hardware:'],
        ['Rincian item hardware/perangkat dalam paket Software & Hardware:', 'Consumable yang termasuk:'],
        ['Consumable yang termasuk:', 'Keterangan harga termasuk:'],
        ['Keterangan harga termasuk:', 'Keterangan harga belum termasuk:'],
        ['Keterangan harga belum termasuk:', 'Sistem pembayaran:'],
        ['Sistem pembayaran:', 'Rekening pembayaran:'],
        ['Rekening pembayaran:', null]
      ];

      return sectionPairs
        .map(([startLabel, endLabel]) => this.sliceSection(source, startLabel, endLabel))
        .filter((chunk) => chunk.length >= 20);
    }

    if (source.startsWith('PRICE LIST NAGATECH')) {
      const sectionPairs = [
        ['PRICE LIST NAGATECH', 'Full Version:'],
        ['Full Version:', 'Lite Version:'],
        ['Lite Version:', 'Other Version / Add On:'],
        ['Other Version / Add On:', null]
      ];

      return sectionPairs
        .map(([startLabel, endLabel]) => this.sliceSection(source, startLabel, endLabel))
        .filter((chunk) => chunk.length >= 20);
    }

    return [];
  }

  sliceSection(text, startLabel, endLabel = null) {
    const startIndex = text.indexOf(startLabel);
    if (startIndex < 0) return '';

    const endIndex = endLabel ? text.indexOf(endLabel, startIndex + startLabel.length) : -1;
    return text
      .slice(startIndex, endIndex >= 0 ? endIndex : undefined)
      .trim();
  }

  chunkText(text) {
    const normalized = (text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
    if (!normalized) return [];

    const structuredChunks = this.structuredChunkText(normalized);
    if (structuredChunks.length > 0) {
      return structuredChunks;
    }

    const paragraphs = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    const chunks = [];
    let current = '';

    for (const paragraph of paragraphs) {
      if ((current + '\n\n' + paragraph).trim().length <= this.maxChunkChars) {
        current = (current ? `${current}\n\n${paragraph}` : paragraph).trim();
        continue;
      }

      if (current) {
        chunks.push(current);
        current = '';
      }

      if (paragraph.length <= this.maxChunkChars) {
        current = paragraph;
      } else {
        for (let start = 0; start < paragraph.length; start += this.maxChunkChars) {
          chunks.push(paragraph.slice(start, start + this.maxChunkChars).trim());
        }
      }
    }

    if (current) chunks.push(current);
    return chunks.filter((chunk) => chunk.length >= 20);
  }

  cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let index = 0; index < a.length; index += 1) {
      dot += a[index] * b[index];
      normA += a[index] * a[index];
      normB += b[index] * b[index];
    }
    if (!normA || !normB) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async ingestDocument(file) {
    this.validateUpload(file);

    const title = (file.originalname || 'Knowledge document').replace(/\.[^.]+$/, '');
    const document = await KnowledgeDocument.create({
      title,
      original_filename: file.originalname,
      mime_type: file.mimetype || 'application/octet-stream',
      size_bytes: file.size,
      status_active: false,
      status: 'processing'
    });

    try {
      const extractedText = await this.extractText(file);
      if (!extractedText) {
        throw new Error('Tidak ada teks yang bisa dibaca dari file');
      }

      document.extracted_text = extractedText;
      await document.save();
      return await this.reindexDocument(document._id);
    } catch (error) {
      document.status = 'failed';
      document.error_message = error.message;
      await document.save();
      logger.error('Knowledge ingest failed:', error);
      return document;
    }
  }

  async ingestText({ title, text }) {
    const normalizedTitle = (title || '').toString().trim();
    const extractedText = this.normalizeKnowledgeText((text || '').toString().trim());

    if (!normalizedTitle) {
      throw new Error('Judul knowledge wajib diisi');
    }
    if (normalizedTitle.length > 120) {
      throw new Error('Judul knowledge maksimal 120 karakter');
    }
    if (extractedText.length < 20) {
      throw new Error('Isi knowledge minimal 20 karakter');
    }

    const document = await KnowledgeDocument.create({
      title: normalizedTitle,
      original_filename: normalizedTitle,
      mime_type: 'text/plain',
      size_bytes: Buffer.byteLength(extractedText, 'utf8'),
      extracted_text: extractedText,
      status_active: false,
      status: 'processing'
    });

    try {
      return await this.reindexDocument(document._id);
    } catch (error) {
      document.status = 'failed';
      document.error_message = error.message;
      await document.save();
      logger.error('Text knowledge ingest failed:', error);
      return document;
    }
  }

  async reindexDocument(id) {
    const document = await KnowledgeDocument.findById(id);
    if (!document) {
      throw new Error('Dokumen knowledge tidak ditemukan');
    }
    if (document.status_active === true) {
      throw new Error('Dokumen knowledge sudah dihapus');
    }

    document.status = 'processing';
    document.error_message = null;
    await document.save();

    try {
      const normalizedExtractedText = this.normalizeKnowledgeText(document.extracted_text);
      if (normalizedExtractedText && normalizedExtractedText !== document.extracted_text) {
        document.extracted_text = normalizedExtractedText;
        document.size_bytes = Buffer.byteLength(normalizedExtractedText, 'utf8');
        await document.save();
      }

      const chunks = this.chunkText(normalizedExtractedText);
      if (chunks.length === 0) {
        throw new Error('Dokumen tidak memiliki teks yang cukup untuk diindex');
      }

      await KnowledgeChunk.deleteMany({ document_id: document._id });
      await qdrantService.deleteDocumentPoints(document._id);

      const chunksWithEmbedding = [];
      for (let index = 0; index < chunks.length; index += 1) {
        const embedding = await lmStudioService.createEmbedding(chunks[index]);
        chunksWithEmbedding.push({
          chunk_index: index,
          text: chunks[index],
          embedding
        });
      }

      document.status = 'indexed';
      document.chunk_count = chunks.length;
      document.indexed_at = new Date();
      document.error_message = null;
      await document.save();

      if (qdrantService.enabled) {
        const points = await qdrantService.upsertChunks(document, chunksWithEmbedding);
        await KnowledgeChunk.insertMany(chunksWithEmbedding.map((chunk, index) => ({
          document_id: document._id,
          chunk_index: chunk.chunk_index,
          text: chunk.text,
          vector_store: 'qdrant',
          qdrant_point_id: points[index]?.id || qdrantService.pointId(document._id, chunk.chunk_index)
        })));
      } else {
        await KnowledgeChunk.insertMany(chunksWithEmbedding.map((chunk) => ({
          document_id: document._id,
          chunk_index: chunk.chunk_index,
          text: chunk.text,
          embedding: chunk.embedding,
          vector_store: 'mongo'
        })));
      }

      return document;
    } catch (error) {
      document.status = 'failed';
      document.error_message = error.message;
      await document.save();
      logger.error('Knowledge reindex failed:', error);
      return document;
    }
  }

  async updateDocument(id, { title, text }) {
    const document = await KnowledgeDocument.findById(id);
    if (!document) {
      throw new Error('Dokumen knowledge tidak ditemukan');
    }
    if (document.status_active === true) {
      throw new Error('Dokumen knowledge sudah dihapus');
    }

    const normalizedTitle = (title || '').toString().trim();
    const extractedText = this.normalizeKnowledgeText((text || '').toString().trim());

    if (!normalizedTitle) {
      throw new Error('Judul knowledge wajib diisi');
    }
    if (normalizedTitle.length > 120) {
      throw new Error('Judul knowledge maksimal 120 karakter');
    }
    if (extractedText.length < 20) {
      throw new Error('Isi knowledge minimal 20 karakter');
    }

    document.title = normalizedTitle;
    document.original_filename = normalizedTitle;
    document.extracted_text = extractedText;
    document.mime_type = 'text/plain';
    document.size_bytes = Buffer.byteLength(extractedText, 'utf8');
    document.status = 'processing';
    document.error_message = null;
    await document.save();

    return this.reindexDocument(document._id);
  }

  async deleteDocument(id) {
    const document = await KnowledgeDocument.findOne({ _id: id, status_active: { $ne: true } });
    if (!document) {
      throw new Error('Dokumen knowledge tidak ditemukan');
    }
    document.status_active = true;
    await document.save();
    try {
      await qdrantService.setDocumentActive(document._id, true);
    } catch (error) {
      logger.warn('Failed to sync inactive knowledge state to Qdrant:', error.message);
    }
    return document;
  }

  async activateDocument(id) {
    const document = await KnowledgeDocument.findById(id);
    if (!document) {
      throw new Error('Dokumen knowledge tidak ditemukan');
    }
    document.status_active = false;
    await document.save();
    try {
      await qdrantService.setDocumentActive(document._id, false);
    } catch (error) {
      logger.warn('Failed to sync active knowledge state to Qdrant:', error.message);
    }
    return document;
  }

  async listDocuments() {
    return KnowledgeDocument.find()
      .sort({ createdAt: -1 });
  }

  async retrieveContext(question, conversationMemory = []) {
    const searchResult = await aiToolsService.searchKnowledge({
      query: question,
      conversationMemory,
      topK: this.topK
    });
    return searchResult.results;
  }

  async searchKnowledge(question, conversationMemory = [], traceRunId = null) {
    await aiTraceService.addEvent(traceRunId, 'SEARCH_KNOWLEDGE_STARTED', {
      tool: 'search_knowledge',
      query: question,
      top_k: this.topK,
      memory_message_count: conversationMemory.length
    });

    const needsBroaderKnowledge =
      this.isHardwareDetailInquiry(question, conversationMemory) ||
      this.isPriceListInquiry(question, conversationMemory);

    const searchResult = await aiToolsService.searchKnowledge({
      query: question,
      conversationMemory,
      topK: needsBroaderKnowledge ? Math.max(this.topK, 10) : this.topK
    });
    const results = await this.enrichKnowledgeResults(question, conversationMemory, searchResult.results);

    await aiTraceService.addEvent(traceRunId, 'SEARCH_KNOWLEDGE_FINISHED', {
      tool: 'search_knowledge',
      provider: searchResult.provider,
      result_count: results.length,
      results: results.map((chunk) => ({
        document_id: chunk.document_id?._id?.toString?.() || chunk.document_id?._id || null,
        document_title: chunk.document_id?.title,
        chunk_index: chunk.chunk_index,
        score: chunk.score,
        text_preview: (chunk.text || '').slice(0, 180)
      }))
    });

    return results;
  }

  isHardwareDetailInquiry(question = '', conversationMemory = []) {
    const memoryText = this.formatConversationMemory(conversationMemory);
    const combined = `${memoryText}\n${question || ''}`.toLowerCase();
    return /(hardware|perangkat|item|dapet\s+apa|dapat\s+apa|rincian|rinci|108\s*juta|108jt|108\.890\.000|software\s*&\s*hardware)/i.test(combined) &&
      /(gold\s+store|full|nagatech|108|hardware|perangkat|item)/i.test(combined);
  }

  isPriceListInquiry(question = '', conversationMemory = []) {
    const memoryText = this.formatConversationMemory(conversationMemory);
    const combined = `${memoryText}\n${question || ''}`.toLowerCase();
    return /(harga|berapa|biaya|price|tarif|paket|software\s+only|software\s*&\s*hardware|maintenance|berlangganan|bulanan|lite\s+version|full\s+version|\blite\b|\bfull\b)/i.test(combined) &&
      /(nagatech|nagagold|gold\s+store|grocery|manufacture|member|virtual|jewelry|ledger|hq|anti|stock\s+taking|trading|catalogue|e-?commerce|pawn|lite|full)/i.test(combined);
  }

  getPriceListSectionPattern(question = '', conversationMemory = []) {
    const memoryText = this.formatConversationMemory(conversationMemory);
    const combined = `${memoryText}\n${question || ''}`.toLowerCase();

    if (/lite\s+version|\blite\b/.test(combined)) {
      return /Lite Version:|Nagatech Gold Store Solution Lite Version|Nagatech Gold Grocery Solution Lite Version|Nagatech Gold Manufacture Solution Lite Version/i;
    }
    if (/other\s+version|add\s*on|member|virtual|jewelry|ledger|hq|anti|stock\s+taking|trading|catalogue|e-?commerce|pawn|diamond/.test(combined)) {
      return /Other Version \/ Add On:|Nagatech Gold & Diamond Store Solution|Nagatech Member Solution|Nagatech Virtual Member Solution|Nagatech Jewelry|Nagatech Gold Store Ledger|Nagatech Gold Store HQ|Nagatech Anti|Nagatech Gold Stock Taking|Nagatech Gold Trading|Nagatech e-Commerce|Nagatech Gold Pawn/i;
    }
    if (/full\s+version|\bfull\b|gold\s+store|grocery|manufacture|108\.?890\.?000/.test(combined)) {
      return /Full Version:|Nagatech Gold Store Solution Full Version|Nagatech Gold Grocery Solution Full Version|Nagatech Gold Manufacture Solution Full Version/i;
    }

    return /PRICE LIST NAGATECH|Full Version:|Lite Version:|Other Version \/ Add On:/i;
  }

  getRelevantPriceListKnowledgeText(question = '', conversationMemory = []) {
    const source = this.getNagatechPriceListKnowledgeText();
    const memoryText = this.formatConversationMemory(conversationMemory);
    const combined = `${memoryText}\n${question || ''}`.toLowerCase();
    const header = this.sliceSection(source, 'PRICE LIST NAGATECH', 'Full Version:');

    if (/lite\s+version|\blite\b/.test(combined)) {
      return [header, this.sliceSection(source, 'Lite Version:', 'Other Version / Add On:')]
        .filter(Boolean)
        .join('\n\n');
    }
    if (/other\s+version|add\s*on|member|virtual|jewelry|ledger|hq|anti|stock\s+taking|trading|catalogue|e-?commerce|pawn|diamond/.test(combined)) {
      return [header, this.sliceSection(source, 'Other Version / Add On:', null)]
        .filter(Boolean)
        .join('\n\n');
    }
    if (/full\s+version|\bfull\b|gold\s+store|grocery|manufacture|108\.?890\.?000/.test(combined)) {
      return [header, this.sliceSection(source, 'Full Version:', 'Lite Version:')]
        .filter(Boolean)
        .join('\n\n');
    }

    return source;
  }

  async enrichKnowledgeResults(question, conversationMemory = [], results = []) {
    const shouldIncludeHardware = this.isHardwareDetailInquiry(question, conversationMemory);
    const shouldIncludePriceList = this.isPriceListInquiry(question, conversationMemory);

    if (!shouldIncludeHardware && !shouldIncludePriceList) {
      return results;
    }

    const extraTextQueries = [];
    if (shouldIncludePriceList) {
      extraTextQueries.push({ text: { $regex: this.getPriceListSectionPattern(question, conversationMemory) } });
    }
    if (shouldIncludeHardware) {
      extraTextQueries.push({
        text: {
          $regex: /(ORDER KONFIRMASI NAGATECH GOLD STORE SOLUTION FULL VERSION|Rincian item hardware\/perangkat|Epson Printer L121|Barcode Printer SATO CG 408TT|Laptop \(Sales \+ Kasir\)|Grand Total: Rp 108\.890\.000)/i
        }
      });
    }

    const extraChunks = await KnowledgeChunk.find({
      $or: extraTextQueries
    })
      .populate('document_id', 'title status status_active')
      .lean();

    let activeExtraChunks = extraChunks
      .filter((chunk) => chunk.document_id?.status === 'indexed' && chunk.document_id?.status_active !== true)
      .map((chunk) => ({
        ...chunk,
        score: Math.max(chunk.score || 0, shouldIncludePriceList ? 1.2 : 1.1)
      }));

    const hasPriceListChunk = activeExtraChunks.some((chunk) => /PRICE LIST NAGATECH|Full Version:|Lite Version:|Other Version \/ Add On:/i.test(chunk.text || ''));
    if (shouldIncludePriceList && !hasPriceListChunk) {
      activeExtraChunks = [
        {
          _id: 'builtin-price-list',
          text: this.getRelevantPriceListKnowledgeText(question, conversationMemory),
          score: 1.2,
          chunk_index: 0,
          document_id: {
            _id: 'builtin-price-list',
            title: 'PRICE LIST NAGATECH',
            status: 'indexed',
            status_active: false
          }
        },
        ...activeExtraChunks
      ];
    }

    if (activeExtraChunks.length === 0) {
      return results;
    }

    const seen = new Set();
    return [...activeExtraChunks, ...results]
      .filter((chunk) => {
        const key = chunk.qdrant_point_id || chunk._id?.toString?.() || `${chunk.document_id?._id}:${chunk.chunk_index}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, Math.max(this.topK, 8));
  }

  async getVectorStoreStatus() {
    return qdrantService.getStatus();
  }

  formatConversationMemory(messages = []) {
    return messages
      .map((message) => {
        const text = (message.text || '').toString().trim();
        if (!text) return null;
        const role = message.role === 'assistant' ? 'Bot/Admin' : 'Customer';
        return `${role}: ${text}`;
      })
      .filter(Boolean)
      .join('\n');
  }

  isBuyingIntent(question = '') {
    return /mau\s+(beli|pesan|order|pasang|langganan|ambil)|ingin\s+(beli|pesan|order|pasang|langganan|ambil)|jadi\s+(beli|ambil)|lanjut\s+(beli|order|proses)|minta\s+(demo|jadwal|penawaran\s+resmi|quotation|invoice|dihubungi)|hubungi\s+saya|jadwal\s+(demo|survey|pemasangan|kunjungan)|siap\s+(beli|order|pasang)|deal/i
      .test(question || '');
  }

  isPriceOnlyInquiry(question = '') {
    const text = question || '';
    return /(harga|berapa|biaya|price|tarif|paket)/i.test(text) && !this.isBuyingIntent(text);
  }

  buildMessages(question, contexts, conversationMemory = [], options = {}) {
    const hasKnowledgeContext = contexts.length > 0;
    const contextText = contexts
      .map((chunk, index) => `[${index + 1}] ${chunk.document_id?.title || 'Knowledge'}\n${chunk.text}`)
      .join('\n\n');
    const memoryText = this.formatConversationMemory(conversationMemory) || 'Tidak ada riwayat percakapan sebelumnya.';
    const knowledgeInstruction = hasKnowledgeContext
      ? 'Jawaban fakta tentang Nagatech wajib berdasarkan konteks knowledge yang diberikan, bukan hanya riwayat percakapan.'
      : 'Tidak ada konteks knowledge yang cukup relevan. Tetap jawab sapaan, basa-basi, klarifikasi, dan pertanyaan marketing umum secara natural. Jangan mengarang detail spesifik Nagatech seperti harga, paket, alamat, kontak, promo, atau fitur jika tidak ada di knowledge; untuk detail spesifik yang belum tersedia, sampaikan bahwa pertanyaan akan diteruskan ke admin.';
    const contextLabel = hasKnowledgeContext ? contextText : 'Tidak ada konteks knowledge yang cukup relevan.';
    const qualificationInstruction = [
      'Jangan langsung meminta data lengkap saat customer baru menyapa atau baru bertanya umum.',
      'Pertanyaan harga, biaya, paket, fitur, perbandingan, atau daftar program adalah tahap informasi. Jangan minta data owner/toko/alamat/nomor HP pada tahap ini.',
      'Jika customer bertanya harga dan harga ada di konteks knowledge, jawab harga tersebut langsung dengan jelas. Setelah itu cukup tawarkan bantuan lanjutan secara ringan, misalnya apakah ingin dijelaskan fitur atau perbedaannya.',
      'Jika customer bertanya harga tetapi harga tidak ada di konteks knowledge, sampaikan bahwa harga belum tersedia di data knowledge dan dapat diteruskan ke admin. Jangan meminta data lengkap kecuali customer memang minta penawaran resmi atau ingin dihubungi.',
      'Minta data lead hanya setelah ada sinyal minat kuat, misalnya customer mengatakan mau beli/order/pasang, minta demo/jadwal demo, minta penawaran resmi/quotation/invoice, meminta dihubungi, atau setuju lanjut proses.',
      'Jika sinyal minat kuat muncul, minta data yang belum tersedia secara natural: nama owner/pemilik, nama toko, daerah/alamat toko, nomor HP aktif, dan program yang diminati.',
      'Jika customer minta demo atau jadwal demo, minta juga program yang ingin didemokan jika belum jelas. Data ini akan diteruskan sebagai request demo, bukan order pembelian.',
      'Jika customer ingin beli/order/pasang, catat program sebagai orderan pembelian.',
      'Jika customer sudah memberikan sebagian data, jangan minta ulang data tersebut; cukup minta kekurangannya.',
      'Jika data lead dan satu orderan sudah lengkap, konfirmasi orderan yang dicatat dan tanyakan singkat apakah ada program lain yang ingin ditambahkan.',
      'Jika customer menambah program lain, sebutkan ulang daftar orderan sebelumnya ditambah orderan baru dalam bentuk list bernomor.',
      'Jika data request demo dan satu program demo sudah lengkap, konfirmasi program demo yang dicatat dan tanyakan singkat apakah ada program lain yang ingin didemokan.',
      'Jika customer menambah program demo lain, sebutkan ulang daftar program demo sebelumnya ditambah program demo baru dalam bentuk list bernomor.',
      'Bedakan list order pembelian dan list program demo. Jangan menyebut request demo sebagai order pembelian.',
      'Jika customer hanya menyapa, balas sapaan dan tawarkan bantuan terkait program/solusi Nagatech.'
    ].join('\n');
    const whatsappFormatInstruction = [
      'Format jawaban wajib konsisten untuk WhatsApp:',
      'Gunakan bold WhatsApp dengan satu tanda bintang saja, contoh: *Nagatech Gold Store Solution*. Jangan pernah memakai format markdown double-star seperti **teks**.',
      'Jika menjawab daftar program, kelompokkan berdasarkan kategori dengan heading singkat seperti *Solusi Toko & Penjualan:* lalu bullet di baris terpisah.',
      'Gunakan bullet "• " untuk daftar biasa dan nomor "1. " untuk daftar orderan final. Satu item wajib satu baris, jangan ditulis berjajar dalam satu paragraf.',
      'Beri satu baris kosong antar bagian agar mudah dibaca di WhatsApp.',
      'Jangan gunakan tabel, heading markdown (#), garis pemisah, atau bullet aneh selain "• ".',
      'Untuk daftar program umum, format default adalah: pembuka singkat, kategori + bullet, penutup pertanyaan bantuan.'
    ].join('\n');
    const priceListInstruction = [
      'Jika konteks knowledge berisi PRICE LIST NAGATECH, jawab angka dari baris program dan kolom yang ditanyakan customer.',
      'Bedakan kolom Software Only, Software & Hardware, dan Biaya Berlangganan Bulanan & Maintenance/bln.',
      'Jika customer bertanya biaya bulanan, berlangganan, atau maintenance, gunakan kolom Biaya Berlangganan Bulanan & Maintenance/bln.',
      'Jika customer bertanya software only, gunakan kolom Software Only.',
      'Jika customer bertanya software dan hardware, gunakan kolom Software & Hardware.',
      'Jangan memakai harga dari riwayat percakapan jika konteks PRICE LIST NAGATECH memiliki angka yang lebih spesifik untuk kolom yang ditanya.'
    ].join('\n');
    const orderConfirmationInstruction = [
      'Jika konteks knowledge berisi ORDER KONFIRMASI NAGATECH GOLD STORE SOLUTION FULL VERSION, gunakan rincian item dari dokumen tersebut untuk menjawab pertanyaan tentang paket Rp108.890.000.',
      'Jika customer bertanya "hardware dapet apa saja", "108 juta dapet apa", atau rincian paket Software & Hardware, jawab dengan list item, kuantiti, harga satuan, dan total harga jika tersedia.',
      'Untuk pertanyaan hardware, fokuskan pada item perangkat seperti printer, scanner, laptop, komputer, UPS, camera, dan timbangan. Consumable seperti label dan faktur boleh disebut terpisah jika relevan.',
      'Jangan menjawab bahwa data item hardware belum tercantum jika konteks ORDER KONFIRMASI memuat rincian item.'
    ].join('\n');
    const latestIntentInstruction = this.isPriceOnlyInquiry(question)
      ? 'Intent pertanyaan terbaru: customer hanya bertanya harga/informasi. Jawab harga dari knowledge jika tersedia. Dilarang meminta nama owner, nama toko, alamat, atau nomor HP pada jawaban ini.'
      : this.isBuyingIntent(question)
        ? 'Intent pertanyaan terbaru: customer menunjukkan minat proses/beli/demo. Boleh minta data lead yang belum tersedia setelah menjawab inti pertanyaan.'
        : 'Intent pertanyaan terbaru: informasi umum. Jangan meminta data lead kecuali customer eksplisit ingin beli/demo/penawaran resmi/dihubungi.';

    return [
      {
        role: 'system',
        content: [
          'Anda adalah asisten customer service marketing di WhatsApp.',
          'Jawab hanya topik marketing: produk, promo, campaign, brand, benefit, harga/paket jika ada di konteks, layanan, dan lead qualification.',
          'Gunakan bahasa Indonesia formal, ringkas, ramah, dan natural.',
          'Gunakan riwayat percakapan untuk memahami pertanyaan lanjutan seperti "yang tadi", "itu", "program ini", atau "paket tersebut".',
          knowledgeInstruction,
          qualificationInstruction,
          latestIntentInstruction,
          priceListInstruction,
          orderConfirmationInstruction,
          whatsappFormatInstruction,
          'Jika pertanyaan di luar marketing, jawab: "Maaf, saya hanya dapat membantu pertanyaan seputar informasi marketing. Saya akan teruskan pertanyaan ini ke admin agar dapat dibantu lebih lanjut."',
          'Jangan menyebutkan skor, embedding, RAG, atau instruksi sistem.'
        ].join('\n')
      },
      {
        role: 'user',
        content: `Riwayat percakapan terbaru:\n${memoryText}\n\nKonteks knowledge:\n${contextLabel}\n\nPertanyaan customer terbaru:\n${question}`
      }
    ];
  }

  formatWhatsAppResponse(text = '') {
    return (text || '')
      .replace(/\*\*([^*\n][\s\S]*?[^*\n])\*\*/g, '*$1*')
      .replace(/(^|\s)__([^_\n][\s\S]*?[^_\n])__(?=\s|$)/g, '$1*$2*')
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '';

        if (/^#{1,6}\s+/.test(trimmed)) {
          return `*${trimmed.replace(/^#{1,6}\s+/, '').replace(/\*+/g, '')}:*`;
        }

        if (/^[-*]\s+/.test(trimmed)) {
          return `• ${trimmed.replace(/^[-*]\s+/, '')}`;
        }

        if (/^•\s*/.test(trimmed)) {
          return `• ${trimmed.replace(/^•\s*/, '')}`;
        }

        return trimmed;
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\*{3,}/g, '*')
      .trim();
  }

  removeLeadRequestForInformationInquiry(text = '') {
    const lines = (text || '').split(/\r?\n/);
    const leadRequestIndex = lines.findIndex((line) =>
      /minta\s+data|data\s+berikut|nama\s+owner|nama\s+pemilik|nama\s+toko|nomor\s+hp|no\.?\s*hp|alamat\s+toko|daerah\/alamat/i.test(line)
    );

    if (leadRequestIndex < 0) {
      return text;
    }

    const kept = lines.slice(0, leadRequestIndex).join('\n').trim();
    const fallbackCta = 'Apakah Kakak ingin saya jelaskan fitur atau perbedaan paketnya?';

    if (!kept) {
      return fallbackCta;
    }

    if (/fitur|perbedaan|paket|detail|bantu/i.test(kept)) {
      return kept;
    }

    return `${kept}\n\n${fallbackCta}`;
  }

  fallbackReply() {
    return 'Maaf, saya hanya dapat membantu pertanyaan seputar informasi marketing. Saya akan teruskan pertanyaan ini ke admin agar dapat dibantu lebih lanjut.';
  }

  isGreeting(question = '') {
    const text = (question || '').toLowerCase().trim();
    return /^(halo|hallo|hello|hai|hi|pagi|selamat\s+pagi|siang|selamat\s+siang|sore|selamat\s+sore|malam|selamat\s+malam|assalamualaikum|permisi|tes|test)[\s!.?]*$/i.test(text);
  }

  serviceErrorReply(question = '') {
    if (this.isGreeting(question)) {
      return 'Halo, terima kasih sudah menghubungi Nagatech. Ada yang bisa kami bantu terkait program atau solusi untuk bisnis emas Anda?';
    }

    return 'Mohon maaf, sistem AI sedang mengalami kendala sementara. Pertanyaan Anda akan kami teruskan ke admin agar dapat dibantu lebih lanjut.';
  }

  markAdminFollowUp(question, answer) {
    return aiToolsService.markAdminFollowUp({ question, answer });
  }

  async generateAnswer(question, options = {}) {
    if (!this.isEnabled()) {
      return null;
    }

    let traceRunId = options.traceRunId || null;
    try {
      const conversationMemory = options.conversationMemory || [];
      traceRunId = traceRunId || await aiTraceService.startRun({
        phone: options.phone || null,
        messageId: options.messageId || null,
        waMessageId: options.waMessageId || null,
        userMessage: question
      });

      await aiTraceService.addEvent(traceRunId, 'CONVERSATION_MEMORY_BUILT', {
        message_count: conversationMemory.length,
        messages: conversationMemory
      });

      const contexts = await this.searchKnowledge(question, conversationMemory, traceRunId);
      const bestScore = contexts[0]?.score || 0;
      const hasRelevantContext = contexts.length > 0 && bestScore >= this.similarityThreshold;
      const messages = this.buildMessages(question, hasRelevantContext ? contexts : [], conversationMemory);

      await aiTraceService.addEvent(traceRunId, 'MODEL_REQUEST_CREATED', {
        provider: lmStudioService.chatProvider,
        model: lmStudioService.chatModel,
        has_relevant_context: hasRelevantContext,
        best_score: bestScore,
        messages
      });

      const rawText = await lmStudioService.createChatCompletion(messages);
      const text = this.formatWhatsAppResponse(
        this.isPriceOnlyInquiry(question)
          ? this.removeLeadRequestForInformationInquiry(rawText)
          : rawText
      );
      await aiTraceService.addEvent(traceRunId, 'MODEL_RESPONSE_RECEIVED', {
        raw_text: rawText,
        text,
        character_count: text.length
      });

      const usedFallback = text.toLowerCase().includes('saya hanya dapat membantu pertanyaan seputar informasi marketing');
      const followUp = this.markAdminFollowUp(question, text);
      const needsAdminFollowUp = usedFallback || followUp.needed;
      const finalFollowUp = needsAdminFollowUp
        ? {
            ...followUp,
            needed: true,
            category: followUp.category || 'handoff',
            reason: followUp.reason || 'Pertanyaan perlu diteruskan ke admin.',
            summary: followUp.summary || question
          }
        : followUp;
      await aiTraceService.addEvent(traceRunId, 'MARK_ADMIN_FOLLOW_UP_EVALUATED', {
        tool: 'mark_admin_follow_up',
        follow_up: finalFollowUp
      });

      const source = hasRelevantContext
        ? (needsAdminFollowUp ? 'rag_admin_follow_up' : 'rag')
        : (needsAdminFollowUp ? 'llm_no_context_admin_follow_up' : 'llm_no_context');

      await aiTraceService.completeRun(traceRunId, {
        answer: text,
        source,
        confidence: bestScore,
        follow_up: finalFollowUp
      });

      return {
        text,
        shouldSend: true,
        needsAdminFollowUp,
        followUp: finalFollowUp,
        confidence: bestScore,
        source,
        traceRunId
      };
    } catch (error) {
      logger.error('RAG answer generation failed:', error);
      if (traceRunId) {
        await aiTraceService.failRun(traceRunId, error).catch(() => {});
      }
      return {
        text: this.serviceErrorReply(question),
        shouldSend: true,
        needsAdminFollowUp: true,
        followUp: {
          needed: true,
          category: 'rag_error',
          reason: error.message,
          summary: question
        },
        confidence: 0,
        source: 'rag_error',
        traceRunId
      };
    }
  }
}

module.exports = new RAGService();
