const whatsappService = require('../services/whatsappService');
const WhatsAppSession = require('../models/WhatsAppSession');
const logger = require('../utils/logger');

exports.getStatus = async (req, res) => {
  try {
    const runtime = whatsappService.getStatus();
    const session = await WhatsAppSession.findOne();

    const currentStatus = runtime.status;
    const currentQr = runtime.qrCode;
    const currentError = runtime.lastError || session?.last_error || null;
    const phoneNumber = runtime.status === 'connected'
      ? (session?.phone_number || null)
      : null;

    if (runtime.status === 'disconnected' && session && ['connecting', 'qr_ready', 'authorizing'].includes(session.status)) {
      await WhatsAppSession.findOneAndUpdate(
        {},
        { status: 'disconnected', qr_code: null, phone_number: null, last_error: currentError },
        { upsert: true }
      );
    }

    res.json({
      success: true,
      data: {
        status: currentStatus,
        phone_number: phoneNumber,
        qr_available: !!currentQr,
        last_error: currentError
      }
    });
  } catch (error) {
    logger.error('Error getting WhatsApp status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.getQRCode = async (req, res) => {
  try {
    const status = whatsappService.getStatus();
    const qrCode = whatsappService.getQRCode();
    const currentStatus = status.status;

    if (currentStatus !== 'qr_ready' || !qrCode) {
      return res.status(404).json({
        success: false,
        message: 'QR code not available. Please connect first.'
      });
    }

    res.json({
      success: true,
      data: {
        qr_code: qrCode
      }
    });
  } catch (error) {
    logger.error('Error getting QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.connect = async (req, res) => {
  try {
    const status = whatsappService.getStatus().status;
    if (['connecting', 'qr_ready', 'authorizing', 'connected'].includes(status)) {
      return res.status(200).json({
        success: false,
        message: `WhatsApp is already ${status}`,
        data: { status }
      });
    }

    await whatsappService.connect();

    res.json({
      success: true,
      message: 'WhatsApp connection initiated. Scan QR code to continue.',
      data: {
        status: whatsappService.getStatus().status
      }
    });
  } catch (error) {
    logger.error('Error connecting to WhatsApp:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to connect to WhatsApp'
    });
  }
};

exports.disconnect = async (req, res) => {
  try {
    if (!['connected', 'connecting', 'qr_ready', 'authorizing'].includes(whatsappService.getStatus().status)) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp is not connected'
      });
    }

    await whatsappService.disconnect();

    res.json({
      success: true,
      message: 'WhatsApp disconnected successfully'
    });
  } catch (error) {
    logger.error('Error disconnecting from WhatsApp:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect from WhatsApp'
    });
  }
};

exports.refreshQRCode = async (req, res) => {
  try {
    await whatsappService.refreshQRCode();

    res.json({
      success: true,
      message: 'QR code refresh initiated',
      data: {
        status: whatsappService.getStatus().status
      }
    });
  } catch (error) {
    logger.error('Error refreshing QR code:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to refresh QR code'
    });
  }
};

exports.reconnect = async (req, res) => {
  try {
    await whatsappService.restartPairing();

    res.json({
      success: true,
      message: 'WhatsApp pairing restart initiated',
      data: {
        status: whatsappService.getStatus().status
      }
    });
  } catch (error) {
    logger.error('Error restarting WhatsApp pairing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restart WhatsApp pairing'
    });
  }
};
