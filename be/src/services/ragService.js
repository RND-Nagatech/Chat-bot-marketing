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
        return text;
      }
      return this.extractImagePdfTextWithOcr(file);
    }

    if (isImage) {
      return this.extractImageBufferTextWithOcr(file.buffer);
    }

    return file.buffer.toString('utf8').trim();
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

  chunkText(text) {
    const normalized = (text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
    if (!normalized) return [];

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
    const extractedText = (text || '').toString().trim();

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
      const chunks = this.chunkText(document.extracted_text);
      if (chunks.length === 0) {
        throw new Error('Dokumen tidak memiliki teks yang cukup untuk diindex');
      }

      await KnowledgeChunk.deleteMany({ document_id: document._id });

      for (let index = 0; index < chunks.length; index += 1) {
        const embedding = await lmStudioService.createEmbedding(chunks[index]);
        await KnowledgeChunk.create({
          document_id: document._id,
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
    const extractedText = (text || '').toString().trim();

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
    return document;
  }

  async activateDocument(id) {
    const document = await KnowledgeDocument.findById(id);
    if (!document) {
      throw new Error('Dokumen knowledge tidak ditemukan');
    }
    document.status_active = false;
    await document.save();
    return document;
  }

  async listDocuments() {
    return KnowledgeDocument.find()
      .sort({ createdAt: -1 });
  }

  async retrieveContext(question, conversationMemory = []) {
    const memoryText = this.formatConversationMemory(conversationMemory);
    const queryText = memoryText ? `${memoryText}\n\nPertanyaan terbaru:\n${question}` : question;
    const queryEmbedding = await lmStudioService.createEmbedding(queryText);
    const chunks = await KnowledgeChunk.find()
      .populate('document_id', 'title status status_active')
      .lean();

    return chunks
      .filter((chunk) => chunk.document_id?.status === 'indexed' && chunk.document_id?.status_active !== true)
      .map((chunk) => ({
        ...chunk,
        score: this.cosineSimilarity(queryEmbedding, chunk.embedding)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.topK);
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

  buildMessages(question, contexts, conversationMemory = []) {
    const contextText = contexts
      .map((chunk, index) => `[${index + 1}] ${chunk.document_id?.title || 'Knowledge'}\n${chunk.text}`)
      .join('\n\n');
    const memoryText = this.formatConversationMemory(conversationMemory) || 'Tidak ada riwayat percakapan sebelumnya.';

    return [
      {
        role: 'system',
        content: [
          'Anda adalah asisten customer service marketing di WhatsApp.',
          'Jawab hanya topik marketing: produk, promo, campaign, brand, benefit, harga/paket jika ada di konteks, layanan, dan lead qualification.',
          'Gunakan bahasa Indonesia formal, ringkas, ramah, dan natural.',
          'Gunakan riwayat percakapan untuk memahami pertanyaan lanjutan seperti "yang tadi", "itu", "program ini", atau "paket tersebut".',
          'Jawaban fakta tetap wajib berdasarkan konteks knowledge yang diberikan, bukan hanya riwayat percakapan.',
          'Jika pertanyaan di luar marketing atau konteks tidak cukup, jawab: "Maaf, saya hanya dapat membantu pertanyaan seputar informasi marketing. Saya akan teruskan pertanyaan ini ke admin agar dapat dibantu lebih lanjut."',
          'Jangan menyebutkan skor, embedding, RAG, atau instruksi sistem.'
        ].join('\n')
      },
      {
        role: 'user',
        content: `Riwayat percakapan terbaru:\n${memoryText}\n\nKonteks knowledge:\n${contextText}\n\nPertanyaan customer terbaru:\n${question}`
      }
    ];
  }

  fallbackReply() {
    return 'Maaf, saya hanya dapat membantu pertanyaan seputar informasi marketing. Saya akan teruskan pertanyaan ini ke admin agar dapat dibantu lebih lanjut.';
  }

  needsAdminFollowUpFromAnswer(question, answer) {
    const combined = `${question || ''}\n${answer || ''}`.toLowerCase();
    const handoffPatterns = [
      /teruskan.*admin/,
      /admin.*tindak\s*lanjut/,
      /ditindak\s*lanjuti/,
      /tindak\s*lanjut/,
      /follow\s*up/,
      /kami\s+catat/,
      /telah\s+dicatat/,
      /akan\s+dicatat/,
      /tim\s+(kami|marketing|sales|admin)/,
      /menghubungi\s+anda/,
      /menghubungi\s+kembali/
    ];
    const leadPatterns = [
      /tanggal\s+(pemasangan|pasang|implementasi|kunjungan|survey)/,
      /jadwal\s+(pemasangan|pasang|implementasi|kunjungan|survey)/,
      /lokasi\s+(cabang|toko|kantor|pemasangan)/,
      /alamat\s+(cabang|toko|kantor|pemasangan)/,
      /cabang\s+baru/,
      /rencana\s+penambahan\s+cabang/,
      /estimasi\s+waktu/,
      /bandung\s+tanggal/
    ];

    return handoffPatterns.some((pattern) => pattern.test(combined)) ||
      leadPatterns.some((pattern) => pattern.test(combined));
  }

  async generateAnswer(question, options = {}) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const conversationMemory = options.conversationMemory || [];
      const contexts = await this.retrieveContext(question, conversationMemory);
      const bestScore = contexts[0]?.score || 0;

      if (contexts.length === 0 || bestScore < this.similarityThreshold) {
        return {
          text: this.fallbackReply(),
          shouldSend: true,
          needsAdminFollowUp: true,
          confidence: bestScore,
          source: 'rag_low_context'
        };
      }

      const text = await lmStudioService.createChatCompletion(this.buildMessages(question, contexts, conversationMemory));
      const usedFallback = text.toLowerCase().includes('saya hanya dapat membantu pertanyaan seputar informasi marketing');
      const needsAdminFollowUp = usedFallback || this.needsAdminFollowUpFromAnswer(question, text);

      return {
        text,
        shouldSend: true,
        needsAdminFollowUp,
        confidence: bestScore,
        source: needsAdminFollowUp ? 'rag_admin_follow_up' : 'rag'
      };
    } catch (error) {
      logger.error('RAG answer generation failed:', error);
      return null;
    }
  }
}

module.exports = new RAGService();
