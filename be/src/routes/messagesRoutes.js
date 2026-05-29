const express = require('express');
const router = express.Router();
const messagesController = require('../controllers/messagesController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', messagesController.getAllMessages);
router.get('/conversations', messagesController.getConversations);
router.get('/conversations/:phone', messagesController.getConversationByPhone);
router.post('/reply', messagesController.sendManualReply);
router.post('/reply-image', messagesController.imageUploadMiddleware, messagesController.sendManualImageReply);
router.post('/edit', messagesController.editMessage);
router.post('/resolve-pending', messagesController.resolvePendingMessage);
router.post('/delete-for-me', messagesController.deleteMessageForMe);
router.post('/delete-for-all', messagesController.deleteMessageForAll);
router.get('/phone/:phone', messagesController.getMessagesByPhone);

module.exports = router;
