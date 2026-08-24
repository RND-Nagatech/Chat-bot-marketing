const LeadCapture = require('../models/LeadCapture');
const logger = require('../utils/logger');

const getSalesIdentity = (req) => {
  const primary = req.user?.kode_sales || req.user?.salesId || req.user?.userId;
  const legacy = req.user?.userId;
  return {
    primary: primary ? String(primary) : null,
    allowed: [primary, legacy].filter(Boolean).map(String)
  };
};

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const demoFilter = (search = '', sales = {}) => {
  const filter = {
    intent_type: 'demo',
    no_hp: { $ne: '-' },
    nama_toko: { $ne: '-' }
  };

  if (sales.primary) {
    filter.sales_id = { $in: sales.allowed };
  }

  const normalizedSearch = (search || '').trim();
  if (normalizedSearch) {
    const regex = new RegExp(escapeRegex(normalizedSearch), 'i');
    filter.$or = [
      { nama: regex },
      { nama_toko: regex },
      { alamat: regex },
      { no_hp: regex },
      { phone: regex },
      { demo_program: regex },
      { orderan: regex }
    ];
  }

  return filter;
};

const mapDemoRequest = (lead) => ({
  id: lead._id,
  sales_id: lead.sales_id || null,
  phone: lead.phone,
  nama: lead.nama,
  nama_toko: lead.nama_toko,
  alamat: lead.alamat,
  no_hp: lead.no_hp,
  demo_program: lead.demo_program && lead.demo_program !== '-' ? lead.demo_program : lead.orderan,
  source_message_id: lead.source_message_id,
  wa_message_id: lead.wa_message_id,
  createdAt: lead.createdAt,
  updatedAt: lead.updatedAt
});

exports.getDemoRequests = async (req, res) => {
  try {
    const sales = getSalesIdentity(req);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(5000, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;
    const filter = demoFilter(req.query.search, sales);

    const [rows, total, totalDemoRequests] = await Promise.all([
      LeadCapture.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      LeadCapture.countDocuments(filter),
      LeadCapture.countDocuments(demoFilter('', sales))
    ]);

    res.json({
      success: true,
      data: rows.map(mapDemoRequest),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        totalDemoRequests
      }
    });
  } catch (error) {
    logger.error('Error fetching demo requests:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.updateDemoRequest = async (req, res) => {
  try {
    const sales = getSalesIdentity(req);
    const allowed = ['nama', 'nama_toko', 'alamat', 'no_hp', 'demo_program'];
    const payload = { intent_type: 'demo' };

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        const value = (req.body[key] || '').toString().trim();
        payload[key] = value || '-';
      }
    }

    if (payload.demo_program) {
      payload.orderan = payload.demo_program;
    }

    const existing = await LeadCapture.findById(req.params.id);
    if (!existing || existing.intent_type !== 'demo') {
      return res.status(404).json({ success: false, message: 'Request demo tidak ditemukan' });
    }

    if (existing.sales_id && !sales.allowed.includes(existing.sales_id)) {
      return res.status(403).json({
        success: false,
        message: 'Request demo ini hanya bisa diedit oleh sales yang membuat data.'
      });
    }

    if (sales.primary && existing.sales_id !== sales.primary) {
      payload.sales_id = sales.primary;
    }

    const demoRequest = await LeadCapture.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    );

    res.json({ success: true, data: mapDemoRequest(demoRequest) });
  } catch (error) {
    logger.error('Error updating demo request:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.deleteDemoRequest = async (req, res) => {
  try {
    const sales = getSalesIdentity(req);
    const existing = await LeadCapture.findById(req.params.id);
    if (!existing || existing.intent_type !== 'demo') {
      return res.status(404).json({ success: false, message: 'Request demo tidak ditemukan' });
    }

    if (existing.sales_id && !sales.allowed.includes(existing.sales_id)) {
      return res.status(403).json({
        success: false,
        message: 'Request demo ini hanya bisa dihapus oleh sales yang membuat data.'
      });
    }

    await existing.deleteOne();

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting demo request:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
