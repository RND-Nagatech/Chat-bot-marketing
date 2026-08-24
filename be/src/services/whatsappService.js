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
    this.sessions = new Map();
    this.maxReconnectAttempts = 5;
  }

  get baseAuthInfoPath() {
    return path.join(process.cwd(), 'auth_info');
  }

  normalizeOwnerUserId(ownerUserId) {
    return ownerUserId ? String(ownerUserId) : null;
  }

  getSessionKey(ownerUserId) {
    return this.normalizeOwnerUserId(ownerUserId) || 'global';
  }

  getSafeAuthFolderName(ownerUserId) {
    return this.getSessionKey(ownerUserId).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  getAuthInfoPath(ownerUserId) {
    return path.join(this.baseAuthInfoPath, this.getSafeAuthFolderName(ownerUserId));
  }

  getSessionState(ownerUserId) {
    const key = this.getSessionKey(ownerUserId);
    if (!this.sessions.has(key)) {
      this.sessions.set(key, {
        sock: null,
        qrCode: null,
        status: 'disconnected',
        lastError: null,
        reconnectAttempts: 0,
        refreshInProgress: false,
        manualDisconnect: false
      });
    }
    return this.sessions.get(key);
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

  async sendTypingPresence(ownerUserId, jid, text = '') {
    const session = this.getSessionState(ownerUserId);
    if (!this.isTypingIndicatorEnabled() || !session.sock || session.status !== 'connected') {
      return;
    }

    try {
      await session.sock.sendPresenceUpdate('composing', jid);
      await this.sleep(this.getTypingDelayMs(text));
      await session.sock.sendPresenceUpdate('paused', jid);
    } catch (error) {
      logger.warn(`Failed to send typing presence to ${jid}: ${error.message}`);
    }
  }

  ensureBaseAuthInfoDir() {
    if (!fs.existsSync(this.baseAuthInfoPath)) {
      fs.mkdirSync(this.baseAuthInfoPath, { recursive: true });
    }
  }

  ensureAuthInfoDir(ownerUserId) {
    const authInfoPath = this.getAuthInfoPath(ownerUserId);
    if (!fs.existsSync(authInfoPath)) {
      fs.mkdirSync(authInfoPath, { recursive: true });
    }
  }

  hasStoredCredentials(ownerUserId) {
    return fs.existsSync(path.join(this.getAuthInfoPath(ownerUserId), 'creds.json'));
  }

  resetInMemorySocketState(ownerUserId) {
    const session = this.getSessionState(ownerUserId);
    session.sock = null;
    session.qrCode = null;
  }

  async updateSession(ownerUserId, data) {
    const normalizedOwnerUserId = this.normalizeOwnerUserId(ownerUserId);
    const query = normalizedOwnerUserId
      ? { owner_user_id: normalizedOwnerUserId }
      : { owner_user_id: null };

    await WhatsAppSession.findOneAndUpdate(
      query,
      { ...data, owner_user_id: normalizedOwnerUserId },
      { upsert: true, new: true }
    );
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

  async resetAuthState(ownerUserId) {
    try {
      const authInfoPath = this.getAuthInfoPath(ownerUserId);
      fs.rmSync(authInfoPath, { recursive: true, force: true });
      fs.mkdirSync(authInfoPath, { recursive: true });
      logger.warn(`Auth state reset due to session/auth failure (owner=${this.getSessionKey(ownerUserId)})`);
    } catch (error) {
      logger.error('Failed to reset auth state:', error);
    }
  }

  async connect(ownerUserId = null, options = {}) {
    const { forceReconnect = false } = options;
    const session = this.getSessionState(ownerUserId);

    if (!forceReconnect && ['connecting', 'qr_ready', 'connected'].includes(session.status)) {
      logger.info(`WhatsApp connection request ignored because status is ${session.status} (owner=${this.getSessionKey(ownerUserId)})`);
      return;
    }

    try {
      session.status = 'connecting';
      session.qrCode = null;
      session.lastError = null;
      this.ensureAuthInfoDir(ownerUserId);

      await this.updateSession(ownerUserId, { status: 'connecting', qr_code: null, last_error: null });

      const { state, saveCreds } = await useMultiFileAuthState(this.getAuthInfoPath(ownerUserId));
      const { version, isLatest } = await fetchLatestWaWebVersion({});

      logger.info(`Using WA Web version ${version.join('.')} (isLatest=${isLatest}, owner=${this.getSessionKey(ownerUserId)})`);

      session.sock = makeWASocket({
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

      session.sock.ev.on('connection.update', async (update) => {
        await this.handleConnectionUpdate(ownerUserId, update);
      });

      session.sock.ev.on('creds.update', saveCreds);

      session.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        await this.handleIncomingMessages(ownerUserId, messages, type);
      });

      logger.info(`WhatsApp service initialized (owner=${this.getSessionKey(ownerUserId)})`);
    } catch (error) {
      logger.error(`Error connecting to WhatsApp (owner=${this.getSessionKey(ownerUserId)}):`, error);
      session.status = 'disconnected';
      session.lastError = error.message;
      await this.updateSession(ownerUserId, { status: 'disconnected', qr_code: null, last_error: error.message });
      throw error;
    }
  }

  async handleConnectionUpdate(ownerUserId, update) {
    const { connection, lastDisconnect, qr } = update;
    const session = this.getSessionState(ownerUserId);

    if (qr) {
      session.qrCode = await QRCode.toDataURL(qr);
      session.status = 'qr_ready';
      session.lastError = null;

      await this.updateSession(ownerUserId, { status: 'qr_ready', qr_code: session.qrCode, last_error: null });

      logger.info(`QR Code generated (owner=${this.getSessionKey(ownerUserId)})`);
    }

    if (connection === 'connecting' && !qr && session.status === 'qr_ready') {
      session.status = 'authorizing';
      session.qrCode = null;
      session.lastError = null;
      await this.updateSession(ownerUserId, { status: 'authorizing', qr_code: null, last_error: null });
      logger.info(`QR scanned. Waiting for WhatsApp login confirmation (owner=${this.getSessionKey(ownerUserId)})`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || 'Unknown error';
      const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

      logger.warn(`Connection closed. statusCode=${statusCode || 'unknown'} message=${errorMessage} manualDisconnect=${session.manualDisconnect} refreshInProgress=${session.refreshInProgress} owner=${this.getSessionKey(ownerUserId)}`);
      this.resetInMemorySocketState(ownerUserId);

      if (session.manualDisconnect) {
        session.manualDisconnect = false;
        session.status = 'disconnected';
        session.lastError = null;
        session.reconnectAttempts = 0;
        session.refreshInProgress = false;

        await this.updateSession(ownerUserId, { status: 'disconnected', qr_code: null, phone_number: null, last_error: null });
        return;
      }

      if (session.refreshInProgress) {
        session.refreshInProgress = false;
        session.reconnectAttempts = 0;
        session.status = 'connecting';
        session.lastError = null;

        await this.updateSession(ownerUserId, { status: 'connecting', qr_code: null, last_error: null });

        setTimeout(() => {
          void this.connect(ownerUserId, { forceReconnect: true });
        }, 500);
        return;
      }

      if (isLoggedOut) {
        await this.resetAuthState(ownerUserId);
      }

      const shouldReconnect = !session.manualDisconnect && session.reconnectAttempts < this.maxReconnectAttempts;
      session.lastError = this.toFriendlyError(statusCode, errorMessage);

      if (shouldReconnect) {
        session.reconnectAttempts++;
        session.status = 'connecting';

        await this.updateSession(ownerUserId, { status: 'connecting', qr_code: null, last_error: session.lastError });

        setTimeout(() => {
          void this.connect(ownerUserId, { forceReconnect: true });
        }, 3000);
      } else {
        session.status = 'disconnected';
        session.reconnectAttempts = 0;

        await this.updateSession(ownerUserId, {
          status: 'disconnected',
          qr_code: null,
          phone_number: null,
          last_error: session.lastError
        });
      }
    }

    if (connection === 'open') {
      session.status = 'connected';
      session.reconnectAttempts = 0;
      session.qrCode = null;
      session.lastError = null;

      const phoneNumber = session.sock?.user?.id?.split(':')[0] || 'Unknown';

      await this.updateSession(ownerUserId, { status: 'connected', qr_code: null, phone_number: phoneNumber, last_error: null });

      logger.info(`WhatsApp connected successfully (owner=${this.getSessionKey(ownerUserId)})`);
    }
  }

  async handleIncomingMessages(ownerUserId, messages, upsertType = 'notify') {
    const session = this.getSessionState(ownerUserId);

    if (upsertType && upsertType !== 'notify') {
      logger.info(`Skipping WhatsApp message upsert type=${upsertType} (owner=${this.getSessionKey(ownerUserId)})`);
      return;
    }

    for (const message of messages) {
      if (message.key.fromMe || !message.message) continue;

      const sender = message.key.remoteJid;
      if (!sender || sender.endsWith('@g.us') || sender === 'status@broadcast') {
        continue;
      }

      const payload = this.unwrapMessagePayload(message.message);
      const protocolMessage = payload?.protocolMessage;
      const replyJid = this.resolveReplyJid(message);
      const incomingTimestamp = this.toTimestampSeconds(message?.messageTimestamp);

      if (sender.endsWith('@lid') && replyJid === sender) {
        logger.warn(`Skipping LID inbound without phone mapping. Waiting for phone-mapped event (remoteJid=${sender}, wa_message_id=${message?.key?.id || 'none'}, owner=${this.getSessionKey(ownerUserId)})`);
        continue;
      }

      const customerPhone = this.resolveCustomerPhone(message);
      const lidPhone = sender.endsWith('@lid') ? this.normalizePhone(sender) : null;

      if (this.isRevokeProtocolMessage(protocolMessage)) {
        const revokedWaMessageId = protocolMessage?.key?.id;
        if (revokedWaMessageId) {
          const revoked = await messageService.markMessageRevokedByWa(customerPhone, revokedWaMessageId, 'customer', ownerUserId);
          if (revoked) {
            logger.info(`Message revoked by customer (phone=${customerPhone}, wa_message_id=${revokedWaMessageId}, owner=${this.getSessionKey(ownerUserId)})`);
          } else {
            logger.warn(`Revoke event received but target not found (phone=${customerPhone}, wa_message_id=${revokedWaMessageId}, owner=${this.getSessionKey(ownerUserId)})`);
          }
        }
        continue;
      }

      const processableMessage = await this.extractProcessableMessageText(message, payload, session.sock);
      const messageText = processableMessage.text;
      const quotedWaMessageId = this.extractQuotedWaMessageId(payload);

      if (messageText) {
        logger.info(`Message received from ${sender} (customerPhone=${customerPhone}, replyJid=${replyJid}, owner=${this.getSessionKey(ownerUserId)}): ${messageText}`);

        if (lidPhone && customerPhone && customerPhone !== lidPhone) {
          const updated = await messageService.backfillPhoneAlias(lidPhone, customerPhone, ownerUserId);
          if (updated > 0) {
            logger.info(`Backfilled ${updated} old message(s) from ${lidPhone} to ${customerPhone} (owner=${this.getSessionKey(ownerUserId)})`);
          }
        }

        await messageService.processMessage(customerPhone, messageText, session.sock, replyJid, {
          ownerUserId,
          incomingKey: message.key,
          incomingRemoteJid: sender,
          incomingMessageTimestamp: incomingTimestamp,
          quotedWaMessageId,
          imageKnowledgeText: processableMessage.imageText || null
        });
      } else {
        logger.info(`Message received from ${sender} but no supported text payload was found (owner=${this.getSessionKey(ownerUserId)})`);
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

  async extractProcessableMessageText(message, payload, socket = null) {
    const text = this.extractMessageText(payload);
    const imageText = await this.extractImageText(message, payload, socket);

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

  async extractImageText(message, payload, socket = null) {
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
          reuploadRequest: socket?.updateMediaMessage
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

  async sendMessage(ownerUserId, jid, text, options = undefined) {
    const session = this.getSessionState(ownerUserId);
    if (!session.sock || session.status !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    try {
      await this.sendTypingPresence(ownerUserId, jid, text);
      const sent = await session.sock.sendMessage(jid, { text }, options);
      logger.info(`Message sent to ${jid}: ${text}`);
      return sent;
    } catch (error) {
      logger.error('Error sending message:', error);
      throw error;
    }
  }

  async sendImageMessage(ownerUserId, jid, imageBuffer, caption = '', options = undefined) {
    const session = this.getSessionState(ownerUserId);
    if (!session.sock || session.status !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    try {
      await this.sendTypingPresence(ownerUserId, jid, caption || '[image]');
      const sent = await session.sock.sendMessage(
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

  async deleteMessageForEveryone(ownerUserId, jid, key) {
    const session = this.getSessionState(ownerUserId);
    if (!session.sock || session.status !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    try {
      await session.sock.sendMessage(jid, { delete: key });
      logger.info(`Delete for everyone sent for message=${key?.id} jid=${jid}`);
      return true;
    } catch (error) {
      logger.error('Error deleting message for everyone:', error);
      throw error;
    }
  }

  async deleteMessageForMe(ownerUserId, jid, key, messageTimestamp) {
    const session = this.getSessionState(ownerUserId);
    if (!session.sock || session.status !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    try {
      await session.sock.chatModify(
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

  async editMessage(ownerUserId, jid, key, text) {
    const session = this.getSessionState(ownerUserId);
    if (!session.sock || session.status !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    try {
      const sent = await session.sock.sendMessage(jid, { text, edit: key });
      logger.info(`Edit message sent for message=${key?.id} jid=${jid}`);
      return sent;
    } catch (error) {
      logger.error('Error editing message:', error);
      throw error;
    }
  }

  async disconnect(ownerUserId = null) {
    const session = this.getSessionState(ownerUserId);

    if (session.sock) {
      session.manualDisconnect = true;
      session.refreshInProgress = false;
      await session.sock.logout();
      this.resetInMemorySocketState(ownerUserId);
    }

    session.status = 'disconnected';
    session.lastError = null;

    await this.updateSession(ownerUserId, { status: 'disconnected', qr_code: null, phone_number: null, last_error: null });

    logger.info(`WhatsApp disconnected (owner=${this.getSessionKey(ownerUserId)})`);
  }

  async refreshQRCode(ownerUserId = null) {
    const session = this.getSessionState(ownerUserId);
    if (session.status !== 'qr_ready') {
      throw new Error('QR refresh is only available while waiting for scan');
    }

    session.refreshInProgress = true;
    session.qrCode = null;
    session.status = 'connecting';
    session.lastError = null;

    await this.updateSession(ownerUserId, { status: 'connecting', qr_code: null, last_error: null });

    if (session.sock) {
      session.sock.end(new Error('QR refresh requested'));
    } else {
      session.refreshInProgress = false;
      await this.connect(ownerUserId, { forceReconnect: true });
    }

    logger.info(`QR refresh requested (owner=${this.getSessionKey(ownerUserId)})`);
  }

  async restartPairing(ownerUserId = null) {
    const session = this.getSessionState(ownerUserId);

    session.refreshInProgress = false;
    session.manualDisconnect = false;
    session.qrCode = null;
    session.status = 'connecting';
    session.lastError = null;

    await this.updateSession(ownerUserId, {
      status: 'connecting',
      qr_code: null,
      phone_number: null,
      last_error: null
    });

    if (session.sock) {
      try {
        session.sock.end(new Error('Pairing restart requested'));
      } catch (error) {
        logger.warn(`Failed to close old socket on pairing restart: ${error.message}`);
      }
      this.resetInMemorySocketState(ownerUserId);
    }

    await this.connect(ownerUserId, { forceReconnect: true });
    logger.info(`Pairing restart requested (owner=${this.getSessionKey(ownerUserId)})`);
  }

  getStatus(ownerUserId = null) {
    const session = this.getSessionState(ownerUserId);
    return {
      status: session.status,
      qrCode: session.qrCode,
      lastError: session.lastError
    };
  }

  getQRCode(ownerUserId = null) {
    return this.getSessionState(ownerUserId).qrCode;
  }

  isConnected(ownerUserId = null) {
    return this.getSessionState(ownerUserId).status === 'connected';
  }

  getConnectedCount() {
    return Array.from(this.sessions.values()).filter((session) => session.status === 'connected').length;
  }

  async connectStoredSessions() {
    this.ensureBaseAuthInfoDir();

    const storedSessions = await WhatsAppSession.find({
      owner_user_id: { $ne: null },
      status: { $in: ['connected', 'connecting', 'qr_ready', 'authorizing'] }
    }).lean();

    let attempted = 0;
    for (const storedSession of storedSessions) {
      const ownerUserId = storedSession.owner_user_id;
      if (!this.hasStoredCredentials(ownerUserId)) {
        continue;
      }

      attempted++;
      try {
        await this.connect(ownerUserId, { forceReconnect: true });
      } catch (error) {
        logger.warn(`Failed to auto-connect WhatsApp session for owner=${ownerUserId}: ${error.message}`);
      }
    }

    return attempted;
  }
}

module.exports = new WhatsAppService();
