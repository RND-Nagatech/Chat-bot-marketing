const LeadCapture = require('../models/LeadCapture');
const lmStudioService = require('./lmStudioService');
const aiTraceService = require('./aiTraceService');
const logger = require('../utils/logger');

let UndiciAgent = null;
try {
  ({ Agent: UndiciAgent } = require('undici'));
} catch {
  UndiciAgent = null;
}

class LeadCaptureService {
  isEnabled() {
    return process.env.LEAD_CAPTURE_ENABLED === 'true';
  }

  shouldSyncGoogleSheets() {
    return process.env.GOOGLE_SHEETS_SYNC_ENABLED === 'true';
  }

  get webhookUrl() {
    return process.env.GOOGLE_SHEETS_WEBHOOK_URL || '';
  }

  get webhookSecret() {
    return process.env.GOOGLE_SHEETS_WEBHOOK_SECRET || '';
  }

  getSheetTimeoutMs() {
    const configured = Number(process.env.GOOGLE_SHEETS_WEBHOOK_TIMEOUT_MS);
    return Number.isFinite(configured) && configured > 0 ? configured : 30000;
  }

  getSheetRetryCount() {
    const configured = Number(process.env.GOOGLE_SHEETS_WEBHOOK_RETRIES);
    return Number.isFinite(configured) && configured >= 0 ? Math.floor(configured) : 2;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  normalize(value) {
    const text = (value || '').toString().trim();
    return text || '-';
  }

  normalizePhone(phone) {
    const text = (phone || '').toString().trim();
    if (!text) return '-';
    return text.replace(/@s\.whatsapp\.net$/i, '').replace(/@c\.us$/i, '');
  }

  normalizeComparable(value) {
    return this.normalize(value)
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  formatConversation(messages = []) {
    return messages
      .map((message) => `${message.role === 'assistant' ? 'Bot/Admin' : 'Customer'}: ${message.text || ''}`)
      .filter(Boolean)
      .join('\n');
  }

  parseJson(text) {
    const normalized = (text || '').trim();
    try {
      return JSON.parse(normalized);
    } catch {
      const match = normalized.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }

  toTitleCase(text) {
    return this.normalize(text)
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1) : word)
      .join(' ');
  }

  stripLeadPrefix(text) {
    return this.normalize(text)
      .replace(/^(baik,?\s*)?(ini\s*)?(nama\s+saya|saya|atas\s+nama|bapak|ibu|pak|bu)\s+/i, '')
      .replace(/^dari\s+/i, '')
      .trim();
  }

  cleanStoreName(text) {
    return this.normalize(text)
      .replace(/^(baik,?\s*)?(ini\s*)?(nama\s+toko|tokonya|toko\s+saya|dari)\s+/i, '')
      .replace(/^dari\s+/i, '')
      .trim();
  }

  cleanLeadLine(line = '') {
    return (line || '')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/^[-*•\d.)\s]+/, '')
      .trim();
  }

  looksLikeInterestText(text = '') {
    return /mau\s+(beli|pesan|order|pasang|langganan|ambil)|ingin\s+(beli|pesan|order|pasang|langganan|ambil)|minat\s+(beli|order|pasang|demo)|tertarik\s+(beli|order|pasang|demo|lanjut)|deal|jadi\s+(beli|ambil)|lanjut\s+(beli|order|proses)|minta\s+(demo|jadwal|penawaran\s+resmi|quotation|invoice|dihubungi)|hubungi\s+saya|beli\s+ini\s+juga|pesan\s+ini\s+juga|ambil\s+ini\s+juga|tambah(?:kan)?(?:\s+\w+){0,3}\s+(program|order|pesanan|nagatech|nagagold|gold|member)|tambah(?:kan)?\s+(deh|dong|lagi|juga|sama)/i
      .test(text || '');
  }

  isDemoIntentText(text = '') {
    return /\b(demo|demokan|jadwal\s+demo|minta\s+demo|ingin\s+demo|mau\s+demo|presentasi|meeting|zoom|trial)\b/i
      .test(text || '');
  }

  isPurchaseIntentText(text = '') {
    return /\b(mau|ingin|jadi|siap|lanjut|minat|tertarik)\s+(beli|pesan|order|pasang|langganan|ambil)|\b(deal|invoice|quotation|penawaran\s+resmi|beli\s+ini|pesan\s+ini|ambil\s+ini)\b/i
      .test(text || '');
  }

  inferIntentType({ question = '', answer = '', conversationMemory = [] }) {
    const latestText = `${question || ''}\n${answer || ''}`;
    if (this.isDemoIntentText(latestText)) return 'demo';
    if (this.isPurchaseIntentText(latestText)) return 'purchase';

    const memoryText = conversationMemory
      .slice(-8)
      .map((message) => message.text || '')
      .join('\n');
    if (this.isDemoIntentText(memoryText)) return 'demo';
    if (this.isPurchaseIntentText(memoryText)) return 'purchase';

    return 'unknown';
  }

  isFinalConfirmationText(text = '') {
    return /^(cukup|sudah|udah|oke|ok|iya|iyaa|ya|sip|lanjut|proses|gas)(\s+(cukup|aja|dulu|ya|pak|kak|mas|mbak|bu))*[.!?]*$/i
      .test((text || '').trim());
  }

  extractPhoneFromText(text) {
    const match = (text || '').match(/(?:\+?62|0)\d{8,14}|\b\d{9,15}\b/);
    return match ? match[0].replace(/[^\d+]/g, '') : '-';
  }

  mergeLead(base, patch) {
    const merged = { ...base };
    for (const [key, value] of Object.entries(patch || {})) {
      const normalized = this.normalize(value);
      if (normalized !== '-' && this.normalize(merged[key]) === '-') {
        merged[key] = normalized;
      }
    }
    return merged;
  }

  normalizeOrderItem(value) {
    return this.normalize(value)
      .replace(/^[-*\d.)\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  normalizeOrderComparable(value) {
    return this.normalizeOrderItem(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  parseOrderList(orderan = '') {
    const normalized = this.normalize(orderan);
    if (normalized === '-') return [];

    return normalized
      .split(/\n|;|\s+\+\s+/)
      .map((item) => this.normalizeOrderItem(item))
      .filter((item) => item && item !== '-');
  }

  formatOrderList(orders = []) {
    const unique = [];
    const seen = new Set();

    for (const order of orders) {
      const normalized = this.normalizeOrderItem(order);
      const comparable = this.normalizeOrderComparable(normalized);
      if (!normalized || normalized === '-' || seen.has(comparable)) continue;
      seen.add(comparable);
      unique.push(normalized);
    }

    if (unique.length === 0) return '-';
    if (unique.length === 1) return unique[0];
    return unique.map((order, index) => `${index + 1}. ${order}`).join('\n');
  }

  mergeOrderLists(...orderValues) {
    return this.formatOrderList(orderValues.flatMap((value) => this.parseOrderList(value)));
  }

  mergeProgramLists(...programValues) {
    return this.mergeOrderLists(...programValues);
  }

  extractLeadFromCommaText(text = '') {
    const parts = (text || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length < 2) {
      return {};
    }

    const lead = {};
    const tokoIndex = parts.findIndex((part) => /toko|tokomas|toko\s+mas|emas|mas/i.test(part));
    const phoneIndex = parts.findIndex((part) => /(?:\+?62|0)\d{8,14}|\b\d{9,15}\b/.test(part));

    if (phoneIndex >= 0) {
      lead.no_hp = this.extractPhoneFromText(parts[phoneIndex]);
    }

    if (tokoIndex >= 0) {
      const storePart = parts[tokoIndex];
      const inlineNameStore = storePart.match(/\b(?:saya|nama\s+saya)\s+([^,.\n]+?)\s+dari\s+(toko[^,.\n]+)/i);

      if (inlineNameStore) {
        lead.nama = this.toTitleCase(this.stripLeadPrefix(inlineNameStore[1]));
        lead.nama_toko = this.toTitleCase(this.cleanStoreName(inlineNameStore[2]));
      } else {
        lead.nama_toko = this.toTitleCase(this.cleanStoreName(storePart));
      }

      const beforeStore = parts.slice(0, tokoIndex).join(' ');
      const afterStore = parts
        .slice(tokoIndex + 1)
        .filter((_, index) => tokoIndex + 1 + index !== phoneIndex);

      if (beforeStore && !lead.nama && !this.looksLikeInterestText(beforeStore)) {
        lead.nama = this.toTitleCase(this.stripLeadPrefix(beforeStore));
      }
      if (afterStore[0]) {
        lead.alamat = this.toTitleCase(this.stripLeadPrefix(afterStore[0]));
      }
    } else if (parts.length >= 3) {
      lead.nama = this.toTitleCase(this.stripLeadPrefix(parts[0]));
      lead.nama_toko = this.toTitleCase(this.cleanStoreName(parts[1]));
      lead.alamat = this.toTitleCase(this.stripLeadPrefix(parts[2]));
    }

    return lead;
  }

  extractLeadFromMultilineText(text = '') {
    const lines = (text || '')
      .split(/\r?\n/)
      .map((line) => this.cleanLeadLine(line))
      .filter(Boolean);

    if (lines.length < 2) {
      return {};
    }

    const lead = {};
    const phone = this.extractPhoneFromText(text);
    if (phone !== '-') {
      lead.no_hp = phone;
    }

    const nonPhoneLines = lines.filter((line) => this.extractPhoneFromText(line) === '-');

    for (const line of nonPhoneLines) {
      const labeled = line.match(/^(nama\s+(?:owner|pemilik|customer|saya|owner\/pemilik(?:\s+toko)?)|nama|owner|pemilik(?:\s+toko)?|nama\s+toko|toko|alamat(?:\/daerah)?(?:\s+toko)?|daerah(?:\/alamat)?(?:\s+toko)?|lokasi)\s*[:\-]\s*(.+)$/i);
      if (!labeled) continue;

      const label = labeled[1].toLowerCase();
      const value = labeled[2];
      if (/nama\s+toko|^toko$/.test(label)) {
        lead.nama_toko = this.toTitleCase(this.cleanStoreName(value));
      } else if (/alamat|daerah|lokasi/.test(label)) {
        lead.alamat = this.toTitleCase(this.stripLeadPrefix(value));
      } else {
        lead.nama = this.toTitleCase(this.stripLeadPrefix(value));
      }
    }

    if (this.normalize(lead.nama) === '-' && nonPhoneLines[0] && !this.looksLikeInterestText(nonPhoneLines[0])) {
      lead.nama = this.toTitleCase(this.stripLeadPrefix(nonPhoneLines[0]));
    }

    if (this.normalize(lead.nama_toko) === '-') {
      const storeLine = nonPhoneLines.find((line, index) =>
        index > 0 && /\btoko\b|tokomas|toko\s+mas|emas|mas\b/i.test(line)
      );
      if (storeLine) {
        lead.nama_toko = this.toTitleCase(this.cleanStoreName(storeLine));
      } else if (nonPhoneLines[1]) {
        lead.nama_toko = this.toTitleCase(this.cleanStoreName(nonPhoneLines[1]));
      }
    }

    if (this.normalize(lead.alamat) === '-') {
      const storeComparable = this.normalizeComparable(lead.nama_toko);
      const locationLine = nonPhoneLines.find((line, index) => {
        if (index === 0) return false;
        const comparable = this.normalizeComparable(this.cleanStoreName(line));
        return comparable !== storeComparable && !/\btoko\b|tokomas|toko\s+mas/i.test(line);
      });
      if (locationLine) {
        lead.alamat = this.toTitleCase(this.stripLeadPrefix(locationLine));
      }
    }

    return lead;
  }

  extractOrdersFromText(text = '') {
    const source = text || '';
    const orders = [];
    const addOrder = (value, index = source.length) => {
      const normalized = this.normalizeOrderItem(value);
      if (!normalized || normalized === '-') return;
      orders.push({ value: normalized, index: index >= 0 ? index : source.length });
    };
    const patterns = [
      /\bNagatech\s+Gold\s+Store\s+Solution\s+(?:Full|Lite)\s+Version\b/ig,
      /\bNagatech\s+Member\s+Solution\s+\((?:Barcode|RFID)\s+System\)\b/ig,
      /\bNagatech\s+Virtual\s+Member\s+Solution\b/ig,
      /\bNagatech\s+Gold\s+Store\s+HQ\s+Solution\b/ig,
      /\bNagatech\s+Gold\s+Store\s+Ledger\b/ig,
      /\bNagatech\s+Gold\s+Stock\s+Taking\s+Solution\s+\(RFID\)\b/ig,
      /\bNagatech\s+Gold\s+(?:Grocery|Manufacture)\s+Solution\s+(?:Full|Lite)\s+Version\b/ig,
      /\bNagatech\s+Gold\s+&\s+Diamond\s+Store\s+Solution\b/ig,
      /\bNagatech\s+Jewelry\s+Care\s+Solution\b/ig,
      /\bNagatech\s+Anti-Theft\b/ig,
      /\bNagatech\s+Gold\s+Trading\s+Solution\b/ig,
      /\bNagatech\s+Jewelry\s+Catalogue\b/ig,
      /\bNagatech\s+e-Commerce\s+App\b/ig,
      /\bNagatech\s+Gold\s+Pawn\s+Solution\b/ig
    ];

    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        addOrder(match[0], match.index);
      }
    }

    const explicit = source.match(/(?:program|orderan|paket)\s+[:\-]?\s*(Nagatech[^,).\n]+)/i);
    if (explicit) {
      addOrder(explicit[1], explicit.index);
    }

    if (/member\s+solution/i.test(source) && /barcode/i.test(source)) {
      addOrder('Nagatech Member Solution (Barcode System)', source.search(/member\s+solution/i));
    }
    if (/member\s+solution/i.test(source) && /rfid/i.test(source)) {
      addOrder('Nagatech Member Solution (RFID System)', source.search(/member\s+solution/i));
    }
    if (/nagagold|gold\s+store/i.test(source) && /full\s+version|full\b/i.test(source)) {
      addOrder('Nagatech Gold Store Solution Full Version', source.search(/nagagold|gold\s+store/i));
    }
    if (/nagagold|gold\s+store/i.test(source) && /lite\s+version|lite\b/i.test(source)) {
      addOrder('Nagatech Gold Store Solution Lite Version', source.search(/nagagold|gold\s+store/i));
    }

    return this.parseOrderList(this.formatOrderList(
      orders
        .sort((a, b) => a.index - b.index)
        .map((order) => order.value)
    ));
  }

  extractOrderFromText(text = '') {
    return this.formatOrderList(this.extractOrdersFromText(text));
  }

  isAssistantOrderContext(text = '') {
    const normalized = (text || '').toLowerCase();
    if (!normalized) return false;

    if (/menyediakan|di antaranya|tersedia\s+dalam|selain\s+itu|berikut\s+(?:daftar\s+)?(?:program|solusi)|ingin\s+tahu\s+detail|perbedaan\s+dari/i.test(normalized)) {
      return false;
    }

    return /saya\s+catat|kami\s+catat|berikut\s+data|data\s+yang\s+kami\s+terima|pesanan|orderan|tambahan\s+order|order\s+bapak|program\s+\*\*?nagatech|untuk\s+proses\s+lebih\s+lanjut\s+program/i.test(normalized);
  }

  extractFinalAssistantOrderText(text = '') {
    const lines = (text || '').split(/\r?\n/);
    const kept = [];
    let skippingChoiceList = false;

    for (const line of lines) {
      const cleaned = this.cleanLeadLine(line);
      const normalized = cleaned.toLowerCase();

      if (/ada\s+(dua|beberapa)\s+pilihan|pilihan.*ingin\s+yang\s+mana|ingin\s+yang\s+mana/.test(normalized)) {
        skippingChoiceList = true;
        continue;
      }

      if (skippingChoiceList) {
        if (!cleaned) {
          skippingChoiceList = false;
          continue;
        }

        if (/^nagatech\s+/i.test(cleaned)) {
          continue;
        }

        skippingChoiceList = false;
      }

      kept.push(line);
    }

    return kept.join('\n');
  }

  conversationHasOrderContext(conversationMemory = [], answer = '') {
    return [
      ...conversationMemory
        .filter((message) => message.role === 'assistant')
        .slice(-5)
        .map((message) => message.text || ''),
      answer || ''
    ].some((text) => this.isAssistantOrderContext(text) && this.extractOrderFromText(text) !== '-');
  }

  extractLeadFromNaturalText(text = '') {
    const lead = {};
    const phone = this.extractPhoneFromText(text);
    if (phone !== '-') {
      lead.no_hp = phone;
    }

    const matches = [...(text || '').matchAll(
      /\b(?:saya|nama\s+saya)\s+([^,.\n]+?)\s*,?\s+dari\s+(toko[^,.\n]+?)(?:\s*,?\s+dari\s+|\s+di\s+|,\s*)([^,.\n]+)/ig
    )];
    const nameStoreLocation = matches
      .reverse()
      .find((match) => !this.looksLikeInterestText(match[1]));

    if (nameStoreLocation) {
      lead.nama = this.toTitleCase(this.stripLeadPrefix(nameStoreLocation[1]));
      lead.nama_toko = this.toTitleCase(this.cleanStoreName(nameStoreLocation[2]));
      lead.alamat = this.toTitleCase(this.stripLeadPrefix(nameStoreLocation[3]));
    }

    return lead;
  }

  extractLeadFromBotSummary(text = '') {
    const lead = {};
    const phone = this.extractPhoneFromText(text);
    if (phone !== '-') {
      lead.no_hp = phone;
    }

    const nameMatch = (text || '').match(/\bBapak\/Ibu\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ\s'.-]{1,50})[,.]/i) ||
      (text || '').match(/\bBapak\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ\s'.-]{1,50})[,.]/i) ||
      (text || '').match(/\bIbu\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ\s'.-]{1,50})[,.]/i);
    if (nameMatch) {
      lead.nama = this.toTitleCase(nameMatch[1]);
    }

    const dataMatch = (text || '').match(/Data\s+Bapak(?:\/Ibu)?\s*\(([^)]+)\)/i);
    if (dataMatch) {
      const parts = dataMatch[1]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

      if (parts[0]) {
        lead.nama_toko = this.toTitleCase(this.cleanStoreName(parts[0]));
      }
      if (parts[1]) {
        lead.alamat = this.toTitleCase(parts[1]);
      }
      const programPart = parts.find((part) => /program/i.test(part));
      if (programPart) {
        lead.orderan = this.extractOrderFromText(programPart.replace(/^program\s+/i, ''));
      }
    }

    const orderan = this.isAssistantOrderContext(text)
      ? this.extractOrderFromText(this.extractFinalAssistantOrderText(text))
      : '-';
    if (orderan !== '-' && !lead.orderan) {
      lead.orderan = orderan;
    }

    return lead;
  }

  extractLeadLocally({ phone, question, answer, conversationMemory = [] }) {
    let lead = {
      should_save: false,
      nama: '-',
      nama_toko: '-',
      alamat: '-',
      no_hp: '-',
      orderan: '-',
      intent_type: 'unknown',
      demo_program: '-'
    };

    const customerTexts = [
      ...conversationMemory
        .filter((message) => message.role === 'user')
        .map((message) => message.text || ''),
      question || ''
    ].filter(Boolean);
    const assistantTexts = [
      ...conversationMemory
        .filter((message) => message.role === 'assistant' && this.isAssistantOrderContext(message.text || ''))
        .slice(-3)
        .map((message) => message.text || ''),
      answer || ''
    ].filter(Boolean);

    for (const text of customerTexts) {
      lead = this.mergeLead(lead, this.extractLeadFromCommaText(text));
      lead = this.mergeLead(lead, this.extractLeadFromMultilineText(text));
      lead = this.mergeLead(lead, this.extractLeadFromNaturalText(text));

      const orderan = this.extractOrderFromText(text);
      if (orderan !== '-') {
        lead.orderan = this.mergeOrderLists(lead.orderan, orderan);
      }
    }

    for (const text of assistantTexts) {
      const summaryLead = this.extractLeadFromBotSummary(text);
      lead = this.mergeLead(lead, summaryLead);
      if (this.normalize(summaryLead.orderan) !== '-') {
        lead.orderan = this.mergeOrderLists(summaryLead.orderan, lead.orderan);
      }
    }

    lead.intent_type = this.inferIntentType({ question, answer, conversationMemory });
    if (lead.intent_type === 'demo') {
      lead.demo_program = this.mergeProgramLists(lead.demo_program, lead.orderan);
    }
    lead.should_save = this.hasLeadSignal({ ...lead, should_save: true });
    return lead;
  }

  getLeadCompletenessScore(lead) {
    return ['nama', 'nama_toko', 'alamat', 'no_hp', 'orderan']
      .reduce((score, key) => score + (this.normalize(lead?.[key]) !== '-' ? 1 : 0), 0);
  }

  mergeLeadData(existing, incoming) {
    const merged = {
      nama: this.normalize(incoming.nama !== '-' ? incoming.nama : existing.nama),
      nama_toko: this.normalize(incoming.nama_toko !== '-' ? incoming.nama_toko : existing.nama_toko),
      alamat: this.normalize(incoming.alamat !== '-' ? incoming.alamat : existing.alamat),
      no_hp: this.normalize(incoming.no_hp !== '-' ? incoming.no_hp : existing.no_hp),
      orderan: this.mergeOrderLists(existing.orderan, incoming.orderan),
      intent_type: incoming.intent_type && incoming.intent_type !== 'unknown'
        ? incoming.intent_type
        : (existing.intent_type || 'purchase'),
      demo_program: this.mergeProgramLists(
        existing.demo_program,
        incoming.demo_program,
        incoming.intent_type === 'demo' ? incoming.orderan : '-'
      ),
      should_save: true
    };

    return merged;
  }

  leadChanged(existing, merged) {
    return ['nama', 'nama_toko', 'alamat', 'no_hp', 'orderan', 'intent_type', 'demo_program'].some(
      (key) => this.normalize(existing?.[key]) !== this.normalize(merged?.[key])
    );
  }

  hasLeadSignal(lead) {
    if (!lead || lead.should_save === false) return false;
    const nama = this.normalize(lead.nama);
    const namaToko = this.normalize(lead.nama_toko);
    const alamat = this.normalize(lead.alamat);
    const noHp = this.normalize(lead.no_hp);

    if (noHp === '-') return false;

    if (namaToko !== '-') return true;

    const identityFields = [nama, alamat]
      .filter((value) => value !== '-');
    return identityFields.length >= 2;
  }

  customerMessageHasLeadData(question = '') {
    const text = (question || '').toLowerCase();
    if (!text) return false;

    const commaParts = text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    return (
      /\b(toko|tokomas|toko\s+mas|nama\s+toko|alamat|daerah|lokasi|nomor|no\.?\s*hp|whatsapp|wa)\b/i.test(text) ||
      /\b(saya|nama\s+saya|saya\s+atas\s+nama)\b.{1,80}\b(dari|di)\b/i.test(text) ||
      /\b\d{9,15}\b/.test(text) ||
      (this.extractOrdersFromText(question).length > 0 && this.customerMessageHasStrongInterest(question)) ||
      (commaParts.length >= 2 && commaParts.some((part) => /toko|mas|alamat|daerah|lokasi|\d{9,15}/i.test(part)))
    );
  }

  customerMessageHasStrongInterest(question = '') {
    return this.looksLikeInterestText(question);
  }

  conversationHasInterestSignal(conversationMemory = []) {
    return conversationMemory.some((message) => {
      const text = message.text || '';
      if (message.role === 'user') {
        return this.customerMessageHasStrongInterest(text);
      }

      return /terima kasih atas ketertarikan|minta demo|proses lebih lanjut|lanjut\s+proses|penawaran\s+resmi|quotation|invoice|demo|program.*diminati/i
        .test(text);
    });
  }

  conversationHasPhone(conversationMemory = [], answer = '') {
    return [
      ...conversationMemory.map((message) => message.text || ''),
      answer || ''
    ].some((text) => this.extractPhoneFromText(text) !== '-');
  }

  botRecentlyAskedForLeadData(conversationMemory = []) {
    return conversationMemory
      .filter((message) => message.role === 'assistant')
      .slice(-4)
      .some((message) => {
        const text = (message.text || '').toLowerCase();
        return (
          /nama.*nama\s+toko|nama\s+toko.*alamat|nomor\s+hp|no\.?\s*hp|data\s+singkat|data\s+(bapak|ibu|customer|anda)|bisa\s+kami\s+minta/i.test(text) &&
          /toko|alamat|daerah|lokasi|nomor|hp|whatsapp|wa/i.test(text)
        ) || (
          /bolehkah|mohon|tolong|bisa/i.test(text) &&
          /nama/i.test(text) &&
          /toko/i.test(text) &&
          /daerah|alamat|lokasi/i.test(text)
        ) || (
          /nomor\s+hp|no\.?\s*hp|nomor\s+whatsapp|nomor\s+wa|hp\s+yang\s+aktif/i.test(text) &&
          /minta|berikan|kirim|bisa|boleh/i.test(text)
        );
      });
  }

  shouldAttemptCapture({ question, answer, conversationMemory = [] }) {
    const customerHasData = this.customerMessageHasLeadData(question);
    const customerConfirmsOrder = this.isFinalConfirmationText(question) &&
      this.conversationHasOrderContext(conversationMemory, answer);

    if (!customerHasData && !customerConfirmsOrder) {
      return false;
    }

    const customerHasPhone = this.extractPhoneFromText(question) !== '-' || this.conversationHasPhone(conversationMemory, answer);
    if (!customerHasPhone) {
      return false;
    }

    const botAskedData = this.botRecentlyAskedForLeadData(conversationMemory);
    const conversationInterested = this.conversationHasInterestSignal(conversationMemory);
    const customerDirectLead = this.customerMessageHasStrongInterest(question);

    return (
      (botAskedData && conversationInterested) ||
      customerDirectLead ||
      (customerConfirmsOrder && conversationInterested)
    );
  }

  normalizeSalesId(salesId) {
    return salesId ? String(salesId) : null;
  }

  async extractLead({ phone, question, answer, conversationMemory = [] }) {
    const fallbackPhone = this.normalizePhone(phone);
    const localLead = this.extractLeadLocally({ phone, question, answer, conversationMemory });
    const localHasCompleteLead =
      this.hasLeadSignal(localLead) &&
      localLead.no_hp !== '-' &&
      (localLead.nama_toko !== '-' || (localLead.nama !== '-' && localLead.alamat !== '-'));

    if (localHasCompleteLead) {
      return localLead;
    }

    const messages = [
      {
        role: 'system',
        content: [
          'Anda adalah extractor data lead marketing dari percakapan WhatsApp.',
          'Ekstrak hanya data yang disebutkan atau sangat jelas dari percakapan.',
          'Field nama adalah nama owner/pemilik/customer, bukan nama toko.',
          'Field nama_toko adalah nama toko saja. Jangan sertakan kata penghubung seperti "dari".',
          'Jika nama owner, nama toko, alamat, atau orderan tidak tersedia, isi dengan "-".',
          'Jika nomor HP tidak disebutkan di percakapan, isi no_hp dengan "-". Jangan memakai nomor WhatsApp customer sebagai fallback.',
          'Orderan berisi produk/paket yang diminati untuk pembelian. Jika customer baru tanya-tanya dan tidak ada produk spesifik, isi "-".',
          'intent_type wajib "demo" jika customer minta demo/jadwal demo/presentasi/trial. Gunakan "purchase" jika customer mau beli/order/pasang. Gunakan "unknown" jika belum jelas.',
          'demo_program berisi semua program yang ingin didemokan jika intent_type demo; jika ada lebih dari satu program, tulis sebagai list bernomor satu item per baris. Jika bukan demo isi "-".',
          'Jika intent_type demo, program demo boleh diambil dari pesan customer terbaru, riwayat customer, atau konfirmasi bot terbaru yang jelas mencatat program demo.',
          'Jika customer menambah program demo baru, gabungkan dengan program demo sebelumnya dan jangan menimpa yang lama.',
          'Set should_save true hanya jika sebelumnya customer sudah menunjukkan minat beli/demo/order atau bot sudah meminta data setelah ada minat, lalu pesan customer terbaru berisi data lead seperti nama owner, nama toko, alamat/daerah, atau nomor HP.',
          'Jika customer hanya berkata tertarik/minat/mau beli tanpa menyebut nama/toko/alamat/nomor HP, set should_save false.',
          'Jika customer hanya memberi data setelah sapaan awal tanpa minat beli/demo/order, set should_save false.',
          'Jawaban bot terbaru hanya konteks. Jangan menyimpan hanya karena bot meminta data.',
          'Set should_save false jika hanya sapaan, perkenalan awal, atau tanya umum tanpa minat beli/follow-up yang jelas.',
          'Balas hanya JSON valid tanpa markdown.',
          'Format: {"should_save":true,"intent_type":"purchase","nama":"...","nama_toko":"...","alamat":"...","no_hp":"...","orderan":"...","demo_program":"..."}'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `Nomor WhatsApp customer: ${fallbackPhone}`,
          `Riwayat percakapan:\n${this.formatConversation(conversationMemory) || '-'}`,
          `Pesan customer terbaru:\n${question || '-'}`,
          `Jawaban bot terbaru:\n${answer || '-'}`
        ].join('\n\n')
      }
    ];

    let parsed = null;
    try {
      const text = await lmStudioService.createChatCompletion(messages, {
        temperature: 0,
        maxTokens: 500,
        continuationMaxRounds: 0
      });
      parsed = this.parseJson(text);
    } catch (error) {
      logger.warn(`Lead extractor model failed, using local fallback when possible: ${error.message}`);
    }

    if (!parsed) {
      if (this.hasLeadSignal(localLead)) {
      return {
        ...localLead,
          no_hp: this.normalize(localLead.no_hp)
      };
      }
      throw new Error('Lead extractor returned invalid JSON');
    }

    return {
      should_save: Boolean(parsed.should_save),
      intent_type: ['purchase', 'demo', 'unknown'].includes(parsed.intent_type) ? parsed.intent_type : 'unknown',
      nama: this.normalize(parsed.nama),
      nama_toko: this.normalize(parsed.nama_toko),
      alamat: this.normalize(parsed.alamat),
      no_hp: this.normalize(parsed.no_hp),
      orderan: this.normalize(parsed.orderan),
      demo_program: this.normalize(parsed.demo_program)
    };
  }

  async findRecentDuplicate(phone, lead, salesId = null) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const normalizedSalesId = this.normalizeSalesId(salesId);
    const nama = this.normalizeComparable(lead.nama);
    const namaToko = this.normalizeComparable(lead.nama_toko);
    const alamat = this.normalizeComparable(lead.alamat);
    const noHp = this.normalizeComparable(lead.no_hp);
    const intentType = lead.intent_type === 'demo' ? 'demo' : 'purchase';

    if (nama === '-' && namaToko === '-' && alamat === '-' && noHp === '-') {
      return null;
    }

    const candidates = await LeadCapture.find({
      ...(normalizedSalesId ? { sales_id: normalizedSalesId } : {}),
      ...(intentType === 'demo' ? { intent_type: 'demo' } : { intent_type: { $ne: 'demo' } }),
      phone,
      createdAt: { $gte: since }
    }).sort({ createdAt: -1 }).limit(20);

    return candidates.find((record) => {
      const recordNama = this.normalizeComparable(record.nama);
      const recordNamaToko = this.normalizeComparable(record.nama_toko);
      const recordAlamat = this.normalizeComparable(record.alamat);
      const recordNoHp = this.normalizeComparable(record.no_hp);
      const sameStore = namaToko !== '-' && recordNamaToko === namaToko;
      const sameOwner = nama !== '-' && recordNama === nama;
      const sameLocation = alamat !== '-' && recordAlamat === alamat;
      const samePhone = noHp !== '-' && recordNoHp === noHp;
      const hasIncomingIdentity = nama !== '-' || namaToko !== '-' || alamat !== '-';
      const recordHasDifferentOwner = nama !== '-' && recordNama !== '-' && recordNama !== nama;
      const recordHasDifferentStore = namaToko !== '-' && recordNamaToko !== '-' && recordNamaToko !== namaToko;
      const recordHasDifferentLocation = alamat !== '-' && recordAlamat !== '-' && recordAlamat !== alamat;

      if (recordHasDifferentOwner || recordHasDifferentStore) {
        return false;
      }

      if (sameStore) {
        return true;
      }

      if (sameOwner && (sameLocation || samePhone)) {
        return true;
      }

      if (samePhone && hasIncomingIdentity && !recordHasDifferentLocation && (sameOwner || sameStore)) {
        return true;
      }

      return samePhone && !hasIncomingIdentity;
    }) || null;
  }

  async upsertExistingLead(existing, lead, aiTraceRunId = null, salesId = null) {
    const merged = this.mergeLeadData(existing, lead);
    const changed = this.leadChanged(existing, merged);

    if (!changed) {
      await aiTraceService.addEvent(aiTraceRunId, 'LEAD_CAPTURE_SKIPPED', {
        reason: 'Lead serupa sudah pernah dikirim dan tidak ada data/orderan baru.',
        duplicate_id: existing._id
      });
      return existing;
    }

    existing.nama = merged.nama;
    existing.nama_toko = merged.nama_toko;
    existing.alamat = merged.alamat;
    existing.no_hp = merged.no_hp;
    existing.orderan = merged.intent_type === 'demo'
      ? this.normalize(merged.demo_program)
      : merged.orderan;
    existing.intent_type = merged.intent_type;
    existing.demo_program = merged.intent_type === 'demo'
      ? this.normalize(merged.demo_program)
      : this.normalize(existing.demo_program);
    if (!existing.sales_id && salesId) {
      existing.sales_id = this.normalizeSalesId(salesId);
    }
    existing.raw_payload = {
      ...(existing.raw_payload || {}),
      merged_from: lead,
      merged_at: new Date().toISOString()
    };
    existing.sheet_status = 'pending';
    existing.sheet_error = null;

    if (existing.intent_type === 'demo' || !this.shouldSyncGoogleSheets()) {
      existing.sheet_status = 'skipped';
      existing.sheet_error = null;
      await existing.save();
      await aiTraceService.addEvent(aiTraceRunId, 'LEAD_CAPTURE_UPDATED_IN_WEB', {
        duplicate_id: existing._id,
        nama: existing.nama,
        nama_toko: existing.nama_toko,
        alamat: existing.alamat,
        no_hp: existing.no_hp,
        orderan: existing.orderan,
        intent_type: existing.intent_type,
        demo_program: existing.demo_program
      });
      return existing;
    }

    try {
      await this.appendToSheet(existing, { mode: 'upsert' });
      existing.sheet_status = 'sent';
      existing.sent_at = new Date();
      await existing.save();
      await aiTraceService.addEvent(aiTraceRunId, 'LEAD_CAPTURE_UPDATED_IN_SHEET', {
        duplicate_id: existing._id,
        nama: existing.nama,
        nama_toko: existing.nama_toko,
        alamat: existing.alamat,
        no_hp: existing.no_hp,
        orderan: existing.orderan,
        intent_type: existing.intent_type,
        demo_program: existing.demo_program
      });
    } catch (error) {
      existing.sheet_status = 'failed';
      existing.sheet_error = error.message;
      await existing.save();
      await aiTraceService.addEvent(aiTraceRunId, 'LEAD_CAPTURE_SHEET_FAILED', {
        duplicate_id: existing._id,
        error: error.message
      });
    }

    return existing;
  }

  async appendToSheet(lead, options = {}) {
    if (!this.webhookUrl) {
      throw new Error('GOOGLE_SHEETS_WEBHOOK_URL belum diisi');
    }

    const maxAttempts = this.getSheetRetryCount() + 1;
    const timeoutMs = this.getSheetTimeoutMs();
    const dispatcher = UndiciAgent
      ? new UndiciAgent({
          connect: { timeout: timeoutMs },
          headersTimeout: timeoutMs,
          bodyTimeout: timeoutMs
        })
      : undefined;

    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: this.webhookSecret,
            mode: options.mode || 'upsert',
            key: {
              no_hp: lead.no_hp,
              nama_toko: lead.nama_toko
            },
            lead: {
              nama: lead.nama,
              nama_toko: lead.nama_toko,
              alamat: lead.alamat,
              no_hp: lead.no_hp,
              orderan: lead.orderan
            }
          }),
          signal: controller.signal,
          dispatcher
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.success === false) {
          throw new Error(data?.message || `Google Sheets webhook failed with status ${response.status}`);
        }
        return data;
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts) {
          break;
        }
        logger.warn(`Google Sheets webhook attempt ${attempt} failed: ${error.message}`);
        await this.sleep(1000 * attempt);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error(`Google Sheets webhook fetch failed: ${lastError?.message || 'unknown error'}`);
  }

  async captureFromConversation({
    phone,
    ownerUserId = null,
    sourceMessageId,
    waMessageId = null,
    aiTraceRunId = null,
    question,
    answer,
    conversationMemory = []
  }) {
    if (!this.isEnabled()) {
      return null;
    }

    const salesId = this.normalizeSalesId(ownerUserId);
    const existing = sourceMessageId
      ? await LeadCapture.findOne({ source_message_id: sourceMessageId })
      : null;
    if (existing) {
      if (!existing.sales_id && salesId) {
        existing.sales_id = salesId;
        await existing.save();
      }
      return existing;
    }

    if (!this.shouldAttemptCapture({ question, answer, conversationMemory })) {
      return null;
    }

    await aiTraceService.addEvent(aiTraceRunId, 'LEAD_CAPTURE_STARTED', {
      source_message_id: sourceMessageId,
      wa_message_id: waMessageId
    });

    try {
      const lead = await this.extractLead({ phone, question, answer, conversationMemory });
      const inferredIntentType = this.inferIntentType({ question, answer, conversationMemory });
      lead.intent_type = lead.intent_type && lead.intent_type !== 'unknown'
        ? lead.intent_type
        : inferredIntentType;
      if (lead.intent_type === 'demo' && this.normalize(lead.demo_program) === '-') {
        lead.demo_program = this.normalize(lead.orderan);
      }
      await aiTraceService.addEvent(aiTraceRunId, 'LEAD_CAPTURE_EXTRACTED', lead);

      if (!this.hasLeadSignal(lead)) {
        const skipped = await LeadCapture.create({
          phone,
          sales_id: salesId,
          source_message_id: sourceMessageId,
          wa_message_id: waMessageId,
          ai_trace_run_id: aiTraceRunId,
          raw_payload: lead,
          sheet_status: 'skipped'
        });
        await aiTraceService.addEvent(aiTraceRunId, 'LEAD_CAPTURE_SKIPPED', {
          reason: 'Tidak ada sinyal lead/order yang cukup.'
      });
      return skipped;
    }

      const duplicate = await this.findRecentDuplicate(phone, lead, salesId);
      if (duplicate) {
        return this.upsertExistingLead(duplicate, lead, aiTraceRunId, salesId);
      }

      const record = await LeadCapture.create({
        phone,
        sales_id: salesId,
        source_message_id: sourceMessageId,
        wa_message_id: waMessageId,
        ai_trace_run_id: aiTraceRunId,
        nama: lead.nama,
        nama_toko: lead.nama_toko,
        alamat: lead.alamat,
        no_hp: lead.no_hp,
        orderan: lead.intent_type === 'demo'
          ? this.normalize(lead.demo_program || lead.orderan)
          : lead.orderan,
        intent_type: lead.intent_type === 'demo' ? 'demo' : 'purchase',
        demo_program: lead.intent_type === 'demo' ? this.normalize(lead.demo_program || lead.orderan) : '-',
        raw_payload: lead,
        sheet_status: 'pending'
      });

      if (record.intent_type === 'demo' || !this.shouldSyncGoogleSheets()) {
        record.sheet_status = 'skipped';
        record.sheet_error = null;
        await record.save();
        await aiTraceService.addEvent(aiTraceRunId, 'LEAD_CAPTURE_SAVED_TO_WEB', {
          nama: record.nama,
          nama_toko: record.nama_toko,
          alamat: record.alamat,
          no_hp: record.no_hp,
          orderan: record.orderan,
          intent_type: record.intent_type,
          demo_program: record.demo_program
        });
        return record;
      }

      try {
        await this.appendToSheet(record);
        record.sheet_status = 'sent';
        record.sheet_error = null;
        record.sent_at = new Date();
        await record.save();
        await aiTraceService.addEvent(aiTraceRunId, 'LEAD_CAPTURE_SENT_TO_SHEET', {
          nama: record.nama,
          nama_toko: record.nama_toko,
          alamat: record.alamat,
          no_hp: record.no_hp,
          orderan: record.orderan,
          intent_type: record.intent_type,
          demo_program: record.demo_program
        });
      } catch (error) {
        record.sheet_status = 'failed';
        record.sheet_error = error.message;
        await record.save();
        await aiTraceService.addEvent(aiTraceRunId, 'LEAD_CAPTURE_SHEET_FAILED', {
          error: error.message
        });
      }

      return record;
    } catch (error) {
      logger.warn(`Lead capture failed: ${error.message}`);
      await aiTraceService.addEvent(aiTraceRunId, 'LEAD_CAPTURE_FAILED', {
        error: error.message
      });
      return null;
    }
  }
}

module.exports = new LeadCaptureService();
