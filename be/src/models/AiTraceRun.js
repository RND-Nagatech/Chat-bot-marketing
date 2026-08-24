const mongoose = require('mongoose');

const aiTraceEventSchema = new mongoose.Schema({
  sequence: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    required: true,
    trim: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const aiTraceRunSchema = new mongoose.Schema({
  run_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  phone: {
    type: String,
    default: null,
    index: true
  },
  message_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
    index: true
  },
  wa_message_id: {
    type: String,
    default: null
  },
  user_message: {
    type: String,
    default: ''
  },
  answer: {
    type: String,
    default: null
  },
  source: {
    type: String,
    default: null,
    index: true
  },
  confidence: {
    type: Number,
    default: 0
  },
  follow_up: {
    needed: {
      type: Boolean,
      default: false
    },
    category: {
      type: String,
      default: null
    },
    reason: {
      type: String,
      default: null
    },
    summary: {
      type: String,
      default: null
    }
  },
  status: {
    type: String,
    enum: ['running', 'completed', 'failed'],
    default: 'running',
    index: true
  },
  error: {
    type: String,
    default: null
  },
  events: {
    type: [aiTraceEventSchema],
    default: []
  },
  started_at: {
    type: Date,
    default: Date.now,
    index: true
  },
  completed_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

aiTraceRunSchema.index({ started_at: -1 });
aiTraceRunSchema.index({ phone: 1, started_at: -1 });

module.exports = mongoose.model('AiTraceRun', aiTraceRunSchema);
