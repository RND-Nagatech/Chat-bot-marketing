require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const routes = require('./routes');
const logger = require('./utils/logger');
const whatsappService = require('./services/whatsappService');
const messageService = require('./services/messageService');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const authInfoDir = path.join(__dirname, '../auth_info');
if (!fs.existsSync(authInfoDir)) {
  fs.mkdirSync(authInfoDir, { recursive: true });
}

app.use('/api', routes);

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    whatsapp_status: 'multi-session',
    whatsapp_connected_count: whatsappService.getConnectedCount()
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.use((err, req, res, next) => {
  logger.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDB();
    await messageService.applyHybridRetentionPolicy();

    logger.info('Checking stored WhatsApp user sessions...');
    const attempted = await whatsappService.connectStoredSessions();
    logger.info(`Automatic WhatsApp connection attempted for ${attempted} stored session(s)`);

    const server = app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`API Base URL: http://localhost:${PORT}/api`);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Stop the other backend process and retry.`);
      } else {
        logger.error('HTTP server error:', error);
      }
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
