const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/status', whatsappController.getStatus);
router.get('/qr', whatsappController.getQRCode);
router.post('/connect', whatsappController.connect);
router.post('/reconnect', whatsappController.reconnect);
router.post('/qr/refresh', whatsappController.refreshQRCode);
router.post('/disconnect', whatsappController.disconnect);

module.exports = router;
