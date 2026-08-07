const crypto = require('crypto');
const logger = require('../utils/logger');

class QdrantService {
  get enabled() {
    return process.env.VECTOR_STORE_PROVIDER === 'qdrant';
  }

  get baseUrl() {
    return (process.env.QDRANT_URL || 'http://localhost:6333').replace(/\/$/, '');
  }

  get collectionName() {
    return process.env.QDRANT_COLLECTION || 'wa_knowledge_chunks';
  }

  get apiKey() {
    return process.env.QDRANT_API_KEY || '';
  }

  get vectorSize() {
    const configured = Number(process.env.QDRANT_VECTOR_SIZE || process.env.LOCAL_EMBEDDING_DIMENSIONS);
    return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 384;
  }

  get distance() {
    return process.env.QDRANT_DISTANCE || 'Cosine';
  }

  headers(extra = {}) {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { 'api-key': this.apiKey } : {}),
      ...extra
    };
  }

  async request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: this.headers(options.headers || {})
      });
    } catch (error) {
      throw new Error(`Qdrant tidak terhubung di ${this.baseUrl}. Jalankan Qdrant lalu coba reindex ulang.`);
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.status?.error || data?.error || `Qdrant request failed with status ${response.status}`);
    }

    return data;
  }

  pointId(documentId, chunkIndex) {
    const hash = crypto
      .createHash('sha1')
      .update(`${documentId}:${chunkIndex}`)
      .digest('hex');
    return [
      hash.slice(0, 8),
      hash.slice(8, 12),
      `4${hash.slice(13, 16)}`,
      `${((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hash.slice(18, 20)}`,
      hash.slice(20, 32)
    ].join('-');
  }

  documentFilter(documentId) {
    return {
      must: [
        {
          key: 'document_id',
          match: { value: documentId.toString() }
        }
      ]
    };
  }

  async ensureCollection() {
    if (!this.enabled) {
      return;
    }

    try {
      await this.request(`/collections/${encodeURIComponent(this.collectionName)}`);
    } catch (error) {
      await this.request(`/collections/${encodeURIComponent(this.collectionName)}`, {
        method: 'PUT',
        body: JSON.stringify({
          vectors: {
            size: this.vectorSize,
            distance: this.distance
          }
        })
      });
      logger.info(`Qdrant collection created: ${this.collectionName}`);
    }
  }

  async deleteDocumentPoints(documentId) {
    if (!this.enabled) {
      return;
    }
    await this.ensureCollection();
    await this.request(`/collections/${encodeURIComponent(this.collectionName)}/points/delete?wait=true`, {
      method: 'POST',
      body: JSON.stringify({
        filter: this.documentFilter(documentId)
      })
    });
  }

  async upsertChunks(document, chunksWithEmbedding) {
    if (!this.enabled) {
      return [];
    }
    await this.ensureCollection();

    const points = chunksWithEmbedding.map((chunk) => ({
      id: this.pointId(document._id, chunk.chunk_index),
      vector: chunk.embedding,
      payload: {
        document_id: document._id.toString(),
        document_title: document.title,
        document_status: document.status,
        status_active: Boolean(document.status_active),
        chunk_index: chunk.chunk_index,
        text: chunk.text
      }
    }));

    if (points.length === 0) {
      return [];
    }

    await this.request(`/collections/${encodeURIComponent(this.collectionName)}/points?wait=true`, {
      method: 'PUT',
      body: JSON.stringify({ points })
    });

    return points;
  }

  async setDocumentActive(documentId, isActive) {
    if (!this.enabled) {
      return;
    }
    await this.ensureCollection();
    await this.request(`/collections/${encodeURIComponent(this.collectionName)}/points/payload?wait=true`, {
      method: 'POST',
      body: JSON.stringify({
        payload: { status_active: Boolean(isActive) },
        filter: this.documentFilter(documentId)
      })
    });
  }

  async search(queryEmbedding, limit) {
    await this.ensureCollection();

    const data = await this.request(`/collections/${encodeURIComponent(this.collectionName)}/points/search`, {
      method: 'POST',
      body: JSON.stringify({
        vector: queryEmbedding,
        limit,
        with_payload: true,
        with_vector: false,
        filter: {
          must: [
            { key: 'status_active', match: { value: false } },
            { key: 'document_status', match: { value: 'indexed' } }
          ]
        }
      })
    });

    return data?.result || [];
  }

  async getStatus() {
    if (!this.enabled) {
      return {
        provider: 'mongo',
        connected: true,
        collection: null,
        base_url: null
      };
    }

    try {
      await this.ensureCollection();
      return {
        provider: 'qdrant',
        connected: true,
        collection: this.collectionName,
        base_url: this.baseUrl,
        vector_size: this.vectorSize,
        distance: this.distance
      };
    } catch (error) {
      logger.warn(`Qdrant status check failed: ${error.message}`);
      return {
        provider: 'qdrant',
        connected: false,
        collection: this.collectionName,
        base_url: this.baseUrl,
        vector_size: this.vectorSize,
        distance: this.distance,
        error: error.message
      };
    }
  }
}

module.exports = new QdrantService();
