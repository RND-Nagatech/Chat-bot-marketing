const crypto = require('crypto');
const AiTraceRun = require('../models/AiTraceRun');
const logger = require('../utils/logger');

const sensitiveKeyPattern = /authorization|api[_-]?key|password|secret|token|mongodb[_-]?uri|reasoning_content/i;

class AiTraceService {
  sanitize(value) {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item));
    }
    if (value && typeof value === 'object') {
      const output = {};
      for (const [key, child] of Object.entries(value)) {
        output[key] = sensitiveKeyPattern.test(key) ? '[REDACTED]' : this.sanitize(child);
      }
      return output;
    }
    return value;
  }

  async startRun({ phone = null, messageId = null, waMessageId = null, userMessage = '' } = {}) {
    const runId = crypto.randomUUID();
    await AiTraceRun.create({
      run_id: runId,
      phone,
      message_id: messageId,
      wa_message_id: waMessageId,
      user_message: userMessage,
      status: 'running',
      started_at: new Date(),
      events: [{
        sequence: 1,
        type: 'RUN_STARTED',
        data: this.sanitize({ phone, messageId, waMessageId, userMessage }),
        timestamp: new Date()
      }]
    });
    return runId;
  }

  async addEvent(runId, type, data = {}) {
    if (!runId) return;
    try {
      const current = await AiTraceRun.findOne({ run_id: runId }).select('events').lean();
      if (!current) return;
      await AiTraceRun.updateOne(
        { run_id: runId },
        {
          $push: {
            events: {
              sequence: (current.events?.length || 0) + 1,
              type,
              data: this.sanitize(data),
              timestamp: new Date()
            }
          }
        }
      );
    } catch (error) {
      logger.warn(`Failed to write AI trace event: ${error.message}`);
    }
  }

  async completeRun(runId, result = {}) {
    if (!runId) return;
    await this.addEvent(runId, 'RUN_COMPLETED', result);
    await AiTraceRun.updateOne(
      { run_id: runId },
      {
        $set: {
          status: 'completed',
          answer: result.answer || null,
          source: result.source || null,
          confidence: result.confidence || 0,
          follow_up: result.follow_up || { needed: false },
          completed_at: new Date()
        }
      }
    );
  }

  async failRun(runId, error) {
    if (!runId) return;
    const message = error?.message || String(error || 'Unknown AI error');
    await this.addEvent(runId, 'RUN_FAILED', { error: message });
    await AiTraceRun.updateOne(
      { run_id: runId },
      {
        $set: {
          status: 'failed',
          error: message,
          completed_at: new Date()
        }
      }
    );
  }

  async listRuns(limit = 50) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
    return AiTraceRun.find()
      .select('-events')
      .sort({ started_at: -1 })
      .limit(safeLimit)
      .lean();
  }

  async getRun(runId) {
    return AiTraceRun.findOne({ run_id: runId }).lean();
  }
}

module.exports = new AiTraceService();
