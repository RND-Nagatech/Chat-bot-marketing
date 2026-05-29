const logger = require('../utils/logger');

class LMStudioService {
  get baseUrl() {
    return (process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1').replace(/\/$/, '');
  }

  get chatModel() {
    return process.env.LM_STUDIO_CHAT_MODEL || 'local-model';
  }

  get embeddingModel() {
    return process.env.LM_STUDIO_EMBEDDING_MODEL || this.chatModel;
  }

  get timeoutMs() {
    const configured = Number(process.env.LM_STUDIO_TIMEOUT_MS);
    return Number.isFinite(configured) && configured > 0 ? configured : 30000;
  }

  async request(path, payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error?.message || `LM Studio request failed with status ${response.status}`);
      }

      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async createEmbedding(input) {
    const text = (input || '').toString().trim();
    if (!text) {
      throw new Error('Embedding input is empty');
    }

    const data = await this.request('/embeddings', {
      model: this.embeddingModel,
      input: text
    });

    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('LM Studio returned an invalid embedding');
    }

    return embedding;
  }

  async createChatCompletion(messages, options = {}) {
    const data = await this.request('/chat/completions', {
      model: this.chatModel,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 350
    });

    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('LM Studio returned an empty chat response');
    }

    return content.trim();
  }

  async getStatus() {
    try {
      await this.createChatCompletion([
        { role: 'system', content: 'Jawab hanya dengan kata OK.' },
        { role: 'user', content: 'Ping' }
      ], { maxTokens: 8, temperature: 0 });

      return {
        connected: true,
        base_url: this.baseUrl,
        chat_model: this.chatModel,
        embedding_model: this.embeddingModel
      };
    } catch (error) {
      logger.warn('LM Studio status check failed:', error.message);
      return {
        connected: false,
        base_url: this.baseUrl,
        chat_model: this.chatModel,
        embedding_model: this.embeddingModel,
        error: error.message
      };
    }
  }
}

module.exports = new LMStudioService();
