const mongoose = require('mongoose');

const whatsAppSessionSchema = new mongoose.Schema({
  session_data: {
    type: Object,
    default: {}
  },
  status: {
    type: String,
    enum: ['disconnected', 'connecting', 'qr_ready', 'authorizing', 'connected'],
    default: 'disconnected'
  },
  qr_code: {
    type: String,
    default: null
  },
  phone_number: {
    type: String,
    default: null
  },
  last_error: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('WhatsAppSession', whatsAppSessionSchema);
