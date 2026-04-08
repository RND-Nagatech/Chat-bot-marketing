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
}

export interface User {
  id: string;
  email: string;
  token: string;
}
