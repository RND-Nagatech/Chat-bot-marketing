const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    trim: true
  },
  message_in: {
    type: String,
    default: null
  },
  message_out: {
    type: String,
    default: null
  },
  matched_rule: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rule',
    default: null
  },
  status: {
    type: String,
    enum: ['handled_by_bot', 'needs_admin_follow_up'],
    default: 'needs_admin_follow_up'
  },
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    default: 'inbound',
    required: true
  },
  sender_type: {
    type: String,
    enum: ['customer', 'bot', 'admin'],
    default: 'customer',
    required: true
  },
  delivery_status: {
    type: String,
    enum: ['sent', 'failed', null],
    default: null
  },
  wa_jid: {
    type: String,
    default: null
  },
  follow_up_state: {
    type: String,
    enum: ['open', 'resolved', null],
    default: null
  },
  follow_up_resolved_at: {
    type: Date,
    default: null
  },
  follow_up_resolved_by: {
    type: String,
    default: null
  },
  reply_to_message_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  reply_to_wa_message_id: {
    type: String,
    default: null
  },
  wa_message_id: {
    type: String,
    default: null
  },
  wa_remote_jid: {
    type: String,
    default: null
  },
  wa_participant: {
    type: String,
    default: null
  },
  wa_from_me: {
    type: Boolean,
    default: null
  },
  wa_message_timestamp: {
    type: Number,
    default: null
  },
  deleted_for_admin: {
    type: Boolean,
    default: false
  },
  deleted_for_all_at: {
    type: Date,
    default: null
  },
  deleted_by: {
    type: String,
    default: null
  },
  is_edited: {
    type: Boolean,
    default: false
  },
  edited_at: {
    type: Date,
    default: null
  },
  edited_by: {
    type: String,
    default: null
  },
  is_revoked: {
    type: Boolean,
    default: false
  },
  revoked_at: {
    type: Date,
    default: null
  },
  revoked_by: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

messageSchema.index({ phone: 1, createdAt: -1 });
messageSchema.index({ direction: 1, sender_type: 1, createdAt: -1 });
messageSchema.index({ follow_up_state: 1, direction: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
