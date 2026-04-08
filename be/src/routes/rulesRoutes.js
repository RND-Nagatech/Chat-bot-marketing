const express = require('express');
const router = express.Router();
const rulesController = require('../controllers/rulesController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', rulesController.getAllRules);
router.post('/', rulesController.createRule);
router.put('/:id', rulesController.updateRule);
router.delete('/:id', rulesController.deleteRule);

module.exports = router;
