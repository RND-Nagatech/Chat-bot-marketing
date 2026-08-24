const express = require('express');
const router = express.Router();
const aiTraceController = require('../controllers/aiTraceController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/runs', aiTraceController.getRuns);
router.get('/runs/:runId', aiTraceController.getRun);

module.exports = router;
