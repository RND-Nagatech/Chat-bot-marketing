const mongoose = require('mongoose');

const knowledgeChunkSchema = new mongoose.Schema({
  document_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KnowledgeDocument',
    required: true,
    index: true
  },
  chunk_index: {
    type: Number,
    required: true
  },
  text: {
    type: String,
    required: true
  },
  embedding: {
    type: [Number],
    default: undefined
  },
  vector_store: {
    type: String,
    enum: ['mongo', 'qdrant'],
    default: 'mongo',
    index: true
  },
  qdrant_point_id: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

knowledgeChunkSchema.index({ document_id: 1, chunk_index: 1 }, { unique: true });

module.exports = mongoose.model('KnowledgeChunk', knowledgeChunkSchema);
