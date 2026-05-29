const multer = require('multer');
const messageService = require('../services/messageService');
const whatsappService = require('../services/whatsappService');
const logger = require('../utils/logger');

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.mimetype || '')) {
      cb(new Error('File harus berupa gambar JPG, PNG, atau WEBP'));
      return;
    }
    cb(null, true);
  }
});

exports.imageUploadMiddleware = (req, res, next) => {
  imageUpload.single('image')(req, res, (error) => {
    if (!error) return next();

    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Ukuran gambar maksimal 5MB'
      : error.message || 'Gagal membaca upload gambar';

    return res.status(400).json({ success: false, message });
  });
};

exports.getAllMessages = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const skip = parseInt(req.query.skip) || 0;

    const messages = await messageService.getAllMessages(limit, skip);
    const totalCount = await messageService.getMessagesCount();

    res.json({
      success: true,
      count: messages.length,
      total: totalCount,
      data: messages
    });
  } catch (error) {
    logger.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.getMessagesByPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const messages = await messageService.getMessagesByPhone(phone, limit);

    res.json({
      success: true,
      count: messages.length,
      data: messages
    });
  } catch (error) {
    logger.error('Error fetching messages by phone:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.getConversations = async (req, res) => {
  try {
    const conversations = await messageService.getConversations();

    res.json({
      success: true,
      count: conversations.length,
      data: conversations
    });
  } catch (error) {
    logger.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.getConversationByPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    const limit = parseInt(req.query.limit, 10) || undefined;
    const messages = await messageService.getConversationByPhone(phone, limit);

    res.json({
      success: true,
      count: messages.length,
      data: messages
    });
  } catch (error) {
    logger.error('Error fetching conversation by phone:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.sendManualReply = async (req, res) => {
  try {
    const { phone, text, reply_to_message_id: replyToMessageId } = req.body || {};

    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Nomor telepon wajib diisi'
      });
    }

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Pesan balasan tidak boleh kosong'
      });
    }

    if (!whatsappService.isConnected()) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp belum terhubung. Silakan hubungkan terlebih dahulu.'
      });
    }

    const resolvedBy = req.user?.email || req.user?.userId || 'admin';

    const message = await messageService.sendManualReply(phone.trim(), text, whatsappService, {
      replyToMessageId,
      resolvedBy
    });

    res.json({
      success: true,
      message: 'Balasan berhasil dikirim',
      data: message
    });
  } catch (error) {
    logger.error('Error sending manual reply:', error);

    if (/tidak valid|tidak ditemukan|terselesaikan|kosong/i.test(error.message || '')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Gagal mengirim balasan manual'
    });
  }
};

exports.sendManualImageReply = async (req, res) => {
  try {
    const { phone, caption = '', reply_to_message_id: replyToMessageId } = req.body || {};

    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Nomor telepon wajib diisi'
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: 'File gambar wajib diisi'
      });
    }

    if (!whatsappService.isConnected()) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp belum terhubung. Silakan hubungkan terlebih dahulu.'
      });
    }

    const resolvedBy = req.user?.email || req.user?.userId || 'admin';
    const message = await messageService.sendManualImageReply(
      phone.trim(),
      req.file.buffer,
      caption,
      whatsappService,
      {
        replyToMessageId,
        resolvedBy
      }
    );

    res.json({
      success: true,
      message: 'Gambar berhasil dikirim',
      data: message
    });
  } catch (error) {
    logger.error('Error sending manual image reply:', error);

    if (/tidak valid|tidak ditemukan|kosong|gambar/i.test(error.message || '')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Gagal mengirim gambar'
    });
  }
};

exports.resolvePendingMessage = async (req, res) => {
  try {
    const { phone, message_id: messageId } = req.body || {};
    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({ success: false, message: 'Nomor telepon wajib diisi' });
    }
    if (!messageId || typeof messageId !== 'string') {
      return res.status(400).json({ success: false, message: 'message_id wajib diisi' });
    }

    const resolvedBy = req.user?.email || req.user?.userId || 'admin';
    const message = await messageService.resolvePendingMessage(phone.trim(), messageId, resolvedBy);

    res.json({
      success: true,
      message: 'Status pending berhasil diselesaikan',
      data: message
    });
  } catch (error) {
    logger.error('Error resolving pending message:', error);
    if (/tidak valid|tidak ditemukan|terselesaikan/i.test(error.message || '')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Gagal menyelesaikan status pending' });
  }
};

exports.deleteMessageForMe = async (req, res) => {
  try {
    const { phone, message_id: messageId } = req.body || {};
    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({ success: false, message: 'Nomor telepon wajib diisi' });
    }
    if (!messageId || typeof messageId !== 'string') {
      return res.status(400).json({ success: false, message: 'message_id wajib diisi' });
    }

    const deletedBy = req.user?.email || req.user?.userId || 'admin';
    await messageService.deleteMessageForMe(phone.trim(), messageId, deletedBy, whatsappService);

    res.json({
      success: true,
      message: 'Pesan berhasil dihapus untuk saya'
    });
  } catch (error) {
    logger.error('Error deleting message for me:', error);
    if (/tidak valid|tidak ditemukan|tidak siap|metadata/i.test(error.message || '')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Gagal menghapus pesan' });
  }
};

exports.deleteMessageForAll = async (req, res) => {
  try {
    const { phone, message_id: messageId } = req.body || {};
    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({ success: false, message: 'Nomor telepon wajib diisi' });
    }
    if (!messageId || typeof messageId !== 'string') {
      return res.status(400).json({ success: false, message: 'message_id wajib diisi' });
    }

    const deletedBy = req.user?.email || req.user?.userId || 'admin';
    await messageService.deleteMessageForAll(phone.trim(), messageId, deletedBy, whatsappService);

    res.json({
      success: true,
      message: 'Pesan berhasil dihapus untuk semua'
    });
  } catch (error) {
    logger.error('Error deleting message for all:', error);
    if (/tidak valid|tidak ditemukan|tidak siap|metadata|hanya bisa|melewati batas/i.test(error.message || '')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Gagal menghapus pesan' });
  }
};

exports.editMessage = async (req, res) => {
  try {
    const { phone, message_id: messageId, text } = req.body || {};
    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({ success: false, message: 'Nomor telepon wajib diisi' });
    }
    if (!messageId || typeof messageId !== 'string') {
      return res.status(400).json({ success: false, message: 'message_id wajib diisi' });
    }
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Pesan edit tidak boleh kosong' });
    }
    if (!whatsappService.isConnected()) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp belum terhubung. Silakan hubungkan terlebih dahulu.'
      });
    }

    const editedBy = req.user?.email || req.user?.userId || 'admin';
    const message = await messageService.editMessage(phone.trim(), messageId, text, editedBy, whatsappService);

    res.json({
      success: true,
      message: 'Pesan berhasil diedit',
      data: message
    });
  } catch (error) {
    logger.error('Error editing message:', error);
    if (/tidak valid|tidak ditemukan|tidak siap|melewati batas|kosong/i.test(error.message || '')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Gagal mengedit pesan' });
  }
};
