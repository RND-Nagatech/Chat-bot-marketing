const {
  default: makeWASocket,
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestWaWebVersion,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const messageService = require('./messageService');
const ragService = require('./ragService');
const WhatsAppSession = require('../models/WhatsAppSession');

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.qrCode = null;
    this.status = 'disconnected';
    this.lastError = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.refreshInProgress = false;
    this.manualDisconnect = false;
  }

  get authInfoPath() {
    return path.join(process.cwd(), 'auth_info');
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  isTypingIndicatorEnabled() {
    return process.env.WA_TYPING_INDICATOR_ENABLED !== 'false';
  }

  getTypingDelayMs(text = '') {
    const minMs = Number(process.env.WA_TYPING_MIN_MS);
    const maxMs = Number(process.env.WA_TYPING_MAX_MS);
    const charsPerSecond = Number(process.env.WA_TYPING_CHARS_PER_SECOND);
    const minDelay = Number.isFinite(minMs) && minMs >= 0 ? minMs : 900;
    const maxDelay = Number.isFinite(maxMs) && maxMs > minDelay ? maxMs : 3500;
    const cps = Number.isFinite(charsPerSecond) && charsPerSecond > 0 ? charsPerSecond : 45;
    const estimated = ((text || '').length / cps) * 1000;
    return Math.min(maxDelay, Math.max(minDelay, Math.floor(estimated)));
  }

  async sendTypingPresence(jid, text = '') {
    if (!this.isTypingIndicatorEnabled() || !this.sock || this.status !== 'connected') {
      return;
    }

    try {
      await this.sock.sendPresenceUpdate('composing', jid);
      await this.sleep(this.getTypingDelayMs(text));
      await this.sock.sendPresenceUpdate('paused', jid);
    } catch (error) {
      logger.warn(`Failed to send typing presence to ${jid}: ${error.message}`);
    }
  }

  ensureAuthInfoDir() {
    if (!fs.existsSync(this.authInfoPath)) {
      fs.mkdirSync(this.authInfoPath, { recursive: true });
    }
  }

  resetInMemorySocketState() {
    this.sock = null;
    this.qrCode = null;
  }

  async updateSession(data) {
    await WhatsAppSession.findOneAndUpdate({}, data, { upsert: true, new: true });
  }

  toFriendlyError(statusCode, errorMessage) {
    if (statusCode === 401) {
      return 'Login WhatsApp gagal. Silakan coba scan QR lagi.';
    }
    if (statusCode === 408 || /timed out|timeout/i.test(errorMessage || '')) {
      return 'Waktu pairing habis. Silakan scan ulang QR code.';
    }
    if (statusCode === DisconnectReason.connectionClosed) {
      return 'Koneksi WhatsApp terputus. Silakan coba lagi.';
    }
    if (statusCode === DisconnectReason.connectionLost) {
      return 'Koneksi internet tidak stabil. Silakan coba lagi.';
    }
    return 'Proses login WhatsApp gagal. Silakan ulangi scan QR.';
  }

  getBaileysKeyStoreLogger() {
    const adapt = {
      trace: (...args) => logger.debug(...args),
      debug: (...args) => logger.debug(...args),
      info: (...args) => logger.info(...args),
      warn: (...args) => logger.warn(...args),
      error: (...args) => logger.error(...args),
      fatal: (...args) => logger.error(...args),
      child: () => adapt
    };

    return adapt;
  }

  async resetAuthState() {
    try {
      fs.rmSync(this.authInfoPath, { recursive: true, force: true });
      fs.mkdirSync(this.authInfoPath, { recursive: true });
      logger.warn('Auth state reset due to session/auth failure');
    } catch (error) {
      logger.error('Failed to reset auth state:', error);
    }
  }

  async connect(options = {}) {
    const { forceReconnect = false } = options;

    if (!forceReconnect && ['connecting', 'qr_ready', 'connected'].includes(this.status)) {
      logger.info(`WhatsApp connection request ignored because status is ${this.status}`);
      return;
    }

    try {
      this.status = 'connecting';
      this.qrCode = null;
      this.lastError = null;
      this.ensureAuthInfoDir();

      await this.updateSession({ status: 'connecting', qr_code: null, last_error: null });

      const { state, saveCreds } = await useMultiFileAuthState(this.authInfoPath);
      const { version, isLatest } = await fetchLatestWaWebVersion({});

      logger.info(`Using WA Web version ${version.join('.')} (isLatest=${isLatest})`);

      this.sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, this.getBaileysKeyStoreLogger())
        },
        browser: Browsers.macOS('Desktop'),
        version,
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: false
      });

      this.sock.ev.on('connection.update', async (update) => {
        await this.handleConnectionUpdate(update);
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('messages.upsert', async ({ messages }) => {
        await this.handleIncomingMessages(messages);
      });

      logger.info('WhatsApp service initialized');
    } catch (error) {
      logger.error('Error connecting to WhatsApp:', error);
      throw error;
    }
  }

  async handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.qrCode = await QRCode.toDataURL(qr);
      this.status = 'qr_ready';
      this.lastError = null;

      await this.updateSession({ status: 'qr_ready', qr_code: this.qrCode, last_error: null });

      logger.info('QR Code generated');
    }

    if (connection === 'connecting' && !qr && this.status === 'qr_ready') {
      this.status = 'authorizing';
      this.qrCode = null;
      this.lastError = null;
      await this.updateSession({ status: 'authorizing', qr_code: null, last_error: null });
      logger.info('QR scanned. Waiting for WhatsApp login confirmation');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || 'Unknown error';
      const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

      logger.warn(`Connection closed. statusCode=${statusCode || 'unknown'} message=${errorMessage} manualDisconnect=${this.manualDisconnect} refreshInProgress=${this.refreshInProgress}`);
      this.resetInMemorySocketState();

      if (this.manualDisconnect) {
        this.manualDisconnect = false;
        this.status = 'disconnected';
        this.lastError = null;
        this.reconnectAttempts = 0;
        this.refreshInProgress = false;

        await this.updateSession({ status: 'disconnected', qr_code: null, phone_number: null, last_error: null });
        return;
      }

      if (this.refreshInProgress) {
        this.refreshInProgress = false;
        this.reconnectAttempts = 0;
        this.status = 'connecting';
        this.lastError = null;

        await this.updateSession({ status: 'connecting', qr_code: null, last_error: null });

        setTimeout(() => {
          void this.connect({ forceReconnect: true });
        }, 500);
        return;
      }

      if (isLoggedOut) {
        await this.resetAuthState();
      }

      const shouldReconnect = !this.manualDisconnect && this.reconnectAttempts < this.maxReconnectAttempts;
      this.lastError = this.toFriendlyError(statusCode, errorMessage);

      if (shouldReconnect) {
        this.reconnectAttempts++;
        this.status = 'connecting';

        await this.updateSession({ status: 'connecting', qr_code: null, last_error: this.lastError });

        setTimeout(() => {
          void this.connect({ forceReconnect: true });
        }, 3000);
      } else {
        this.status = 'disconnected';
        this.reconnectAttempts = 0;

        await this.updateSession({ status: 'disconnected', qr_code: null, phone_number: null, last_error: this.lastError });
      }
    }

    if (connection === 'open') {
      this.status = 'connected';
      this.reconnectAttempts = 0;
      this.qrCode = null;
      this.lastError = null;

      const phoneNumber = this.sock.user?.id?.split(':')[0] || 'Unknown';

      await this.updateSession({ status: 'connected', qr_code: null, phone_number: phoneNumber, last_error: null });

      logger.info('WhatsApp connected successfully');
    }
  }

  async handleIncomingMessages(messages) {
    for (const message of messages) {
      if (message.key.fromMe || !message.message) continue;

      const sender = message.key.remoteJid;
      if (!sender || sender.endsWith('@g.us') || sender === 'status@broadcast') {
        continue;
      }

      const payload = this.unwrapMessagePayload(message.message);
      const protocolMessage = payload?.protocolMessage;
      const replyJid = this.resolveReplyJid(message);
      const customerPhone = this.resolveCustomerPhone(message);
      const lidPhone = sender.endsWith('@lid') ? this.normalizePhone(sender) : null;
      const incomingTimestamp = this.toTimestampSeconds(message?.messageTimestamp);

      if (this.isRevokeProtocolMessage(protocolMessage)) {
        const revokedWaMessageId = protocolMessage?.key?.id;
        if (revokedWaMessageId) {
          const revoked = await messageService.markMessageRevokedByWa(customerPhone, revokedWaMessageId, 'customer');
          if (revoked) {
            logger.info(`Message revoked by customer (phone=${customerPhone}, wa_message_id=${revokedWaMessageId})`);
          } else {
            logger.warn(`Revoke event received but target not found (phone=${customerPhone}, wa_message_id=${revokedWaMessageId})`);
          }
        }
        continue;
      }

      const processableMessage = await this.extractProcessableMessageText(message, payload);
      const messageText = processableMessage.text;
      const quotedWaMessageId = this.extractQuotedWaMessageId(payload);

      if (messageText) {
        logger.info(`Message received from ${sender} (customerPhone=${customerPhone}, replyJid=${replyJid}): ${messageText}`);

        if (lidPhone && customerPhone && customerPhone !== lidPhone) {
          const updated = await messageService.backfillPhoneAlias(lidPhone, customerPhone);
          if (updated > 0) {
            logger.info(`Backfilled ${updated} old message(s) from ${lidPhone} to ${customerPhone}`);
          }
        }

        await messageService.processMessage(customerPhone, messageText, this.sock, replyJid, {
          incomingKey: message.key,
          incomingRemoteJid: sender,
          incomingMessageTimestamp: incomingTimestamp,
          quotedWaMessageId,
          imageKnowledgeText: processableMessage.imageText || null
        });
      } else {
        logger.info(`Message received from ${sender} but no supported text payload was found`);
      }
    }
  }

  toTimestampSeconds(value) {
    if (!value) return null;
    if (typeof value === 'number') return Math.floor(value);
    if (typeof value === 'bigint') return Number(value);
    if (typeof value?.toString === 'function') {
      const numeric = Number(value.toString());
      if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
    }
    return null;
  }

  pickBestUserJid(message) {
    const candidates = [
      message?.key?.senderPn,
      message?.key?.participantPn,
      message?.key?.senderLid,
      message?.key?.participantLid,
      message?.key?.participant,
      message?.participant,
      message?.senderPn,
      message?.participantPn,
      message?.sender,
      message?.from
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;
      const value = candidate.trim();
      if (!value) continue;

      if (value.includes('@')) {
        return value;
      }

      if (/^\d+$/.test(value)) {
        return `${value}@s.whatsapp.net`;
      }
    }

    return null;
  }

  resolveReplyJid(message) {
    const sender = message?.key?.remoteJid;
    if (!sender) return sender;

    if (sender.endsWith('@s.whatsapp.net')) {
      return sender;
    }

    if (sender.endsWith('@lid')) {
      const fromParticipant = this.pickBestUserJid(message);

      if (fromParticipant && fromParticipant.includes('@')) {
        return fromParticipant;
      }
    }

    return sender;
  }

  resolveCustomerPhone(message) {
    const sender = message?.key?.remoteJid || '';
    const participant = this.pickBestUserJid(message) || '';

    if (sender.endsWith('@s.whatsapp.net')) {
      return this.normalizePhone(sender);
    }

    if (sender.endsWith('@lid') && participant) {
      return this.normalizePhone(participant);
    }

    if (sender.endsWith('@lid')) {
      logger.warn(`LID sender without phone mapping. Falling back to LID: ${sender}`);
    }

    return this.normalizePhone(sender);
  }

  normalizePhone(jidOrPhone) {
    if (!jidOrPhone) return '';
    return jidOrPhone.split('@')[0].split(':')[0].trim();
  }

  unwrapMessagePayload(rawMessage) {
    if (!rawMessage) return {};
    let payload = rawMessage;
    while (
      payload?.ephemeralMessage?.message ||
      payload?.viewOnceMessage?.message ||
      payload?.viewOnceMessageV2?.message ||
      payload?.viewOnceMessageV2Extension?.message
    ) {
      payload =
        payload?.ephemeralMessage?.message ||
        payload?.viewOnceMessage?.message ||
        payload?.viewOnceMessageV2?.message ||
        payload?.viewOnceMessageV2Extension?.message ||
        payload;
    }
    return payload;
  }

  extractMessageText(payload) {
    if (!payload) return '';

    return (
      payload?.conversation ||
      payload?.extendedTextMessage?.text ||
      payload?.imageMessage?.caption ||
      payload?.videoMessage?.caption ||
      payload?.documentMessage?.caption ||
      payload?.buttonsResponseMessage?.selectedButtonId ||
      payload?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      payload?.templateButtonReplyMessage?.selectedId ||
      ''
    ).toString().trim();
  }

  async extractProcessableMessageText(message, payload) {
    const text = this.extractMessageText(payload);
    const imageText = await this.extractImageText(message, payload);

    if (text && imageText) {
      return {
        text: [
          text,
          '',
          'Teks yang terbaca dari gambar:',
          imageText
        ].join('\n').trim(),
        imageText
      };
    }

    if (imageText) {
      return {
        text: [
          'Customer mengirim gambar.',
          '',
          'Teks yang terbaca dari gambar:',
          imageText
        ].join('\n').trim(),
        imageText
      };
    }

    return { text, imageText: '' };
  }

  async extractImageText(message, payload) {
    if (!payload?.imageMessage) {
      return '';
    }
    if (process.env.WA_IMAGE_OCR_ENABLED === 'false') {
      return '';
    }

    try {
      const buffer = await downloadMediaMessage(
        message,
        'buffer',
        {},
        {
          logger: this.getBaileysKeyStoreLogger(),
          reuploadRequest: this.sock?.updateMediaMessage
        }
      );

      const imageText = await ragService.extractImageBufferTextWithOcr(buffer);
      if (imageText) {
        logger.info(`OCR extracted ${imageText.length} chars from inbound image`);
      }
      return imageText;
    } catch (error) {
      logger.warn(`Failed to OCR inbound image: ${error.message}`);
      return '';
    }
  }

  extractContextInfo(payload) {
    if (!payload) return null;
    return (
      payload?.extendedTextMessage?.contextInfo ||
      payload?.imageMessage?.contextInfo ||
      payload?.videoMessage?.contextInfo ||
      payload?.documentMessage?.contextInfo ||
      payload?.conversationMessage?.contextInfo ||
      null
    );
  }

  extractQuotedWaMessageId(payload) {
    const contextInfo = this.extractContextInfo(payload);
    return contextInfo?.stanzaId || null;
  }

  isRevokeProtocolMessage(protocolMessage) {
    if (!protocolMessage?.key?.id) return false;
    return protocolMessage.type === 0 || protocolMessage.type === 'REVOKE';
  }

  async sendMessage(jid, text, options = undefined) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    try {
      await this.sendTypingPresence(jid, text);
      const sent = await this.sock.sendMessage(jid, { text }, options);
      logger.info(`Message sent to ${jid}: ${text}`);
      return sent;
    } catch (error) {
      logger.error('Error sending message:', error);
      throw error;
    }
  }

  async sendImageMessage(jid, imageBuffer, caption = '', options = undefined) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    try {
      await this.sendTypingPresence(jid, caption || '[image]');
      const sent = await this.sock.sendMessage(
        jid,
        {
          image: imageBuffer,
          caption: (caption || '').trim()
        },
        options
      );
      logger.info(`Image message sent to ${jid}`);
      return sent;
    } catch (error) {
      logger.error('Error sending image message:', error);
      throw error;
    }
  }

  async deleteMessageForEveryone(jid, key) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    try {
      await this.sock.sendMessage(jid, { delete: key });
      logger.info(`Delete for everyone sent for message=${key?.id} jid=${jid}`);
      return true;
    } catch (error) {
      logger.error('Error deleting message for everyone:', error);
      throw error;
    }
  }

  async deleteMessageForMe(jid, key, messageTimestamp) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    try {
      await this.sock.chatModify(
        {
          delete: true,
          lastMessages: [{
            key,
            messageTimestamp
          }]
        },
        jid
      );
      logger.info(`Delete for me sent for message=${key?.id} jid=${jid}`);
      return true;
    } catch (error) {
      logger.error('Error deleting message for me:', error);
      throw error;
    }
  }

  async editMessage(jid, key, text) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    try {
      const sent = await this.sock.sendMessage(jid, { text, edit: key });
      logger.info(`Edit message sent for message=${key?.id} jid=${jid}`);
      return sent;
    } catch (error) {
      logger.error('Error editing message:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.sock) {
      this.manualDisconnect = true;
      this.refreshInProgress = false;
      await this.sock.logout();
      this.resetInMemorySocketState();
      this.status = 'disconnected';
      this.lastError = null;

      await this.updateSession({ status: 'disconnected', qr_code: null, phone_number: null, last_error: null });

      logger.info('WhatsApp disconnected');
    }
  }

  async refreshQRCode() {
    if (this.status !== 'qr_ready') {
      throw new Error('QR refresh is only available while waiting for scan');
    }

    this.refreshInProgress = true;
    this.qrCode = null;
    this.status = 'connecting';
    this.lastError = null;

    await this.updateSession({ status: 'connecting', qr_code: null, last_error: null });

    if (this.sock) {
      this.sock.end(new Error('QR refresh requested'));
    } else {
      this.refreshInProgress = false;
      await this.connect({ forceReconnect: true });
    }

    logger.info('QR refresh requested');
  }

  async restartPairing() {
    this.refreshInProgress = false;
    this.manualDisconnect = false;
    this.qrCode = null;
    this.status = 'connecting';
    this.lastError = null;

    await this.updateSession({
      status: 'connecting',
      qr_code: null,
      phone_number: null,
      last_error: null
    });

    if (this.sock) {
      try {
        this.sock.end(new Error('Pairing restart requested'));
      } catch (error) {
        logger.warn(`Failed to close old socket on pairing restart: ${error.message}`);
      }
      this.resetInMemorySocketState();
    }

    await this.connect({ forceReconnect: true });
    logger.info('Pairing restart requested');
  }

  getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      lastError: this.lastError
    };
  }

  getQRCode() {
    return this.qrCode;
  }

  isConnected() {
    return this.status === 'connected';
  }
}

module.exports = new WhatsAppService();
