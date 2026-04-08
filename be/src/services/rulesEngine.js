const Rule = require('../models/Rule');
const logger = require('../utils/logger');

class RulesEngine {
  normalizeMessage(message) {
    return message.toLowerCase().trim();
  }

  async matchRule(message) {
    try {
      const normalizedMessage = this.normalizeMessage(message);

      const activeRules = await Rule.find({ is_active: true }).sort({ createdAt: 1 });

      for (const rule of activeRules) {
        const normalizedKeyword = this.normalizeMessage(rule.keyword);

        let isMatch = false;

        if (rule.match_type === 'exact') {
          isMatch = normalizedMessage === normalizedKeyword;
        } else if (rule.match_type === 'contains') {
          isMatch = normalizedMessage.includes(normalizedKeyword);
        }

        if (isMatch) {
          logger.info(`Rule matched: ${rule.keyword} (${rule.match_type})`);
          return rule;
        }
      }

      logger.info('No matching rule found');
      return null;
    } catch (error) {
      logger.error('Error matching rule:', error);
      throw error;
    }
  }

  async getAllRules() {
    return await Rule.find().sort({ createdAt: -1 });
  }

  async createRule(ruleData) {
    const rule = new Rule(ruleData);
    return await rule.save();
  }

  async updateRule(id, ruleData) {
    return await Rule.findByIdAndUpdate(id, ruleData, { new: true });
  }

  async deleteRule(id) {
    return await Rule.findByIdAndDelete(id);
  }

  async getRuleById(id) {
    return await Rule.findById(id);
  }
}

module.exports = new RulesEngine();
