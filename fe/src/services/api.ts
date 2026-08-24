import axios from "axios";
import type { Rule, Message, WAStatus, DashboardStats, ConversationSummary, ChatMessage, KnowledgeDocument, KnowledgeStatus, AiTraceRun, CustomerOrder, CustomerOrderMeta, DemoRequest, DemoRequestMeta, PaginationMeta } from "@/types";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("wa_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Mappers untuk menyesuaikan format response backend dengan tipe frontend
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRule = (r: any): Rule => ({
  id: r._id || r.id,
  keyword: r.keyword,
  match_type: r.match_type,
  response: r.response,
  is_active: r.is_active,
  created_at: r.createdAt || r.created_at,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapMessage = (m: any): Message => ({
  id: m._id || m.id,
  phone: m.phone,
  incoming: m.message_in,
  reply: m.message_out || null,
  timestamp: m.createdAt || m.timestamp,
  status: m.status,
  rule_id: m.matched_rule ?? undefined,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapConversation = (c: any): ConversationSummary => ({
  phone: c.phone,
  last_message: c.last_message || "",
  last_message_at: c.last_message_at,
  last_direction: c.last_direction,
  unresolved_count: Number(c.unresolved_count || 0),
  last_status: c.last_status || "handled_by_bot",
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapChatMessage = (m: any): ChatMessage => ({
  id: m._id || m.id,
  source_message_id: m.source_message_id || m._id || m.id,
  phone: m.phone,
  text: (m.text || m.message_out || m.message_in || "").toString(),
  direction:
    m.direction ||
    (m.sender_type === "customer" ? "inbound" : "outbound") ||
    (m.message_out ? "outbound" : "inbound"),
  sender_type:
    m.sender_type ||
    (m.direction === "inbound" ? "customer" : "bot") ||
    (m.message_out ? "bot" : "customer"),
  delivery_status: m.delivery_status ?? null,
  status: m.status || "handled_by_bot",
  follow_up_state: m.follow_up_state ?? null,
  follow_up_category: m.follow_up_category ?? null,
  follow_up_reason: m.follow_up_reason ?? null,
  follow_up_summary: m.follow_up_summary ?? null,
  ai_trace_run_id: m.ai_trace_run_id ?? null,
  reply_to_message_id: m.reply_to_message_id ?? null,
  reply_to_wa_message_id: m.reply_to_wa_message_id ?? null,
  wa_message_id: m.wa_message_id ?? null,
  can_delete_for_everyone: Boolean(m.can_delete_for_everyone),
  can_edit: Boolean(m.can_edit),
  is_edited: Boolean(m.is_edited),
  edited_at: m.edited_at || null,
  is_revoked: Boolean(m.is_revoked),
  revoked_at: m.revoked_at || null,
  timestamp: m.timestamp || m.createdAt,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapCustomerOrder = (c: any): CustomerOrder => ({
  id: c._id || c.id,
  sales_id: c.sales_id || null,
  sales_name: c.sales_name || c.nama_sales || null,
  phone: c.phone,
  nama: c.nama || "-",
  nama_toko: c.nama_toko || "-",
  alamat: c.alamat || "-",
  no_hp: c.no_hp || "-",
  orderan: c.orderan || "-",
  source_message_id: c.source_message_id || null,
  wa_message_id: c.wa_message_id || null,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapDemoRequest = (c: any): DemoRequest => ({
  id: c._id || c.id,
  sales_id: c.sales_id || null,
  sales_name: c.sales_name || c.nama_sales || null,
  phone: c.phone,
  nama: c.nama || "-",
  nama_toko: c.nama_toko || "-",
  alamat: c.alamat || "-",
  no_hp: c.no_hp || "-",
  demo_program: c.demo_program || "-",
  source_message_id: c.source_message_id || null,
  wa_message_id: c.wa_message_id || null,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

// Auth
export const login = async (email: string, password: string) => {
  const { data } = await api.post("/auth/login", { email, password });
  return {
    id: data.user.kode_sales || data.user.id,
    email: data.user.email,
    nama_sales: data.user.nama_sales,
    kode_sales: data.user.kode_sales || data.user.id,
    token: data.token,
  };
};

// Rules
export const getRules = async (): Promise<Rule[]> => {
  const { data } = await api.get("/rules");
  return data.data.map(mapRule);
};

export const createRule = async (rule: Omit<Rule, "id" | "created_at">): Promise<Rule> => {
  const { data } = await api.post("/rules", rule);
  return mapRule(data.data);
};

export const updateRule = async (id: string, rule: Partial<Rule>): Promise<Rule> => {
  const { data } = await api.put(`/rules/${id}`, rule);
  return mapRule(data.data);
};

export const deleteRule = async (id: string): Promise<void> => {
  await api.delete(`/rules/${id}`);
};

// Knowledge
export const getKnowledgeStatus = async (): Promise<KnowledgeStatus> => {
  const { data } = await api.get("/knowledge/status");
  return data.data;
};

export const getKnowledgeDocuments = async (): Promise<KnowledgeDocument[]> => {
  const { data } = await api.get("/knowledge/documents");
  return data.data;
};

export const uploadKnowledgeDocument = async (file: File): Promise<KnowledgeDocument> => {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/knowledge/documents", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.data;
};

export const createTextKnowledgeDocument = async (title: string, text: string): Promise<KnowledgeDocument> => {
  const { data } = await api.post("/knowledge/documents/text", { title, text });
  return data.data;
};

export const updateKnowledgeDocument = async (id: string, title: string, text: string): Promise<KnowledgeDocument> => {
  const { data } = await api.put(`/knowledge/documents/${id}`, { title, text });
  return data.data;
};

export const reindexKnowledgeDocument = async (id: string): Promise<KnowledgeDocument> => {
  const { data } = await api.post(`/knowledge/documents/${id}/reindex`);
  return data.data;
};

export const activateKnowledgeDocument = async (id: string): Promise<KnowledgeDocument> => {
  const { data } = await api.post(`/knowledge/documents/${id}/activate`);
  return data.data;
};

export const deleteKnowledgeDocument = async (id: string): Promise<KnowledgeDocument> => {
  const { data } = await api.delete(`/knowledge/documents/${id}`);
  return data.data;
};

// Messages
export const getMessages = async (): Promise<Message[]> => {
  const { data } = await api.get("/messages");
  return data.data.map(mapMessage);
};

export const getConversations = async (
  params: { search?: string; page?: number; limit?: number } = {}
): Promise<{ data: ConversationSummary[]; meta: PaginationMeta }> => {
  const { data } = await api.get("/messages/conversations", { params });
  const rows = data.data.map(mapConversation);
  return {
    data: rows,
    meta: data.meta || {
      page: params.page || 1,
      limit: params.limit || rows.length || 10,
      total: rows.length,
      totalPages: 1,
    },
  };
};

export const getConversationMessages = async (phone: string): Promise<ChatMessage[]> => {
  const { data } = await api.get(`/messages/conversations/${encodeURIComponent(phone)}`);
  return data.data.map(mapChatMessage);
};

export const sendManualReply = async (
  phone: string,
  text: string,
  reply_to_message_id?: string | null
): Promise<ChatMessage> => {
  const { data } = await api.post("/messages/reply", { phone, text, reply_to_message_id });
  return mapChatMessage(data.data);
};

export const sendManualImageReply = async (
  phone: string,
  image: File,
  caption?: string,
  reply_to_message_id?: string | null
): Promise<ChatMessage> => {
  const form = new FormData();
  form.append("phone", phone);
  form.append("image", image);
  if (caption) form.append("caption", caption);
  if (reply_to_message_id) form.append("reply_to_message_id", reply_to_message_id);

  const { data } = await api.post("/messages/reply-image", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return mapChatMessage(data.data);
};

export const resolvePendingMessage = async (phone: string, message_id: string): Promise<void> => {
  await api.post("/messages/resolve-pending", { phone, message_id });
};

export const resolvePendingMessages = async (phone: string, message_ids: string[] = []): Promise<void> => {
  await api.post("/messages/resolve-pending/bulk", { phone, message_ids });
};

export const deleteMessageForMe = async (phone: string, message_id: string): Promise<void> => {
  await api.post("/messages/delete-for-me", { phone, message_id });
};

export const deleteMessageForAll = async (phone: string, message_id: string): Promise<void> => {
  await api.post("/messages/delete-for-all", { phone, message_id });
};

export const editMessage = async (phone: string, message_id: string, text: string): Promise<ChatMessage> => {
  const { data } = await api.post("/messages/edit", { phone, message_id, text });
  return mapChatMessage(data.data);
};

// AI Trace
export const getAiTraceRuns = async (limit = 50): Promise<AiTraceRun[]> => {
  const { data } = await api.get("/ai/runs", { params: { limit } });
  return data.data;
};

export const getAiTraceRun = async (runId: string): Promise<AiTraceRun> => {
  const { data } = await api.get(`/ai/runs/${encodeURIComponent(runId)}`);
  return data.data;
};

// Customers
export const getCustomerOrders = async (
  params: { search?: string; page?: number; limit?: number } = {}
): Promise<{ data: CustomerOrder[]; meta: CustomerOrderMeta }> => {
  const { data } = await api.get("/customers", { params });
  return {
    data: data.data.map(mapCustomerOrder),
    meta: data.meta,
  };
};

export const updateCustomerOrder = async (
  id: string,
  payload: Partial<Pick<CustomerOrder, "nama" | "nama_toko" | "alamat" | "no_hp" | "orderan">>
): Promise<CustomerOrder> => {
  const { data } = await api.put(`/customers/${id}`, payload);
  return mapCustomerOrder(data.data);
};

export const deleteCustomerOrder = async (id: string): Promise<void> => {
  await api.delete(`/customers/${id}`);
};

// Demo Requests
export const getDemoRequests = async (
  params: { search?: string; page?: number; limit?: number } = {}
): Promise<{ data: DemoRequest[]; meta: DemoRequestMeta }> => {
  const { data } = await api.get("/demo-requests", { params });
  return {
    data: data.data.map(mapDemoRequest),
    meta: data.meta,
  };
};

export const updateDemoRequest = async (
  id: string,
  payload: Partial<Pick<DemoRequest, "nama" | "nama_toko" | "alamat" | "no_hp" | "demo_program">>
): Promise<DemoRequest> => {
  const { data } = await api.put(`/demo-requests/${id}`, payload);
  return mapDemoRequest(data.data);
};

export const deleteDemoRequest = async (id: string): Promise<void> => {
  await api.delete(`/demo-requests/${id}`);
};

// WhatsApp
export const getWAStatus = async (): Promise<WAStatus> => {
  const { data } = await api.get("/wa/status");
  return {
    status: data.data.status,
    phone: data.data.phone_number || undefined,
    qr_available: Boolean(data.data.qr_available),
    last_error: data.data.last_error || undefined,
  };
};

export const getWAQR = async (): Promise<string> => {
  const { data } = await api.get("/wa/qr");
  return data.data.qr_code;
};

export const connectWA = async (): Promise<void> => {
  await api.post("/wa/connect");
};

export const reconnectWA = async (): Promise<void> => {
  await api.post("/wa/reconnect");
};

export const refreshWAQR = async (): Promise<void> => {
  await api.post("/wa/qr/refresh");
};

export const disconnectWA = async (): Promise<void> => {
  await api.post("/wa/disconnect");
};

// Dashboard
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const { data } = await api.get("/dashboard/stats");
  return data.data;
};
