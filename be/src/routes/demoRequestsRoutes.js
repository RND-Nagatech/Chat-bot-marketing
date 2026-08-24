const express = require('express');
const router = express.Router();
const demoRequestsController = require('../controllers/demoRequestsController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', demoRequestsController.getDemoRequests);
router.put('/:id', demoRequestsController.updateDemoRequest);
router.delete('/:id', demoRequestsController.deleteDemoRequest);

module.exports = router;
