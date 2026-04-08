const rulesEngine = require('../services/rulesEngine');
const logger = require('../utils/logger');

exports.getAllRules = async (req, res) => {
  try {
    const rules = await rulesEngine.getAllRules();

    res.json({
      success: true,
      count: rules.length,
      data: rules
    });
  } catch (error) {
    logger.error('Error fetching rules:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.createRule = async (req, res) => {
  try {
    const { keyword, match_type, response, is_active } = req.body;

    if (!keyword || !match_type || !response) {
      return res.status(400).json({
        success: false,
        message: 'Keyword, match_type, and response are required'
      });
    }

    if (!['contains', 'exact'].includes(match_type)) {
      return res.status(400).json({
        success: false,
        message: 'match_type must be either "contains" or "exact"'
      });
    }

    const rule = await rulesEngine.createRule({
      keyword,
      match_type,
      response,
      is_active: is_active !== undefined ? is_active : true
    });

    logger.info(`Rule created: ${keyword}`);

    res.status(201).json({
      success: true,
      data: rule
    });
  } catch (error) {
    logger.error('Error creating rule:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.updateRule = async (req, res) => {
  try {
    const { id } = req.params;
    const { keyword, match_type, response, is_active } = req.body;

    if (match_type && !['contains', 'exact'].includes(match_type)) {
      return res.status(400).json({
        success: false,
        message: 'match_type must be either "contains" or "exact"'
      });
    }

    const updateData = {};
    if (keyword !== undefined) updateData.keyword = keyword;
    if (match_type !== undefined) updateData.match_type = match_type;
    if (response !== undefined) updateData.response = response;
    if (is_active !== undefined) updateData.is_active = is_active;

    const rule = await rulesEngine.updateRule(id, updateData);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Rule not found'
      });
    }

    logger.info(`Rule updated: ${id}`);

    res.json({
      success: true,
      data: rule
    });
  } catch (error) {
    logger.error('Error updating rule:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.deleteRule = async (req, res) => {
  try {
    const { id } = req.params;

    const rule = await rulesEngine.deleteRule(id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Rule not found'
      });
    }

    logger.info(`Rule deleted: ${id}`);

    res.json({
      success: true,
      message: 'Rule deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting rule:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
