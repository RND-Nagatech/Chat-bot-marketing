export interface Rule {
  id: string;
  keyword: string;
  match_type: "contains" | "exact";
  response: string;
  is_active: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  phone: string;
  incoming: string;
  reply: string | null;
  timestamp: string;
  status: "handled_by_bot" | "needs_admin_follow_up";
  rule_id?: string;
}

export interface ConversationSummary {
  phone: string;
  last_message: string;
  last_message_at: string;
  last_direction: "inbound" | "outbound";
  unresolved_count: number;
  last_status: "handled_by_bot" | "needs_admin_follow_up";
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ChatMessage {
  id: string;
  source_message_id?: string;
  phone: string;
  text: string;
  direction: "inbound" | "outbound";
  sender_type: "customer" | "bot" | "admin";
  delivery_status: "sent" | "failed" | null;
  status: "handled_by_bot" | "needs_admin_follow_up";
  follow_up_state?: "open" | "resolved" | null;
  follow_up_category?: string | null;
  follow_up_reason?: string | null;
  follow_up_summary?: string | null;
  ai_trace_run_id?: string | null;
  reply_to_message_id?: string | null;
  reply_to_wa_message_id?: string | null;
  wa_message_id?: string | null;
  can_delete_for_everyone?: boolean;
  can_edit?: boolean;
  is_edited?: boolean;
  edited_at?: string | null;
  is_revoked?: boolean;
  revoked_at?: string | null;
  timestamp: string;
}

export interface WAStatus {
  status: "disconnected" | "connecting" | "qr_ready" | "authorizing" | "connected";
  phone?: string;
  qr_available: boolean;
  last_error?: string;
}

export interface DashboardStats {
  totalMessages: number;
  totalAutoReplies: number;
  totalRules: number;
  activeRules: number;
  totalKnowledge?: number;
  indexedKnowledge?: number;
}

export interface KnowledgeDocument {
  _id: string;
  title: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  extracted_text?: string;
  status: "processing" | "indexed" | "failed";
  status_active: boolean;
  chunk_count: number;
  error_message?: string | null;
  indexed_at?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeStatus {
  rag_enabled: boolean;
  llm?: {
    connected: boolean;
    chat_provider?: string;
    chat_connected?: boolean;
    chat_base_url?: string;
    chat_model: string;
    embedding_provider?: string;
    embedding_connected?: boolean;
    embedding_base_url?: string;
    embedding_model: string;
    base_url: string;
    error?: string;
    chat_error?: string;
    embedding_error?: string;
  };
  lm_studio: {
    connected: boolean;
    chat_provider?: string;
    chat_connected?: boolean;
    chat_base_url?: string;
    base_url: string;
    chat_model: string;
    embedding_provider?: string;
    embedding_connected?: boolean;
    embedding_base_url?: string;
    embedding_model: string;
    error?: string;
  };
  vector_store?: {
    provider: "mongo" | "qdrant";
    connected: boolean;
    collection?: string | null;
    base_url?: string | null;
    vector_size?: number;
    distance?: string;
    error?: string;
  };
}

export interface AiTraceEvent {
  sequence: number;
  type: string;
  data: unknown;
  timestamp: string;
}

export interface AiTraceRun {
  _id?: string;
  run_id: string;
  phone?: string | null;
  message_id?: string | null;
  wa_message_id?: string | null;
  user_message: string;
  answer?: string | null;
  source?: string | null;
  confidence?: number;
  follow_up?: {
    needed: boolean;
    category?: string | null;
    reason?: string | null;
    summary?: string | null;
  };
  status: "running" | "completed" | "failed";
  error?: string | null;
  events?: AiTraceEvent[];
  started_at: string;
  completed_at?: string | null;
}

export interface CustomerOrder {
  id: string;
  sales_id?: string | null;
  sales_name?: string | null;
  phone: string;
  nama: string;
  nama_toko: string;
  alamat: string;
  no_hp: string;
  orderan: string;
  source_message_id?: string | null;
  wa_message_id?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerOrderMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  totalCustomers: number;
  totalOrders: number;
}

export interface DemoRequest {
  id: string;
  sales_id?: string | null;
  sales_name?: string | null;
  phone: string;
  nama: string;
  nama_toko: string;
  alamat: string;
  no_hp: string;
  demo_program: string;
  source_message_id?: string | null;
  wa_message_id?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DemoRequestMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  totalDemoRequests: number;
}

export interface User {
  id: string;
  email: string;
  nama_sales?: string;
  kode_sales?: string;
  token: string;
}
