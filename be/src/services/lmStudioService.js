const logger = require('../utils/logger');

class LMStudioService {
  get baseUrl() {
    return (process.env.EMBEDDING_BASE_URL || process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1').replace(/\/$/, '');
  }

  get chatProvider() {
    return (process.env.LLM_CHAT_PROVIDER || 'lm_studio').trim().toLowerCase();
  }

  get chatModel() {
    if (this.chatProvider === 'deepseek') {
      return process.env.ANTHROPIC_MODEL ||
        process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ||
        'deepseek-v4-pro';
    }
    return process.env.LM_STUDIO_CHAT_MODEL || 'local-model';
  }

  get anthropicBaseUrl() {
    return (process.env.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic').replace(/\/$/, '');
  }

  get anthropicToken() {
    return process.env.ANTHROPIC_AUTH_TOKEN || '';
  }

  get embeddingModel() {
    if (this.embeddingProvider === 'local_hash') {
      return `local-hash-${this.localEmbeddingDimensions}`;
    }
    return process.env.EMBEDDING_MODEL || process.env.LM_STUDIO_EMBEDDING_MODEL || 'local-model';
  }

  get embeddingProvider() {
    return (process.env.EMBEDDING_PROVIDER || 'local_hash').trim().toLowerCase();
  }

  get localEmbeddingDimensions() {
    const configured = Number(process.env.LOCAL_EMBEDDING_DIMENSIONS);
    return Number.isFinite(configured) && configured >= 64 ? Math.floor(configured) : 384;
  }

  get timeoutMs() {
    const configured = Number(process.env.LLM_TIMEOUT_MS || process.env.LM_STUDIO_TIMEOUT_MS);
    return Number.isFinite(configured) && configured > 0 ? configured : 30000;
  }

  get chatMaxTokens() {
    const configured = Number(process.env.LLM_CHAT_MAX_TOKENS);
    return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 2400;
  }

  get continuationMaxRounds() {
    const configured = Number(process.env.LLM_CONTINUATION_MAX_ROUNDS);
    return Number.isFinite(configured) && configured >= 0 ? Math.floor(configured) : 2;
  }

  async request(url, payload, headers = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error?.message || `LLM request failed with status ${response.status}`);
      }

      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`LLM request timeout after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  hashToken(token) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  tokenize(input) {
    return (input || '')
      .toString()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z0-9]+/g) || [];
  }

  createLocalEmbedding(input) {
    const tokens = this.tokenize(input);
    if (tokens.length === 0) {
      throw new Error('Embedding input is empty');
    }

    const dimensions = this.localEmbeddingDimensions;
    const vector = Array(dimensions).fill(0);
    const addFeature = (feature, weight = 1) => {
      const hash = this.hashToken(feature);
      const index = hash % dimensions;
      const sign = hash & 1 ? 1 : -1;
      vector[index] += sign * weight;
    };

    tokens.forEach((token, index) => {
      addFeature(token, 1);
      if (index < tokens.length - 1) {
        addFeature(`${token}_${tokens[index + 1]}`, 0.7);
      }
    });

    let norm = 0;
    for (const value of vector) {
      norm += value * value;
    }
    norm = Math.sqrt(norm);
    if (!norm) {
      throw new Error('Embedding input is empty');
    }

    return vector.map((value) => value / norm);
  }

  async createEmbedding(input) {
    const text = (input || '').toString().trim();
    if (!text) {
      throw new Error('Embedding input is empty');
    }

    if (this.embeddingProvider === 'local_hash') {
      return this.createLocalEmbedding(text);
    }

    const data = await this.request(`${this.baseUrl}/embeddings`, {
      model: this.embeddingModel,
      input: text
    });

    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Embedding provider returned an invalid embedding');
    }

    return embedding;
  }

  toAnthropicMessages(messages) {
    const system = [];
    const chatMessages = [];

    for (const message of messages || []) {
      if (!message?.content) continue;
      if (message.role === 'system') {
        system.push(message.content);
        continue;
      }
      chatMessages.push({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content
      });
    }

    return {
      system: system.join('\n\n'),
      messages: chatMessages.length > 0 ? chatMessages : [{ role: 'user', content: 'Ping' }]
    };
  }

  async createAnthropicChatCompletion(messages, options = {}) {
    if (!this.anthropicToken || /your|change|replace/i.test(this.anthropicToken)) {
      throw new Error('ANTHROPIC_AUTH_TOKEN belum diisi');
    }

    const anthropicMessages = this.toAnthropicMessages(messages);
    const maxTokens = options.maxTokens ?? this.chatMaxTokens;
    const maxContinuationRounds = options.continuationMaxRounds ?? this.continuationMaxRounds;
    const headers = {
      Authorization: `Bearer ${this.anthropicToken}`,
      'anthropic-version': '2023-06-01'
    };
    let currentMessages = anthropicMessages.messages;
    let combinedContent = '';

    for (let round = 0; round <= maxContinuationRounds; round += 1) {
      const data = await this.request(
        `${this.anthropicBaseUrl}/v1/messages`,
        {
          model: this.chatModel,
          system: anthropicMessages.system || undefined,
          messages: currentMessages,
          temperature: options.temperature ?? 0.2,
          max_tokens: maxTokens
        },
        headers
      );

      const content = data?.content
        ?.map((item) => (item?.type === 'text' ? item.text : ''))
        .filter(Boolean)
        .join('\n')
        .trim();

      if (content) {
        combinedContent = [combinedContent, content].filter(Boolean).join('\n').trim();
      }

      if (data?.stop_reason !== 'max_tokens') {
        break;
      }

      if (round >= maxContinuationRounds) {
        logger.warn(`DeepSeek response reached max_tokens after ${round + 1} request(s); returning best available content`);
        break;
      }

      currentMessages = [
        ...anthropicMessages.messages,
        { role: 'assistant', content: combinedContent },
        {
          role: 'user',
          content: 'Lanjutkan jawaban sebelumnya tepat dari bagian yang terpotong. Jangan ulangi bagian yang sudah ditulis. Selesaikan jawaban dengan ringkas dan tetap dalam bahasa Indonesia formal.'
        }
      ];
    }

    if (!combinedContent) {
      throw new Error('DeepSeek returned an empty chat response');
    }

    return combinedContent;
  }

  async createOpenAIChatCompletion(messages, options = {}) {
    const maxTokens = options.maxTokens ?? this.chatMaxTokens;
    const maxContinuationRounds = options.continuationMaxRounds ?? this.continuationMaxRounds;
    let currentMessages = messages;
    let combinedContent = '';

    for (let round = 0; round <= maxContinuationRounds; round += 1) {
      const data = await this.request(`${this.baseUrl}/chat/completions`, {
        model: this.chatModel,
        messages: currentMessages,
        temperature: options.temperature ?? 0.2,
        max_tokens: maxTokens
      });

      const content = data?.choices?.[0]?.message?.content;
      if (content && typeof content === 'string') {
        combinedContent = [combinedContent, content.trim()].filter(Boolean).join('\n').trim();
      }

      if (data?.choices?.[0]?.finish_reason !== 'length') {
        break;
      }

      if (round >= maxContinuationRounds) {
        logger.warn(`Chat provider response reached max_tokens after ${round + 1} request(s); returning best available content`);
        break;
      }

      currentMessages = [
        ...messages,
        { role: 'assistant', content: combinedContent },
        {
          role: 'user',
          content: 'Lanjutkan jawaban sebelumnya tepat dari bagian yang terpotong. Jangan ulangi bagian yang sudah ditulis. Selesaikan jawaban dengan ringkas dan tetap dalam bahasa Indonesia formal.'
        }
      ];
    }

    if (!combinedContent) {
      throw new Error('Chat provider returned an empty chat response');
    }

    return combinedContent;
  }

  async createChatCompletion(messages, options = {}) {
    if (this.chatProvider === 'deepseek') {
      return this.createAnthropicChatCompletion(messages, options);
    }
    return this.createOpenAIChatCompletion(messages, options);
  }

  async getStatus() {
    const status = {
      chat_provider: this.chatProvider,
      chat_connected: false,
      chat_base_url: this.chatProvider === 'deepseek' ? this.anthropicBaseUrl : this.baseUrl,
      chat_model: this.chatModel,
      embedding_provider: this.embeddingProvider,
      embedding_connected: false,
      embedding_base_url: this.embeddingProvider === 'local_hash' ? 'local' : this.baseUrl,
      embedding_model: this.embeddingModel,
      connected: false,
      base_url: this.chatProvider === 'deepseek' ? this.anthropicBaseUrl : this.baseUrl
    };

    try {
      await this.createChatCompletion([
        { role: 'system', content: 'Jawab hanya dengan kata OK.' },
        { role: 'user', content: 'Ping' }
      ], { maxTokens: 256, temperature: 0 });
      status.chat_connected = true;
    } catch (error) {
      logger.warn('Chat provider status check failed:', error.message);
      status.chat_error = error.message;
    }

    try {
      await this.createEmbedding('Ping knowledge marketing');
      status.embedding_connected = true;
    } catch (error) {
      logger.warn('Embedding provider status check failed:', error.message);
      status.embedding_error = error.message;
    }

    status.connected = status.chat_connected && status.embedding_connected;
    status.error = [status.chat_error, status.embedding_error].filter(Boolean).join(' | ') || undefined;
    return status;
  }
}

module.exports = new LMStudioService();
