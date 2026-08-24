const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  pemilik_pengguna_id: {
    type: String,
    default: null,
    index: true
  },
  nomor_telepon: {
    type: String,
    required: true,
    trim: true
  },
  pesan: {
    masuk: {
      type: String,
      default: null
    },
    keluar: {
      type: String,
      default: null
    },
    arah: {
      type: String,
      enum: ['masuk', 'keluar'],
      default: 'masuk',
      required: true
    },
    tipe_pengirim: {
      type: String,
      enum: ['customer', 'bot', 'admin'],
      default: 'customer',
      required: true
    },
    status_pengiriman: {
      type: String,
      enum: ['terkirim', 'gagal', null],
      default: null
    }
  },
  aturan: {
    cocok: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rule',
      default: null
    }
  },
  tindak_lanjut: {
    status: {
      type: String,
      enum: ['open', 'resolved', null],
      default: null
    },
    kategori: {
      type: String,
      default: null
    },
    alasan: {
      type: String,
      default: null
    },
    ringkasan: {
      type: String,
      default: null
    },
    diselesaikan_pada: {
      type: Date,
      default: null
    },
    diselesaikan_oleh: {
      type: String,
      default: null
    }
  },
  ai: {
    id_trace: {
      type: String,
      default: null,
      index: true
    }
  },
  whatsapp: {
    id_pesan: {
      type: String,
      default: null
    },
    id_pesan_balasan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null
    },
    id_pesan_whatsapp_balasan: {
      type: String,
      default: null
    },
    jid: {
      type: String,
      default: null
    },
    jid_remote: {
      type: String,
      default: null
    },
    peserta: {
      type: String,
      default: null
    },
    dari_saya: {
      type: Boolean,
      default: null
    },
    waktu_pesan: {
      type: Number,
      default: null
    }
  },
  edit: {
    sudah_diedit: {
      type: Boolean,
      default: false
    },
    diedit_pada: {
      type: Date,
      default: null
    },
    diedit_oleh: {
      type: String,
      default: null
    }
  },
  pencabutan: {
    sudah_dicabut: {
      type: Boolean,
      default: false
    },
    dicabut_pada: {
      type: Date,
      default: null
    },
    dicabut_oleh: {
      type: String,
      default: null
    }
  },
  penghapusan: {
    dihapus_untuk_admin: {
      type: Boolean,
      default: false
    },
    dihapus_untuk_semua_pada: {
      type: Date,
      default: null
    },
    dihapus_oleh: {
      type: String,
      default: null
    }
  },
  status: {
    type: String,
    enum: ['handled_by_bot', 'needs_admin_follow_up'],
    default: 'needs_admin_follow_up'
  },
  waktu_kedaluwarsa: {
    type: Date,
    default: null
  }
}, {
  timestamps: {
    createdAt: 'dibuat_pada',
    updatedAt: 'diperbarui_pada'
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

const virtualMap = {
  owner_user_id: 'pemilik_pengguna_id',
  phone: 'nomor_telepon',
  message_in: 'pesan.masuk',
  message_out: 'pesan.keluar',
  matched_rule: 'aturan.cocok',
  sender_type: 'pesan.tipe_pengirim',
  wa_jid: 'whatsapp.jid',
  follow_up_state: 'tindak_lanjut.status',
  follow_up_resolved_at: 'tindak_lanjut.diselesaikan_pada',
  follow_up_resolved_by: 'tindak_lanjut.diselesaikan_oleh',
  follow_up_category: 'tindak_lanjut.kategori',
  follow_up_reason: 'tindak_lanjut.alasan',
  follow_up_summary: 'tindak_lanjut.ringkasan',
  ai_trace_run_id: 'ai.id_trace',
  reply_to_message_id: 'whatsapp.id_pesan_balasan',
  reply_to_wa_message_id: 'whatsapp.id_pesan_whatsapp_balasan',
  wa_message_id: 'whatsapp.id_pesan',
  wa_remote_jid: 'whatsapp.jid_remote',
  wa_participant: 'whatsapp.peserta',
  wa_from_me: 'whatsapp.dari_saya',
  wa_message_timestamp: 'whatsapp.waktu_pesan',
  deleted_for_admin: 'penghapusan.dihapus_untuk_admin',
  deleted_for_all_at: 'penghapusan.dihapus_untuk_semua_pada',
  deleted_by: 'penghapusan.dihapus_oleh',
  is_edited: 'edit.sudah_diedit',
  edited_at: 'edit.diedit_pada',
  edited_by: 'edit.diedit_oleh',
  is_revoked: 'pencabutan.sudah_dicabut',
  revoked_at: 'pencabutan.dicabut_pada',
  revoked_by: 'pencabutan.dicabut_oleh',
  expires_at: 'waktu_kedaluwarsa',
  createdAt: 'dibuat_pada',
  updatedAt: 'diperbarui_pada'
};

function normalizeDirection(value) {
  if (value === 'inbound') return 'masuk';
  if (value === 'outbound') return 'keluar';
  return value;
}

function denormalizeDirection(value) {
  if (value === 'masuk') return 'inbound';
  if (value === 'keluar') return 'outbound';
  return value;
}

function normalizeDeliveryStatus(value) {
  if (value === 'sent') return 'terkirim';
  if (value === 'failed') return 'gagal';
  return value;
}

function denormalizeDeliveryStatus(value) {
  if (value === 'terkirim') return 'sent';
  if (value === 'gagal') return 'failed';
  return value;
}

for (const [legacyName, newPath] of Object.entries(virtualMap)) {
  messageSchema.virtual(legacyName)
    .get(function getLegacyField() {
      return this.get(newPath);
    })
    .set(function setLegacyField(value) {
      this.set(newPath, value);
    });
}

messageSchema.virtual('direction')
  .get(function getDirection() {
    return denormalizeDirection(this.get('pesan.arah'));
  })
  .set(function setDirection(value) {
    this.set('pesan.arah', normalizeDirection(value));
  });

messageSchema.virtual('delivery_status')
  .get(function getDeliveryStatus() {
    return denormalizeDeliveryStatus(this.get('pesan.status_pengiriman'));
  })
  .set(function setDeliveryStatus(value) {
    this.set('pesan.status_pengiriman', normalizeDeliveryStatus(value));
  });

messageSchema.pre('validate', function normalizeLegacyValues(next) {
  if (this.pesan?.arah === 'inbound') this.pesan.arah = 'masuk';
  if (this.pesan?.arah === 'outbound') this.pesan.arah = 'keluar';
  if (this.pesan?.status_pengiriman === 'sent') this.pesan.status_pengiriman = 'terkirim';
  if (this.pesan?.status_pengiriman === 'failed') this.pesan.status_pengiriman = 'gagal';
  next();
});

const queryPathMap = {
  owner_user_id: 'pemilik_pengguna_id',
  phone: 'nomor_telepon',
  message_in: 'pesan.masuk',
  message_out: 'pesan.keluar',
  matched_rule: 'aturan.cocok',
  direction: 'pesan.arah',
  sender_type: 'pesan.tipe_pengirim',
  delivery_status: 'pesan.status_pengiriman',
  wa_jid: 'whatsapp.jid',
  follow_up_state: 'tindak_lanjut.status',
  follow_up_resolved_at: 'tindak_lanjut.diselesaikan_pada',
  follow_up_resolved_by: 'tindak_lanjut.diselesaikan_oleh',
  follow_up_category: 'tindak_lanjut.kategori',
  follow_up_reason: 'tindak_lanjut.alasan',
  follow_up_summary: 'tindak_lanjut.ringkasan',
  ai_trace_run_id: 'ai.id_trace',
  reply_to_message_id: 'whatsapp.id_pesan_balasan',
  reply_to_wa_message_id: 'whatsapp.id_pesan_whatsapp_balasan',
  wa_message_id: 'whatsapp.id_pesan',
  wa_remote_jid: 'whatsapp.jid_remote',
  wa_participant: 'whatsapp.peserta',
  wa_from_me: 'whatsapp.dari_saya',
  wa_message_timestamp: 'whatsapp.waktu_pesan',
  deleted_for_admin: 'penghapusan.dihapus_untuk_admin',
  deleted_for_all_at: 'penghapusan.dihapus_untuk_semua_pada',
  deleted_by: 'penghapusan.dihapus_oleh',
  is_edited: 'edit.sudah_diedit',
  edited_at: 'edit.diedit_pada',
  edited_by: 'edit.diedit_oleh',
  is_revoked: 'pencabutan.sudah_dicabut',
  revoked_at: 'pencabutan.dicabut_pada',
  revoked_by: 'pencabutan.dicabut_oleh',
  expires_at: 'waktu_kedaluwarsa',
  createdAt: 'dibuat_pada',
  updatedAt: 'diperbarui_pada'
};

function translateValue(path, value) {
  if (Array.isArray(value)) {
    return value.map((item) => translateValue(path, item));
  }
  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId)) {
    const translated = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      translated[key] = translateValue(path, nestedValue);
    }
    return translated;
  }
  if (path === 'direction') return normalizeDirection(value);
  if (path === 'delivery_status') return normalizeDeliveryStatus(value);
  return value;
}

