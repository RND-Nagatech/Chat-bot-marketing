const mongoose = require('mongoose');

const leadCaptureSchema = new mongoose.Schema({
  sales_id: {
    type: String,
    default: null,
    index: true
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  source_message_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
    unique: true,
    sparse: true
  },
  wa_message_id: {
    type: String,
    default: null,
    index: true
  },
  ai_trace_run_id: {
    type: String,
    default: null,
    index: true
  },
  nama: {
    type: String,
    default: '-'
  },
  nama_toko: {
    type: String,
    default: '-'
  },
  alamat: {
    type: String,
    default: '-'
  },
  no_hp: {
    type: String,
    default: '-'
  },
  orderan: {
    type: String,
    default: '-'
  },
  intent_type: {
    type: String,
    enum: ['purchase', 'demo', 'unknown'],
    default: 'purchase',
    index: true
  },
  demo_program: {
    type: String,
    default: '-'
  },
  raw_payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  sheet_status: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'skipped'],
    default: 'pending',
    index: true
  },
  sheet_error: {
    type: String,
    default: null
  },
  sent_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

leadCaptureSchema.index({ sales_id: 1, createdAt: -1 });
leadCaptureSchema.index({ sales_id: 1, intent_type: 1, updatedAt: -1 });
leadCaptureSchema.index({ createdAt: -1 });

module.exports = mongoose.model('LeadCapture', leadCaptureSchema);
