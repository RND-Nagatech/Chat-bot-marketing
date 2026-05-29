const multer = require('multer');
const ragService = require('../services/ragService');
const lmStudioService = require('../services/lmStudioService');
const logger = require('../utils/logger');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: ragService.maxFileBytes
  }
});

exports.uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();

    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Ukuran file knowledge melewati batas'
      : error.message || 'Gagal membaca file upload';

    return res.status(400).json({ success: false, message });
  });
};

exports.getDocuments = async (req, res) => {
  try {
    const documents = await ragService.listDocuments();
    res.json({ success: true, count: documents.length, data: documents });
  } catch (error) {
    logger.error('Error fetching knowledge documents:', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil dokumen knowledge' });
  }
};

exports.uploadDocument = async (req, res) => {
  try {
    const document = await ragService.ingestDocument(req.file);
    const statusCode = document.status === 'failed' ? 202 : 201;
    res.status(statusCode).json({ success: document.status !== 'failed', data: document });
  } catch (error) {
    logger.error('Error uploading knowledge document:', error);
    res.status(400).json({ success: false, message: error.message || 'Gagal upload dokumen knowledge' });
  }
};

exports.createTextDocument = async (req, res) => {
  try {
    const { title, text } = req.body || {};
    const document = await ragService.ingestText({ title, text });
    const statusCode = document.status === 'failed' ? 202 : 201;
    res.status(statusCode).json({ success: document.status !== 'failed', data: document });
  } catch (error) {
    logger.error('Error creating text knowledge document:', error);
    res.status(400).json({ success: false, message: error.message || 'Gagal menyimpan teks knowledge' });
  }
};

exports.reindexDocument = async (req, res) => {
  try {
    const document = await ragService.reindexDocument(req.params.id);
    res.json({ success: document.status !== 'failed', data: document });
  } catch (error) {
    logger.error('Error reindexing knowledge document:', error);
    res.status(400).json({ success: false, message: error.message || 'Gagal reindex dokumen knowledge' });
  }
};

exports.updateDocument = async (req, res) => {
  try {
    const { title, text } = req.body || {};
    const document = await ragService.updateDocument(req.params.id, { title, text });
    res.json({ success: document.status !== 'failed', data: document });
  } catch (error) {
    logger.error('Error updating knowledge document:', error);
    res.status(400).json({ success: false, message: error.message || 'Gagal mengupdate dokumen knowledge' });
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const document = await ragService.deleteDocument(req.params.id);
    res.json({ success: true, message: 'Dokumen knowledge berhasil dinonaktifkan', data: document });
  } catch (error) {
    logger.error('Error deleting knowledge document:', error);
    res.status(404).json({ success: false, message: error.message || 'Dokumen knowledge tidak ditemukan' });
  }
};

exports.activateDocument = async (req, res) => {
  try {
    const document = await ragService.activateDocument(req.params.id);
    res.json({ success: true, message: 'Dokumen knowledge berhasil diaktifkan', data: document });
  } catch (error) {
    logger.error('Error activating knowledge document:', error);
    res.status(404).json({ success: false, message: error.message || 'Dokumen knowledge tidak ditemukan' });
  }
};

exports.getStatus = async (req, res) => {
  const lmStudio = await lmStudioService.getStatus();
  res.json({
    success: true,
    data: {
      rag_enabled: ragService.isEnabled(),
      lm_studio: lmStudio
    }
  });
};
