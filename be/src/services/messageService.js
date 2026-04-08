const Message = require('../models/Message');
const mongoose = require('mongoose');
const rulesEngine = require('./rulesEngine');
const logger = require('../utils/logger');

class MessageService {
  extractDisplayText(message) {
    if (message?.is_revoked) {
      return 'Pesan ini dihapus';
    }
    return (message.message_out || message.message_in || '').trim();
  }

  toUnixSeconds(value, fallbackDate = null) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.floor(numeric);
    }
    if (fallbackDate) {
      const millis = new Date(fallbackDate).getTime();
      if (Number.isFinite(millis) && millis > 0) {
        return Math.floor(millis / 1000);
      }
    }
    return null;
  }

  getDeleteForEveryoneWindowSeconds() {
    const configured = Number(process.env.WA_DELETE_FOR_EVERYONE_WINDOW_HOURS);
    const hours = Number.isFinite(configured) && configured > 0 ? configured : 48;
    return Math.floor(hours * 60 * 60);
  }

  getEditWindowSeconds() {
    const configured = Number(process.env.WA_EDIT_WINDOW_MINUTES);
    const minutes = Number.isFinite(configured) && configured > 0 ? configured : 15;
    return Math.floor(minutes * 60);
  }

  isDeleteForEveryoneAllowed(message) {
    if (!message) return false;
    if (!message.wa_from_me) return false;
    if (!message.wa_message_id || !message.wa_remote_jid) return false;
    if (message.deleted_for_all_at) return false;
    if (message.is_revoked) return false;

    const messageSec = this.toUnixSeconds(message.wa_message_timestamp, message.createdAt);
    if (!messageSec) return false;

    const nowSec = Math.floor(Date.now() / 1000);
    const maxAgeSec = this.getDeleteForEveryoneWindowSeconds();
    return nowSec - messageSec <= maxAgeSec;
  }

  isEditAllowed(message) {
    if (!message) return false;
    if (!message.wa_from_me) return false;
    if (!message.wa_message_id || !message.wa_remote_jid) return false;
    if (message.deleted_for_admin || message.deleted_for_all_at) return false;
    if (message.is_revoked) return false;
    if (!message.message_out) return false;

    const messageSec = this.toUnixSeconds(message.wa_message_timestamp, message.createdAt);
    if (!messageSec) return false;

    const nowSec = Math.floor(Date.now() / 1000);
    return nowSec - messageSec <= this.getEditWindowSeconds();
  }

  async processMessage(phone, messageText, whatsappSocket, replyJid = phone, options = {}) {
    let inboundMessage = null;
    const incomingKey = options?.incomingKey || null;
    const incomingRemoteJid = options?.incomingRemoteJid || replyJid || null;
    const incomingMessageId = incomingKey?.id || null;
    const quotedWaMessageId = options?.quotedWaMessageId || null;

    try {
      const normalizedText = (messageText || '').trim();
      if (!normalizedText) return null;

      // Idempotency guard: WA can emit duplicate upserts for the same message key.
      if (incomingMessageId) {
        const existingInbound = await Message.findOne({
          phone,
          wa_message_id: incomingMessageId,
          direction: 'inbound',
          sender_type: 'customer'
        }).sort({ createdAt: -1 });

        if (existingInbound) {
          logger.info(`Duplicate inbound message ignored (phone=${phone}, wa_message_id=${incomingMessageId})`);
          return existingInbound;
        }
      }

      const matchedRule = await rulesEngine.matchRule(messageText);
      const hasMatchedRule = Boolean(matchedRule);

      inboundMessage = new Message({
        phone,
        message_in: normalizedText,
        message_out: null,
        matched_rule: hasMatchedRule ? matchedRule._id : null,
        status: hasMatchedRule ? 'handled_by_bot' : 'needs_admin_follow_up',
        direction: 'inbound',
        sender_type: 'customer',
        delivery_status: null,
        wa_jid: replyJid || null,
        follow_up_state: hasMatchedRule ? 'resolved' : 'open',
        follow_up_resolved_at: hasMatchedRule ? new Date() : null,
        follow_up_resolved_by: hasMatchedRule ? 'bot' : null,
        wa_message_id: incomingKey?.id || null,
        wa_remote_jid: incomingRemoteJid,
        wa_participant: incomingKey?.participant || null,
        wa_from_me: incomingKey?.fromMe ?? false,
        wa_message_timestamp: options?.incomingMessageTimestamp || null,
        reply_to_wa_message_id: quotedWaMessageId
      });

      await inboundMessage.save();

      if (hasMatchedRule) {
        const responseText = matchedRule.response;
        try {
          const sent = await whatsappSocket.sendMessage(replyJid, { text: responseText });

          const outboundMessage = new Message({
            phone,
            message_in: null,
            message_out: responseText,
            matched_rule: matchedRule._id,
            status: 'handled_by_bot',
            direction: 'outbound',
            sender_type: 'bot',
            delivery_status: 'sent',
            wa_jid: replyJid || null,
            wa_message_id: sent?.key?.id || null,
            wa_remote_jid: sent?.key?.remoteJid || replyJid || null,
            wa_participant: sent?.key?.participant || null,
            wa_from_me: sent?.key?.fromMe ?? true,
            wa_message_timestamp: sent?.messageTimestamp || null
          });

          await outboundMessage.save();
          logger.info(`Auto-reply sent to ${replyJid} (source=${phone}): ${responseText}`);
        } catch (sendError) {
          await Message.create({
            phone,
            message_in: null,
            message_out: responseText,
            matched_rule: matchedRule._id,
            status: 'needs_admin_follow_up',
            direction: 'outbound',
            sender_type: 'bot',
            delivery_status: 'failed',
            wa_jid: replyJid || null,
            follow_up_state: null,
            follow_up_resolved_at: null,
            follow_up_resolved_by: null,
            reply_to_message_id: inboundMessage._id,
            wa_message_id: null,
            wa_remote_jid: replyJid || null,
            wa_participant: null,
            wa_from_me: true,
            wa_message_timestamp: null
          });

          await Message.updateOne(
            { _id: inboundMessage._id },
            {
              $set: {
                status: 'needs_admin_follow_up',
                follow_up_state: 'open',
                follow_up_resolved_at: null,
                follow_up_resolved_by: null
              }
            }
          );

          logger.error(`Auto-reply failed to ${replyJid} (source=${phone})`, sendError);
        }
      } else {
        logger.info(`Message from ${phone} requires admin follow up`);
      }

      return inboundMessage;
    } catch (error) {
      logger.error('Error processing message:', error);

      if (inboundMessage) {
        return inboundMessage;
      }

      const failedMessage = new Message({
        phone,
        message_in: messageText,
        message_out: null,
        matched_rule: null,
        status: 'needs_admin_follow_up',
        direction: 'inbound',
        sender_type: 'customer',
        delivery_status: null,
        wa_jid: replyJid || null,
        follow_up_state: 'open',
        follow_up_resolved_at: null,
        follow_up_resolved_by: null,
        wa_message_id: incomingKey?.id || null,
        wa_remote_jid: incomingRemoteJid,
        wa_participant: incomingKey?.participant || null,
        wa_from_me: incomingKey?.fromMe ?? false,
        wa_message_timestamp: options?.incomingMessageTimestamp || null,
        reply_to_wa_message_id: quotedWaMessageId
      });

      await failedMessage.save();
      logger.warn(`Message saved as follow-up because auto-reply failed (source=${phone}, replyJid=${replyJid})`);

      return failedMessage;
    }
  }

  async resolveReplyJidByPhone(phone) {
    const latestWithJid = await Message.findOne({
      phone,
      wa_jid: { $ne: null }
    }).sort({ createdAt: -1 });

    return latestWithJid?.wa_jid || `${phone}@s.whatsapp.net`;
  }

  async sendManualReply(phone, text, whatsappService, options = {}) {
    const normalizedText = (text || '').trim();
    if (!normalizedText) {
      throw new Error('Pesan balasan tidak boleh kosong');
    }
    const { replyToMessageId = null, resolvedBy = null } = options;

    let replyTargetMessage = null;
    let pendingTargetMessage = null;

    if (replyToMessageId) {
      if (!mongoose.Types.ObjectId.isValid(replyToMessageId)) {
        throw new Error('reply_to_message_id tidak valid');
      }

      replyTargetMessage = await Message.findOne({
        _id: replyToMessageId,
        phone,
        $or: [
          { message_in: { $ne: null } },
          { message_out: { $ne: null } }
        ],
        deleted_for_admin: { $ne: true },
        deleted_for_all_at: null
      });

      if (!replyTargetMessage) {
        throw new Error('Pesan target reply tidak ditemukan');
      }

      pendingTargetMessage = await Message.findOne({
        _id: replyToMessageId,
        phone,
        message_in: { $ne: null },
        $and: [
          {
            $or: [
              { direction: 'inbound' },
              { direction: { $exists: false } },
              { direction: null }
            ]
          },
          {
            $or: [
              { follow_up_state: 'open' },
              {
                $and: [
                  { follow_up_state: null },
                  { status: 'needs_admin_follow_up' }
                ]
              }
            ]
          }
        ]
      });
    }

    const replyJid = await this.resolveReplyJidByPhone(phone);

    try {
      const quoted =
        replyTargetMessage && replyTargetMessage.wa_message_id
          ? {
              key: {
                id: replyTargetMessage.wa_message_id,
                remoteJid: replyTargetMessage.wa_remote_jid || replyJid,
                fromMe: Boolean(replyTargetMessage.wa_from_me),
                participant: replyTargetMessage.wa_participant || undefined
              },
              message: {
                conversation: replyTargetMessage.message_in || replyTargetMessage.message_out || ''
              }
            }
          : undefined;

      const sent = await whatsappService.sendMessage(
        replyJid,
        normalizedText,
        quoted ? { quoted } : undefined
      );

      const outboundMessage = new Message({
        phone,
        message_in: null,
        message_out: normalizedText,
        matched_rule: null,
        status: 'handled_by_bot',
        direction: 'outbound',
        sender_type: 'admin',
        delivery_status: 'sent',
        wa_jid: replyJid,
        follow_up_state: null,
        follow_up_resolved_at: null,
        follow_up_resolved_by: null,
        reply_to_message_id: replyTargetMessage?._id || null,
        wa_message_id: sent?.key?.id || null,
        wa_remote_jid: sent?.key?.remoteJid || replyJid || null,
        wa_participant: sent?.key?.participant || null,
        wa_from_me: sent?.key?.fromMe ?? true,
        wa_message_timestamp: sent?.messageTimestamp || null
      });

      await outboundMessage.save();

      if (pendingTargetMessage) {
        await Message.updateOne(
          { _id: pendingTargetMessage._id },
          {
            $set: {
              follow_up_state: 'resolved',
              follow_up_resolved_at: new Date(),
              follow_up_resolved_by: resolvedBy || 'admin',
              status: 'handled_by_bot'
            }
          }
        );
      }

      logger.info(`Manual reply sent to ${phone} via ${replyJid}`);

      return outboundMessage;
    } catch (error) {
      const failedOutboundMessage = new Message({
        phone,
        message_in: null,
        message_out: normalizedText,
        matched_rule: null,
        status: 'needs_admin_follow_up',
        direction: 'outbound',
        sender_type: 'admin',
        delivery_status: 'failed',
        wa_jid: replyJid,
        follow_up_state: null,
        follow_up_resolved_at: null,
        follow_up_resolved_by: null,
        reply_to_message_id: replyTargetMessage?._id || null,
        wa_message_id: null,
        wa_remote_jid: replyJid || null,
        wa_participant: null,
        wa_from_me: true,
        wa_message_timestamp: null
      });

      await failedOutboundMessage.save();
      logger.error(`Manual reply failed to ${phone} via ${replyJid}:`, error);
      throw error;
    }
  }

  async getAllMessages(limit = 100, skip = 0) {
    return await Message.find()
      .populate('matched_rule')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);
  }

  async getMessagesByPhone(phone, limit = 50) {
    return await Message.find({ phone })
      .populate('matched_rule')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async getMessagesCount() {
    return await Message.countDocuments();
  }

  async getConversations() {
    const rows = await Message.aggregate([
      {
        $match: {
          deleted_for_admin: { $ne: true },
          deleted_for_all_at: null
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$phone',
          last_doc: { $first: '$$ROOT' },
          unresolved_count: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: [{ $ifNull: ['$direction', 'inbound'] }, 'inbound'] },
                    {
                      $or: [
                        { $eq: ['$follow_up_state', 'open'] },
                        {
                          $and: [
                            { $eq: ['$follow_up_state', null] },
                            { $eq: ['$status', 'needs_admin_follow_up'] }
                          ]
                        }
                      ]
                    }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          phone: '$_id',
          last_message: {
            $cond: [
              { $eq: ['$last_doc.is_revoked', true] },
              'Pesan ini dihapus',
              { $ifNull: ['$last_doc.message_out', '$last_doc.message_in'] }
            ]
          },
          last_message_at: '$last_doc.createdAt',
          last_direction: { $ifNull: ['$last_doc.direction', 'inbound'] },
          last_status: '$last_doc.status',
          unresolved_count: 1
        }
      },
      { $sort: { last_message_at: -1 } }
    ]);

    return rows.map((row) => ({
      ...row,
      last_message: (row.last_message || '').trim()
    }));
  }

  async getConversationByPhone(phone) {
    const messages = await Message.find({
      phone,
      deleted_for_admin: { $ne: true },
      deleted_for_all_at: null
    })
      .populate('matched_rule')
      .sort({ createdAt: 1 })
      .lean();

    const expanded = [];
    const seenWAKey = new Set();

    for (const message of messages) {
      const timestamp = message.createdAt || new Date();
      const baseId = (message._id || '').toString();

      // New schema (direction already explicit).
      if (message.direction && (message.message_in || message.message_out)) {
        const dedupeKey = message.wa_message_id
          ? `${message.direction}:${message.sender_type || ''}:${message.wa_message_id}`
          : null;

        if (dedupeKey && seenWAKey.has(dedupeKey)) {
          continue;
        }
        if (dedupeKey) {
          seenWAKey.add(dedupeKey);
        }

        expanded.push({
          id: baseId,
          source_message_id: baseId,
          phone: message.phone,
          text: this.extractDisplayText(message),
          direction: message.direction,
          sender_type: message.sender_type || (message.direction === 'outbound' ? 'bot' : 'customer'),
          delivery_status: message.delivery_status ?? null,
          status: message.status || 'handled_by_bot',
          timestamp,
          follow_up_state:
            message.follow_up_state ||
            (message.direction === 'inbound' && message.status === 'needs_admin_follow_up' ? 'open' : 'resolved'),
          reply_to_message_id: message.reply_to_message_id || null,
          reply_to_wa_message_id: message.reply_to_wa_message_id || null,
          wa_message_id: message.wa_message_id || null,
          can_delete_for_everyone: this.isDeleteForEveryoneAllowed(message),
          can_edit: this.isEditAllowed(message),
          is_edited: Boolean(message.is_edited),
          edited_at: message.edited_at || null,
          is_revoked: Boolean(message.is_revoked),
          revoked_at: message.revoked_at || null
        });
        continue;
      }

      // Legacy schema compatibility:
      // one row may contain both incoming and outgoing text; split into 2 chat bubbles.
      if (message.message_in) {
        expanded.push({
          id: `${baseId}-in`,
          source_message_id: baseId,
          phone: message.phone,
          text: message.message_in,
          direction: 'inbound',
          sender_type: 'customer',
          delivery_status: null,
          status: message.status || 'needs_admin_follow_up',
          timestamp,
          follow_up_state: message.status === 'needs_admin_follow_up' ? 'open' : 'resolved',
          reply_to_message_id: null,
          reply_to_wa_message_id: null,
          wa_message_id: null,
          can_delete_for_everyone: false,
          can_edit: false,
          is_edited: false,
          edited_at: null,
          is_revoked: false,
          revoked_at: null
        });
      }

      if (message.message_out) {
        expanded.push({
          id: `${baseId}-out`,
          source_message_id: baseId,
          phone: message.phone,
          text: message.message_out,
          direction: 'outbound',
          sender_type: 'bot',
          delivery_status: 'sent',
          status: 'handled_by_bot',
          timestamp,
          follow_up_state: null,
          reply_to_message_id: null,
          reply_to_wa_message_id: null,
          wa_message_id: null,
          can_delete_for_everyone: false,
          can_edit: false,
          is_edited: false,
          edited_at: null,
          is_revoked: false,
          revoked_at: null
        });
      }
    }

    const sourceIdByWaMessageId = new Map();
    for (const row of expanded) {
      const raw = messages.find((doc) => (doc._id || '').toString() === row.source_message_id);
      if (raw?.wa_message_id && row.source_message_id) {
        sourceIdByWaMessageId.set(raw.wa_message_id, row.source_message_id);
      }
    }

    for (const row of expanded) {
      if (!row.reply_to_message_id && row.reply_to_wa_message_id) {
        row.reply_to_message_id = sourceIdByWaMessageId.get(row.reply_to_wa_message_id) || null;
      }
    }

    return expanded;
  }

  async markMessageRevokedByWa(phone, waMessageId, revokedBy = 'customer') {
    if (!phone || !waMessageId) return null;

    const target = await Message.findOne({
      phone,
      wa_message_id: waMessageId,
      deleted_for_admin: { $ne: true },
      deleted_for_all_at: null
    }).sort({ createdAt: -1 });

    if (!target) {
      return null;
    }

    target.is_revoked = true;
    target.revoked_at = new Date();
    target.revoked_by = revokedBy;

    if (target.direction === 'inbound') {
      target.follow_up_state = 'resolved';
      target.follow_up_resolved_at = new Date();
      target.follow_up_resolved_by = revokedBy;
      target.status = 'handled_by_bot';
    }

    await target.save();
    return target;
  }

  async backfillPhoneAlias(oldPhone, newPhone) {
    if (!oldPhone || !newPhone || oldPhone === newPhone) return 0;

    const result = await Message.updateMany(
      { phone: oldPhone },
      { $set: { phone: newPhone } }
    );

    return result?.modifiedCount || 0;
  }

  async resolvePendingMessage(phone, messageId, resolvedBy = 'admin') {
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      throw new Error('message_id tidak valid');
    }

    const message = await Message.findOne({
      _id: messageId,
      phone,
      message_in: { $ne: null },
      deleted_for_admin: { $ne: true },
      deleted_for_all_at: null,
      $or: [
        { follow_up_state: 'open' },
        {
          $and: [
            { follow_up_state: null },
            { status: 'needs_admin_follow_up' }
          ]
        }
      ]
    });

    if (!message) {
      throw new Error('Pesan pending tidak ditemukan atau sudah terselesaikan');
    }

    message.follow_up_state = 'resolved';
    message.follow_up_resolved_at = new Date();
    message.follow_up_resolved_by = resolvedBy;
    message.status = 'handled_by_bot';
    await message.save();

    return message;
  }

  async deleteMessageForMe(phone, messageId, deletedBy = 'admin', whatsappService) {
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      throw new Error('message_id tidak valid');
    }

    const target = await Message.findOne({ _id: messageId, phone, deleted_for_all_at: null });
    if (!target) {
      throw new Error('Pesan tidak ditemukan');
    }

    if (!whatsappService || typeof whatsappService.deleteMessageForMe !== 'function') {
      throw new Error('Service WhatsApp tidak siap untuk hapus pesan');
    }

    if (!target.wa_message_id || !target.wa_remote_jid) {
      throw new Error('Pesan ini belum memiliki metadata WA yang cukup untuk delete');
    }

    const messageTimestamp = target.wa_message_timestamp || Math.floor((target.createdAt?.getTime() || Date.now()) / 1000);

    await whatsappService.deleteMessageForMe(
      target.wa_remote_jid,
      {
        id: target.wa_message_id,
        remoteJid: target.wa_remote_jid,
        fromMe: Boolean(target.wa_from_me),
        participant: target.wa_participant || undefined
      },
      messageTimestamp
    );

    const result = await Message.findOneAndUpdate(
      { _id: messageId, phone, deleted_for_all_at: null },
      {
        $set: {
          deleted_for_admin: true,
          deleted_by: deletedBy
        }
      },
      { new: true }
    );

    if (!result) {
      throw new Error('Pesan tidak ditemukan');
    }

    return result;
  }

  async deleteMessageForAll(phone, messageId, deletedBy = 'admin', whatsappService) {
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      throw new Error('message_id tidak valid');
    }

    const target = await Message.findOne({ _id: messageId, phone, deleted_for_all_at: null });
    if (!target) {
      throw new Error('Pesan tidak ditemukan');
    }

    if (!whatsappService || typeof whatsappService.deleteMessageForEveryone !== 'function') {
      throw new Error('Service WhatsApp tidak siap untuk hapus pesan');
    }

    if (!target.wa_from_me) {
      throw new Error('Hapus untuk semua hanya bisa untuk pesan yang dikirim dari akun Anda');
    }

    if (!this.isDeleteForEveryoneAllowed(target)) {
      throw new Error('Pesan sudah melewati batas waktu hapus untuk semua');
    }

    if (!target.wa_message_id || !target.wa_remote_jid) {
      throw new Error('Pesan ini belum memiliki metadata WA yang cukup untuk delete');
    }

    await whatsappService.deleteMessageForEveryone(
      target.wa_remote_jid,
      {
        id: target.wa_message_id,
        remoteJid: target.wa_remote_jid,
        fromMe: Boolean(target.wa_from_me),
        participant: target.wa_participant || undefined
      }
    );

    const result = await Message.findOneAndUpdate(
      { _id: messageId, phone, deleted_for_all_at: null },
      {
        $set: {
          deleted_for_all_at: new Date(),
          deleted_by: deletedBy
        }
      },
      { new: true }
    );

    if (!result) {
      throw new Error('Pesan tidak ditemukan');
    }

    return result;
  }

  async editMessage(phone, messageId, newText, editedBy = 'admin', whatsappService) {
    const normalized = (newText || '').trim();
    if (!normalized) {
      throw new Error('Pesan edit tidak boleh kosong');
    }

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      throw new Error('message_id tidak valid');
    }

    const target = await Message.findOne({
      _id: messageId,
      phone,
      deleted_for_admin: { $ne: true },
      deleted_for_all_at: null
    });

    if (!target) {
      throw new Error('Pesan tidak ditemukan');
    }

    if (!this.isEditAllowed(target)) {
      throw new Error('Pesan sudah melewati batas waktu edit');
    }

    if (!whatsappService || typeof whatsappService.editMessage !== 'function') {
      throw new Error('Service WhatsApp tidak siap untuk edit pesan');
    }

    await whatsappService.editMessage(
      target.wa_remote_jid,
      {
        id: target.wa_message_id,
        remoteJid: target.wa_remote_jid,
        fromMe: Boolean(target.wa_from_me),
        participant: target.wa_participant || undefined
      },
      normalized
    );

    target.message_out = normalized;
    target.is_edited = true;
    target.edited_at = new Date();
    target.edited_by = editedBy;
    await target.save();

    return target;
  }
}

module.exports = new MessageService();
