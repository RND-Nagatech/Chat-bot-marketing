const express = require('express');
const router = express.Router();
const customersController = require('../controllers/customersController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', customersController.getCustomers);
router.put('/:id', customersController.updateCustomer);
router.delete('/:id', customersController.deleteCustomer);

module.exports = router;
