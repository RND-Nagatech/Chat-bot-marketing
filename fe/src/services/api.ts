import axios from "axios";
import type { Rule, Message, WAStatus, DashboardStats, ConversationSummary, ChatMessage } from "@/types";

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

// Auth
export const login = async (email: string, password: string) => {
  const { data } = await api.post("/auth/login", { email, password });
  return { id: data.user.id, email: data.user.email, token: data.token };
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

// Messages
export const getMessages = async (): Promise<Message[]> => {
  const { data } = await api.get("/messages");
  return data.data.map(mapMessage);
};

export const getConversations = async (): Promise<ConversationSummary[]> => {
  const { data } = await api.get("/messages/conversations");
  return data.data.map(mapConversation);
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

export const resolvePendingMessage = async (phone: string, message_id: string): Promise<void> => {
  await api.post("/messages/resolve-pending", { phone, message_id });
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
