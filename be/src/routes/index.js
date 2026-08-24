const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const rulesRoutes = require('./rulesRoutes');
const messagesRoutes = require('./messagesRoutes');
const whatsappRoutes = require('./whatsappRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const knowledgeRoutes = require('./knowledgeRoutes');
const aiTraceRoutes = require('./aiTraceRoutes');
const customersRoutes = require('./customersRoutes');
const demoRequestsRoutes = require('./demoRequestsRoutes');

router.use('/auth', authRoutes);
router.use('/rules', rulesRoutes);
router.use('/messages', messagesRoutes);
router.use('/wa', whatsappRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/knowledge', knowledgeRoutes);
router.use('/ai', aiTraceRoutes);
router.use('/customers', customersRoutes);
router.use('/demo-requests', demoRequestsRoutes);

module.exports = router;
