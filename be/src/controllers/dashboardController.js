const Message = require('../models/Message');
const Rule = require('../models/Rule');
const logger = require('../utils/logger');

exports.getStats = async (req, res) => {
  try {
    const [totalMessages, totalAutoReplies, totalRules, activeRules] = await Promise.all([
      Message.countDocuments(),
      Message.countDocuments({
        $or: [
          {
            direction: 'outbound',
            sender_type: 'bot',
            delivery_status: 'sent'
          },
          {
            message_out: { $ne: null },
            sender_type: { $exists: false }
          }
        ]
      }),
      Rule.countDocuments(),
      Rule.countDocuments({ is_active: true }),
    ]);

    res.json({
      success: true,
      data: {
        totalMessages,
        totalAutoReplies,
        totalRules,
        activeRules,
      },
    });
  } catch (error) {
    logger.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};
