const express = require('express');
const router = express.Router();
const knowledgeController = require('../controllers/knowledgeController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/status', knowledgeController.getStatus);
router.get('/documents', knowledgeController.getDocuments);
router.post('/documents', knowledgeController.uploadMiddleware, knowledgeController.uploadDocument);
router.post('/documents/text', knowledgeController.createTextDocument);
router.put('/documents/:id', knowledgeController.updateDocument);
router.post('/documents/:id/reindex', knowledgeController.reindexDocument);
router.post('/documents/:id/activate', knowledgeController.activateDocument);
router.delete('/documents/:id', knowledgeController.deleteDocument);

module.exports = router;