function translateKeys(input) {
  if (!input || typeof input !== 'object' || input instanceof Date || input instanceof mongoose.Types.ObjectId) {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map(translateKeys);
  }

  for (const key of Object.keys(input)) {
    const value = input[key];

    if (key.startsWith('$')) {
      input[key] = translateKeys(value);
      continue;
    }

    const translatedKey = queryPathMap[key] || key;
    const translatedValue = queryPathMap[key] ? translateValue(key, value) : translateKeys(value);

    if (translatedKey !== key) {
      delete input[key];
    }
    input[translatedKey] = translatedValue;
  }

  return input;
}

messageSchema.pre(/^find/, function translateFindQuery(next) {
  translateKeys(this.getQuery());
  if (this.options?.sort) {
    translateKeys(this.options.sort);
  }
  next();
});

messageSchema.pre('countDocuments', function translateCountQuery(next) {
  translateKeys(this.getQuery());
  next();
});

messageSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function translateUpdateQuery(next) {
  translateKeys(this.getQuery());
  translateKeys(this.getUpdate());
  next();
});

messageSchema.index({ pemilik_pengguna_id: 1, nomor_telepon: 1, dibuat_pada: -1 });
messageSchema.index({ pemilik_pengguna_id: 1, 'pesan.arah': 1, 'pesan.tipe_pengirim': 1, dibuat_pada: -1 });
messageSchema.index({ pemilik_pengguna_id: 1, 'tindak_lanjut.status': 1, 'pesan.arah': 1, dibuat_pada: -1 });
messageSchema.index({ pemilik_pengguna_id: 1, nomor_telepon: 1, 'whatsapp.id_pesan': 1, 'pesan.arah': 1, 'pesan.tipe_pengirim': 1 });
messageSchema.index({ waktu_kedaluwarsa: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Message', messageSchema, 'tt_pesan_whatsapp');
