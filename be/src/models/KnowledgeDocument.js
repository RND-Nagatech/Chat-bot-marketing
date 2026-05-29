const mongoose = require('mongoose');

const knowledgeDocumentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  original_filename: {
    type: String,
    required: true,
    trim: true
  },
  mime_type: {
    type: String,
    required: true
  },
  size_bytes: {
    type: Number,
    required: true
  },
  extracted_text: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['processing', 'indexed', 'failed'],
    default: 'processing'
  },
  chunk_count: {
    type: Number,
    default: 0
  },
  error_message: {
    type: String,
    default: null
  },
  indexed_at: {
    type: Date,
    default: null
  },
  status_active: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

knowledgeDocumentSchema.index({ status: 1, createdAt: -1 });
knowledgeDocumentSchema.index({ status_active: 1, createdAt: -1 });

module.exports = mongoose.model('KnowledgeDocument', knowledgeDocumentSchema);
