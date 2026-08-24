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

const customerFilter = (search = '', sales = {}) => {
  const filter = {
    intent_type: { $ne: 'demo' },
    no_hp: { $ne: '-' },
    nama_toko: { $ne: '-' },
    orderan: { $ne: '-' }
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
      { orderan: regex }
    ];
  }

  return filter;
};

const mapCustomer = (lead) => ({
  id: lead._id,
  sales_id: lead.sales_id || null,
  phone: lead.phone,
  nama: lead.nama,
  nama_toko: lead.nama_toko,
  alamat: lead.alamat,
  no_hp: lead.no_hp,
  orderan: lead.orderan,
  source_message_id: lead.source_message_id,
  wa_message_id: lead.wa_message_id,
  createdAt: lead.createdAt,
  updatedAt: lead.updatedAt
});

exports.getCustomers = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(5000, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;
    const sales = getSalesIdentity(req);
    const filter = customerFilter(req.query.search, sales);

    const [rows, total, totalCustomers, totalOrders] = await Promise.all([
      LeadCapture.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      LeadCapture.countDocuments(filter),
      LeadCapture.countDocuments(customerFilter('', sales)),
      LeadCapture.find(customerFilter('', sales)).select('orderan').lean()
    ]);

    const orderCount = totalOrders.reduce((count, lead) => {
      const orderan = (lead.orderan || '').trim();
      if (!orderan || orderan === '-') return count;
      return count + orderan.split(/\n|;/).filter(Boolean).length;
    }, 0);

    res.json({
      success: true,
      data: rows.map(mapCustomer),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        totalCustomers,
        totalOrders: orderCount
      }
    });
  } catch (error) {
    logger.error('Error fetching customers:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const sales = getSalesIdentity(req);
    const allowed = ['nama', 'nama_toko', 'alamat', 'no_hp', 'orderan'];
    const payload = {};

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        const value = (req.body[key] || '').toString().trim();
        payload[key] = value || '-';
      }
    }

    const existing = await LeadCapture.findById(req.params.id);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Customer tidak ditemukan' });
    }

    if (existing.sales_id && !sales.allowed.includes(existing.sales_id)) {
      return res.status(403).json({
        success: false,
        message: 'Customer ini hanya bisa diedit oleh sales yang membuat data.'
      });
    }

    if (sales.primary && existing.sales_id !== sales.primary) {
      payload.sales_id = sales.primary;
    }

    const customer = await LeadCapture.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    );

    res.json({ success: true, data: mapCustomer(customer) });
  } catch (error) {
    logger.error('Error updating customer:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const sales = getSalesIdentity(req);
    const existing = await LeadCapture.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Customer tidak ditemukan' });
    }

    if (existing.sales_id && !sales.allowed.includes(existing.sales_id)) {
      return res.status(403).json({
        success: false,
        message: 'Customer ini hanya bisa dihapus oleh sales yang membuat data.'
      });
    }

    await existing.deleteOne();

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting customer:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
