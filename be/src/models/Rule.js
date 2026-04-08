const mongoose = require('mongoose');

const ruleSchema = new mongoose.Schema({
  keyword: {
    type: String,
    required: true,
    trim: true
  },
  match_type: {
    type: String,
    enum: ['contains', 'exact'],
    required: true,
    default: 'contains'
  },
  response: {
    type: String,
    required: true
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

ruleSchema.index({ keyword: 1, is_active: 1 });

module.exports = mongoose.model('Rule', ruleSchema);
