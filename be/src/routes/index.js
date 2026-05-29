const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const rulesRoutes = require('./rulesRoutes');
const messagesRoutes = require('./messagesRoutes');
const whatsappRoutes = require('./whatsappRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const knowledgeRoutes = require('./knowledgeRoutes');

router.use('/auth', authRoutes);
router.use('/rules', rulesRoutes);
router.use('/messages', messagesRoutes);
router.use('/wa', whatsappRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/knowledge', knowledgeRoutes);

module.exports = router;
