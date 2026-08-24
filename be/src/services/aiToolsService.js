const KnowledgeChunk = require('../models/KnowledgeChunk');
const lmStudioService = require('./lmStudioService');
const qdrantService = require('./qdrantService');

class AiToolsService {
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

  async searchKnowledge({ query, conversationMemory = [], topK = 5 }) {
    const memoryText = conversationMemory
      .map((message) => `${message.role === 'assistant' ? 'Bot/Admin' : 'Customer'}: ${message.text || ''}`)
      .join('\n')
      .trim();
    const queryText = memoryText ? `${memoryText}\n\nPertanyaan terbaru:\n${query}` : query;
    const queryEmbedding = await lmStudioService.createEmbedding(queryText);

    if (qdrantService.enabled) {
      const points = await qdrantService.search(queryEmbedding, topK);
      return {
        provider: 'qdrant',
        query,
        results: points
          .map((point) => ({
            _id: point.id,
            text: point.payload?.text || '',
            score: point.score || 0,
            chunk_index: point.payload?.chunk_index,
            qdrant_point_id: point.id,
            document_id: {
              _id: point.payload?.document_id,
              title: point.payload?.document_title || 'Knowledge',
              status: point.payload?.document_status || 'indexed',
              status_active: point.payload?.status_active
            }
          }))
          .filter((chunk) => chunk.text)
      };
    }

    const chunks = await KnowledgeChunk.find()
      .populate('document_id', 'title status status_active')
      .lean();

    return {
      provider: 'mongo',
      query,
      results: chunks
        .filter((chunk) => chunk.document_id?.status === 'indexed' && chunk.document_id?.status_active !== true)
        .map((chunk) => ({
          ...chunk,
          score: this.cosineSimilarity(queryEmbedding, chunk.embedding)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
    };
  }

  markAdminFollowUp({ question, answer }) {
    const combined = `${question || ''}\n${answer || ''}`.toLowerCase();
    const patterns = [
      {
        category: 'handoff',
        reason: 'AI menyatakan pertanyaan perlu diteruskan ke admin.',
        regex: /teruskan.*admin|admin.*dibantu|admin.*tindak\s*lanjut|diteruskan\s+ke\s+admin|tindak\s*lanjut|follow\s*up|kami\s+catat|telah\s+dicatat|akan\s+dicatat/
      },
      {
        category: 'installation_lead',
        reason: 'Customer membahas jadwal, tanggal, lokasi, cabang, atau rencana pemasangan.',
        regex: /tanggal\s+(pemasangan|pasang|implementasi|kunjungan|survey)|jadwal\s+(pemasangan|pasang|implementasi|kunjungan|survey)|lokasi\s+(cabang|toko|kantor|pemasangan)|alamat\s+(cabang|toko|kantor|pemasangan)|cabang\s+baru|rencana\s+penambahan\s+cabang|estimasi\s+waktu/
      },
      {
        category: 'lead_contact',
        reason: 'Customer memberi sinyal ingin dihubungi tim marketing/sales/admin.',
        regex: /tim\s+(kami|marketing|sales|admin)|menghubungi\s+anda|menghubungi\s+kembali|hubungi\s+saya|kontak\s+saya|minta\s+dihubungi/
      }
    ];

    const match = patterns.find((item) => item.regex.test(combined));
    if (!match) {
      return {
        needed: false,
        category: null,
        reason: null,
        summary: null
      };
    }

    return {
      needed: true,
      category: match.category,
      reason: match.reason,
      summary: (question || answer || '').toString().trim().slice(0, 240)
    };
  }
}

module.exports = new AiToolsService();
