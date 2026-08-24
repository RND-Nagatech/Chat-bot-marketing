const aiTraceService = require('../services/aiTraceService');
const logger = require('../utils/logger');

exports.getRuns = async (req, res) => {
  try {
    const runs = await aiTraceService.listRuns(req.query.limit);
    res.json({
      success: true,
      count: runs.length,
      data: runs
    });
  } catch (error) {
    logger.error('Error fetching AI trace runs:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil AI trace runs'
    });
  }
};

exports.getRun = async (req, res) => {
  try {
    const run = await aiTraceService.getRun(req.params.runId);
    if (!run) {
      return res.status(404).json({
        success: false,
        message: 'AI trace run tidak ditemukan'
      });
    }

    res.json({
      success: true,
      data: run
    });
  } catch (error) {
    logger.error('Error fetching AI trace run detail:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil detail AI trace run'
    });
  }
};
