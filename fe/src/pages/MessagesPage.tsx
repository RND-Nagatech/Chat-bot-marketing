import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronsDown, Image, Search, Send, X } from "lucide-react";
import {
  editMessage,
  deleteMessageForAll,
  deleteMessageForMe,
  getConversationMessages,
  getConversations,
  getWAStatus,
  resolvePendingMessage,
  resolvePendingMessages,
  sendManualImageReply,
  sendManualReply,
} from "@/services/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pagination } from "@/components/Pagination";
import { toast } from "sonner";
import type { ChatMessage, ConversationSummary, PaginationMeta, WAStatus } from "@/types";

function formatLocalPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("62")) return `0${digits.slice(2)}`;
  return phone;
}

function formatChatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function MessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const emptyConversationMeta: PaginationMeta = {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  };
  const AUTO_REFRESH_OPTIONS = [
    { label: "Off", value: 0 },
    { label: "5 detik", value: 5000 },
    { label: "10 detik", value: 10000 },
    { label: "30 detik", value: 30000 },
    { label: "1 menit", value: 60000 },
    { label: "2 menit", value: 120000 }
  ];
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationMeta, setConversationMeta] = useState<PaginationMeta>(emptyConversationMeta);
  const [waStatus, setWaStatus] = useState<WAStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [editTarget, setEditTarget] = useState<ChatMessage | null>(null);
  const [swapToFollowUpView, setSwapToFollowUpView] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [messageActionLoadingId, setMessageActionLoadingId] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [openActionMessageId, setOpenActionMessageId] = useState<string | null>(null);
  const [actionRehoverLockMessageId, setActionRehoverLockMessageId] = useState<string | null>(null);
  const [isThreadNearBottom, setIsThreadNearBottom] = useState(true);
  const [showScrollDownButton, setShowScrollDownButton] = useState(false);
  const [newIncomingCount, setNewIncomingCount] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [pendingSelectionMode, setPendingSelectionMode] = useState(false);
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(new Set());
  const [bulkResolving, setBulkResolving] = useState(false);
  const [autoRefreshMs, setAutoRefreshMs] = useState<number>(() => {
    const raw = localStorage.getItem("history_auto_refresh_ms");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 10000;
  });
  const threadContainerRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const isThreadNearBottomRef = useRef(true);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const hasFocusedPendingRef = useRef(false);
  const openedFromQueryPhoneRef = useRef<string | null>(null);

  const loadConversations = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const { data, meta } = await getConversations({ search, page, limit: rowsPerPage });
      setConversations(data);
      setConversationMeta(meta);
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [page, rowsPerPage, search]);

  const loadWAStatus = useCallback(async () => {
    const status = await getWAStatus();
    setWaStatus(status);
  }, []);

  const loadConversationDetail = useCallback(async (phone: string, options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setThreadLoading(true);
    }
    try {
      const data = await getConversationMessages(phone);
      setThreadMessages(data);
    } finally {
      if (!options?.silent) {
        setThreadLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      Promise.all([loadConversations(), loadWAStatus()])
      .catch(() => {
        toast.error("Gagal memuat data riwayat chat");
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [loadConversations, loadWAStatus]);

  useEffect(() => {
    if (!autoRefreshMs || autoRefreshMs <= 0) {
      return;
    }

    const pollId = window.setInterval(() => {
      void loadConversations({ silent: true });
      void loadWAStatus();
      if (modalOpen && activePhone) {
        void loadConversationDetail(activePhone, { silent: true });
      }
    }, autoRefreshMs);

    return () => window.clearInterval(pollId);
  }, [activePhone, autoRefreshMs, loadConversationDetail, loadConversations, loadWAStatus, modalOpen]);

  useEffect(() => {
    localStorage.setItem("history_auto_refresh_ms", String(autoRefreshMs));
  }, [autoRefreshMs]);

  useEffect(() => {
    const swapInterval = window.setInterval(() => {
      setSwapToFollowUpView((prev) => !prev);
    }, 5000);

    return () => window.clearInterval(swapInterval);
  }, []);

  const openConversation = async (phone: string) => {
    setActivePhone(phone);
    setModalOpen(true);
    setReplyText("");
    setReplyImage(null);
    setReplyTarget(null);
    setEditTarget(null);
    setThreadSearch("");
    setPendingOnly(false);
    setIsThreadNearBottom(true);
    setShowScrollDownButton(false);
    setNewIncomingCount(0);
    setHighlightedMessageId(null);
    setPendingSelectionMode(false);
    setSelectedPendingIds(new Set());
    setBulkResolving(false);
    setHoveredMessageId(null);
    setOpenActionMessageId(null);
    setActionRehoverLockMessageId(null);
    isThreadNearBottomRef.current = true;
    seenMessageIdsRef.current = new Set();
    hasFocusedPendingRef.current = false;
    try {
      await loadConversationDetail(phone);
      await loadWAStatus();
    } catch {
      toast.error("Gagal memuat detail percakapan");
    }
  };

  useEffect(() => {
    const queryPhone = searchParams.get("phone");
    if (!queryPhone || openedFromQueryPhoneRef.current === queryPhone) {
      return;
    }

    openedFromQueryPhoneRef.current = queryPhone;
    void openConversation(queryPhone).finally(() => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete("phone");
        return next;
      }, { replace: true });
    });
  }, [searchParams, setSearchParams]);

  const refreshThreadAndList = useCallback(async () => {
    if (!activePhone) return;
    await loadConversationDetail(activePhone, { silent: true });
    await loadConversations();
  }, [activePhone, loadConversationDetail, loadConversations]);

  const updateThreadScrollState = useCallback(() => {
    const container = threadContainerRef.current;
    if (!container) return;

    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const hasOverflow = maxScrollTop > 4;
    const distanceFromBottom = maxScrollTop - container.scrollTop;
    const nearBottom = distanceFromBottom < 48;

    isThreadNearBottomRef.current = nearBottom;
    setIsThreadNearBottom(nearBottom);
    setShowScrollDownButton(hasOverflow && !nearBottom);
    if (nearBottom) {
      setNewIncomingCount(0);
    }
  }, []);

  const scrollThreadToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = threadContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  const scrollToMessage = useCallback((messageId: string) => {
    const container = threadContainerRef.current;
    if (!container) return;

    const escapedId = typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(messageId)
      : messageId.replace(/"/g, '\\"');

    const target = container.querySelector<HTMLElement>(`[data-message-id="${escapedId}"]`);
    if (!target) {
      if (threadSearch) {
        setThreadSearch("");
        window.setTimeout(() => scrollToMessage(messageId), 120);
        return;
      }
      if (pendingOnly) {
        setPendingOnly(false);
        window.setTimeout(() => scrollToMessage(messageId), 120);
      }
      return;
    }

    target.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlightedMessageId(messageId);
    window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === messageId ? null : current));
    }, 1500);
  }, [pendingOnly, threadSearch]);

  const handleResolvePending = async (message: ChatMessage) => {
    if (!activePhone) return;
    const sourceId = message.source_message_id || message.id;
    setMessageActionLoadingId(message.id);
    try {
      await resolvePendingMessage(activePhone, sourceId);
      if (replyTarget?.id === message.id) {
        setReplyTarget(null);
      }
      if (editTarget?.id === message.id) {
        setEditTarget(null);
      }
      await refreshThreadAndList();
      toast.success("Status pending diselesaikan");
    } catch {
      toast.error("Gagal menyelesaikan status pending");
    } finally {
      setMessageActionLoadingId(null);
    }
  };

  const handleDeleteMessage = async (message: ChatMessage, mode: "me" | "all") => {
    if (!activePhone) return;
    const sourceId = message.source_message_id || message.id;
    setMessageActionLoadingId(message.id);
    try {
      if (mode === "me") {
        await deleteMessageForMe(activePhone, sourceId);
      } else {
        await deleteMessageForAll(activePhone, sourceId);
      }
      if (replyTarget?.id === message.id) {
        setReplyTarget(null);
      }
      if (editTarget?.id === message.id) {
        setEditTarget(null);
      }
      await refreshThreadAndList();
      toast.success(mode === "me" ? "Pesan dihapus untuk saya" : "Pesan dihapus untuk semua");
    } catch {
      toast.error("Gagal menghapus pesan");
    } finally {
      setMessageActionLoadingId(null);
    }
  };

  const isWAConnected = waStatus?.status === "connected";

  const handleSendReply = async () => {
    if (!activePhone || (!replyText.trim() && !replyImage)) return;
    if (!isWAConnected) {
      toast.error("WhatsApp belum terhubung. Silakan hubungkan dulu.");
      return;
    }
    if (editTarget && replyImage) {
      toast.error("Edit pesan hanya mendukung teks.");
      return;
    }

    setSending(true);
    try {
      if (editTarget) {
        const updated = await editMessage(
          activePhone,
          editTarget.source_message_id || editTarget.id,
          replyText.trim()
        );
        setThreadMessages((prev) =>
          prev.map((message) =>
            message.id === editTarget.id
              ? {
                  ...message,
                  text: updated.text,
                  is_edited: true,
                  edited_at: updated.edited_at || new Date().toISOString()
                }
              : message
          )
        );
        setReplyText("");
        setEditTarget(null);
        setReplyImage(null);
        if (imageInputRef.current) {
          imageInputRef.current.value = "";
        }
        await loadConversationDetail(activePhone, { silent: true });
        await loadConversations();
        toast.success("Pesan berhasil diedit");
      } else {
        const sent = replyImage
          ? await sendManualImageReply(
              activePhone,
              replyImage,
              replyText.trim(),
              replyTarget?.source_message_id || replyTarget?.id || null
            )
          : await sendManualReply(
              activePhone,
              replyText.trim(),
              replyTarget?.source_message_id || replyTarget?.id || null
            );
        setThreadMessages((prev) => [...prev, sent]);
        if (replyTarget?.id && replyTarget.follow_up_state === "open") {
          setThreadMessages((prev) =>
            prev.map((message) =>
              message.id === replyTarget.id
                ? { ...message, follow_up_state: "resolved", status: "handled_by_bot" }
                : message
            )
          );
        }
        setReplyText("");
        setReplyImage(null);
        if (imageInputRef.current) {
          imageInputRef.current.value = "";
        }
        setReplyTarget(null);
        await loadConversationDetail(activePhone, { silent: true });
        await loadConversations();
        toast.success("Balasan berhasil dikirim");
      }
    } catch {
      toast.error(editTarget ? "Gagal mengedit pesan" : "Gagal mengirim balasan manual");
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!sending && isWAConnected && (replyText.trim() || replyImage)) {
        void handleSendReply();
      }
    }
  };

  const displayedThreadMessages = useMemo(() => {
    const normalized = threadSearch.toLowerCase();
    return threadMessages.filter((message) => {
      const passesPending = !pendingOnly || (message.direction === "inbound" && message.follow_up_state === "open");
      const passesSearch = !normalized || message.text.toLowerCase().includes(normalized);
      return passesPending && passesSearch;
    });
  }, [pendingOnly, threadMessages, threadSearch]);

  const pendingThreadMessages = useMemo(
    () => threadMessages.filter((message) => message.direction === "inbound" && message.follow_up_state === "open"),
    [threadMessages]
  );

  const visiblePendingMessages = useMemo(
    () => displayedThreadMessages.filter((message) => message.direction === "inbound" && message.follow_up_state === "open"),
    [displayedThreadMessages]
  );

  const selectedPendingMessages = useMemo(
    () => pendingThreadMessages.filter((message) => selectedPendingIds.has(message.id)),
    [pendingThreadMessages, selectedPendingIds]
  );

  const allVisiblePendingSelected = visiblePendingMessages.length > 0
    && visiblePendingMessages.every((message) => selectedPendingIds.has(message.id));

  const togglePendingSelection = (messageId: string, checked: boolean) => {
    setSelectedPendingIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(messageId);
      } else {
        next.delete(messageId);
      }
      return next;
    });
  };

  const toggleVisiblePendingSelection = (checked: boolean) => {
    setSelectedPendingIds((current) => {
      const next = new Set(current);
      visiblePendingMessages.forEach((message) => {
        if (checked) {
          next.add(message.id);
        } else {
          next.delete(message.id);
        }
      });
      return next;
    });
  };

  const handleResolvePendingBulk = async (mode: "selected" | "all") => {
    if (!activePhone || bulkResolving) return;

    const selectedSourceIds = selectedPendingMessages.map((message) => message.source_message_id || message.id);
    if (mode === "selected" && selectedSourceIds.length === 0) {
      toast.error("Pilih pesan pending dulu");
      return;
    }
    if (mode === "all" && pendingThreadMessages.length === 0) {
      toast.error("Tidak ada pesan pending");
      return;
    }

    setBulkResolving(true);
    try {
      await resolvePendingMessages(activePhone, mode === "selected" ? selectedSourceIds : []);
      setSelectedPendingIds(new Set());
      setPendingSelectionMode(false);
      setReplyTarget((current) => (
        current && (mode === "all" || selectedPendingIds.has(current.id)) ? null : current
      ));
      setEditTarget((current) => (
        current && (mode === "all" || selectedPendingIds.has(current.id)) ? null : current
      ));
      await refreshThreadAndList();
      toast.success(mode === "selected" ? "Status pending terpilih diselesaikan" : "Semua status pending diselesaikan");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Gagal menyelesaikan status pending");
    } finally {
      setBulkResolving(false);
    }
  };

  useEffect(() => {
    setSelectedPendingIds((current) => {
      if (current.size === 0) return current;
      const pendingIds = new Set(pendingThreadMessages.map((message) => message.id));
      const next = new Set([...current].filter((id) => pendingIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [pendingThreadMessages]);

  useEffect(() => {
    if (!modalOpen || hasFocusedPendingRef.current || !threadContainerRef.current) return;

    const pendingMessages = threadMessages.filter(
      (message) => message.direction === "inbound" && message.follow_up_state === "open"
    );

    const latestPendingMessage = pendingMessages[pendingMessages.length - 1];
    if (!latestPendingMessage) return;

    const pendingElement = threadContainerRef.current.querySelector(
      `[data-message-id="${latestPendingMessage.id}"]`
    );

    if (pendingElement) {
      pendingElement.scrollIntoView({ block: "center", behavior: "smooth" });
      hasFocusedPendingRef.current = true;
    }
  }, [modalOpen, threadMessages]);

  useEffect(() => {
    if (!modalOpen) return;
    const container = threadContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      updateThreadScrollState();
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [modalOpen, updateThreadScrollState]);

  useEffect(() => {
    if (!modalOpen || threadMessages.length === 0) return;
    const seenIds = seenMessageIdsRef.current;
    const currentIds = new Set(threadMessages.map((message) => message.id));

    if (seenIds.size === 0) {
      seenMessageIdsRef.current = currentIds;
      window.requestAnimationFrame(() => scrollThreadToBottom("auto"));
      return;
    }

    const newMessages = threadMessages.filter((message) => !seenIds.has(message.id));
    seenMessageIdsRef.current = currentIds;

    if (newMessages.length === 0) {
      window.requestAnimationFrame(() => updateThreadScrollState());
      return;
    }

    if (isThreadNearBottomRef.current) {
      window.requestAnimationFrame(() => scrollThreadToBottom("smooth"));
      return;
    }

    const inboundNewCount = newMessages.filter((message) => message.direction === "inbound").length;
    if (inboundNewCount > 0) {
      setNewIncomingCount((count) => count + inboundNewCount);
    }
    window.requestAnimationFrame(() => updateThreadScrollState());
  }, [modalOpen, scrollThreadToBottom, threadMessages, updateThreadScrollState]);

  useEffect(() => {
    if (!modalOpen) return;
    window.requestAnimationFrame(() => updateThreadScrollState());
  }, [displayedThreadMessages.length, modalOpen, updateThreadScrollState]);

  useEffect(() => {
    setPage(1);
  }, [rowsPerPage]);

  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;

    const minHeight = 56;
    const maxHeight = 160;
    textarea.style.height = "0px";
    const contentHeight = textarea.scrollHeight;
    const nextHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }, [replyText, modalOpen]);

  const resolveRowStatusView = (conversation: ConversationSummary) => {
    const lastIsHandled = conversation.last_status === "handled_by_bot";
    const baseLabel = lastIsHandled ? "Status Terakhir: Tertangani" : "Status Terakhir: Belum Ditangani";
    const baseClass = lastIsHandled
      ? "bg-accent text-accent-foreground"
      : "bg-slate-100 text-slate-700";
    const baseDotClass = lastIsHandled ? "bg-primary" : "bg-slate-500";

    if (conversation.unresolved_count > 0 && swapToFollowUpView) {
      return {
        label: `Perlu Follow Up (${conversation.unresolved_count})`,
        className: "bg-amber-100 text-amber-700",
        dotClass: "bg-amber-500"
      };
    }

    return {
      label: baseLabel,
      className: baseClass,
      dotClass: baseDotClass
    };
  };

  return (
    <div>
      <div className="mb-6">
        <div className="surface-panel flex flex-col gap-4 rounded-lg p-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Riwayat Chat</h1>
            <p className="mt-1 text-sm text-muted-foreground">Inbox per nomor dengan aktivitas chat terakhir</p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-lg border bg-card px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Auto Refresh</span>
            <select
              value={autoRefreshMs}
              onChange={(event) => setAutoRefreshMs(Number(event.target.value))}
              className="rounded-md border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {AUTO_REFRESH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="Cari nomor atau pesan terakhir..."
          className="w-full sm:w-72 rounded-lg border bg-card pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Telepon</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Pesan Terakhir</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Waktu</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((conversation) => (
                  <tr
                    key={conversation.phone}
                    onClick={() => void openConversation(conversation.phone)}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-foreground text-xs">{formatLocalPhone(conversation.phone)}</td>
                    <td className="px-4 py-3 text-foreground max-w-xs">
                      <div className="rounded-lg bg-muted px-3 py-1.5 inline-block text-sm">
                        {conversation.last_message || "-"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const statusView = resolveRowStatusView(conversation);
                        return (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusView.className}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${statusView.dotClass}`} />
                            {statusView.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {formatChatDate(conversation.last_message_at)}
                    </td>
                  </tr>
                ))}
                {conversations.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Tidak ada percakapan</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={conversationMeta.page}
            totalPages={conversationMeta.totalPages}
            pageSize={rowsPerPage}
            disabled={loading}
            onPageChange={setPage}
            onPageSizeChange={(nextLimit) => {
              setRowsPerPage(nextLimit);
              setPage(1);
            }}
          />
        </div>
      )}

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setActivePhone(null);
            setThreadMessages([]);
            setReplyText("");
            setReplyImage(null);
            if (imageInputRef.current) {
              imageInputRef.current.value = "";
            }
            setReplyTarget(null);
            setEditTarget(null);
            setIsThreadNearBottom(true);
            setShowScrollDownButton(false);
            setNewIncomingCount(0);
            setHighlightedMessageId(null);
            setPendingSelectionMode(false);
            setSelectedPendingIds(new Set());
            setBulkResolving(false);
            setHoveredMessageId(null);
            setOpenActionMessageId(null);
            setActionRehoverLockMessageId(null);
            isThreadNearBottomRef.current = true;
            seenMessageIdsRef.current = new Set();
            hasFocusedPendingRef.current = false;
          }
        }}
      >
        <DialogContent className="flex h-[92vh] w-[calc(100vw-1rem)] max-w-5xl flex-col p-0 overflow-hidden sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="px-6 pt-6 pb-3 border-b text-left">
            <DialogTitle>Percakapan: {activePhone || "-"}</DialogTitle>
            <DialogDescription>
              Klik pesan untuk membuka aksi seperti balas, edit, hapus, atau selesaikan pending.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-3 border-b bg-background">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={threadSearch}
                  onChange={(e) => setThreadSearch(e.target.value)}
                  placeholder="Cari pesan di percakapan..."
                  className="w-full rounded-lg border bg-card pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!pendingSelectionMode ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPendingSelectionMode(true);
                      setPendingOnly(true);
                    }}
                    disabled={pendingThreadMessages.length === 0 || bulkResolving}
                    className="inline-flex items-center rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Pilih Pesan
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleVisiblePendingSelection(!allVisiblePendingSelected)}
                      disabled={visiblePendingMessages.length === 0 || bulkResolving}
                      className="inline-flex items-center rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {allVisiblePendingSelected ? "Batal Pilih Semua" : "Pilih Semua"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResolvePendingBulk("selected")}
                      disabled={selectedPendingMessages.length === 0 || bulkResolving}
                      className="inline-flex items-center rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {bulkResolving ? "Memproses..." : `Selesaikan Dipilih (${selectedPendingMessages.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingSelectionMode(false);
                        setSelectedPendingIds(new Set());
                      }}
                      disabled={bulkResolving}
                      className="inline-flex items-center rounded-lg border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Batal
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => void handleResolvePendingBulk("all")}
                  disabled={pendingThreadMessages.length === 0 || bulkResolving}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Selesaikan Semua Pending
                </button>
                <button
                  onClick={() => setPendingOnly((prev) => !prev)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    pendingOnly
                      ? "border-amber-300 bg-amber-50 text-amber-700"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {pendingOnly ? "Tampilkan Semua" : "Filter Pending Saja"}
                </button>
              </div>
            </div>
          </div>

          <div className="relative min-h-0 flex-1">
            <div ref={threadContainerRef} className="h-full overflow-y-auto bg-muted/20 px-4 pt-0 pb-1 sm:px-6">
              {threadLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : displayedThreadMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Tidak ada pesan yang cocok dengan filter
                </div>
              ) : (
                <div className="space-y-3">
                  {displayedThreadMessages.map((message) => {
                  const isOutbound = message.direction === "outbound";
                  const senderLabel = isOutbound
                    ? message.sender_type === "admin"
                      ? "Anda"
                      : "Bot"
                    : "Customer";
                  const isPending = message.direction === "inbound" && message.follow_up_state === "open";
                  const isRevoked = Boolean(message.is_revoked);
                  const isActionLoading = messageActionLoadingId === message.id;
                  const bubbleClass = isOutbound
                    ? "bg-primary text-primary-foreground"
                    : isPending
                      ? "bg-card border border-amber-300 text-card-foreground"
                      : "bg-card border text-card-foreground";
                  const quotedMessage = threadMessages.find((candidate) => {
                    if (message.reply_to_message_id) {
                      return (candidate.source_message_id || candidate.id) === message.reply_to_message_id;
                    }
                    if (message.reply_to_wa_message_id && candidate.wa_message_id) {
                      return candidate.wa_message_id === message.reply_to_wa_message_id;
                    }
                    return false;
                  }) || null;
                  const canOpenMenu = !isRevoked;
                  const isActionVisible =
                    openActionMessageId === message.id ||
                    (hoveredMessageId === message.id && actionRehoverLockMessageId !== message.id);

                  return (
                    <div
                      key={message.id}
                      data-message-id={message.id}
                      className={`flex items-start gap-2 ${isOutbound ? "justify-end" : "justify-start"}`}
                    >
                      {pendingSelectionMode && isPending && (
                        <label
                          className="mt-2 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-700 transition-colors hover:bg-amber-100"
                          title="Pilih pesan pending"
                          aria-label="Pilih pesan pending"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPendingIds.has(message.id)}
                            onChange={(event) => togglePendingSelection(message.id, event.target.checked)}
                            className="h-4 w-4 rounded border-amber-300 accent-primary"
                          />
                        </label>
                      )}
                      <div
                        className="group/message relative max-w-[75%]"
                        onMouseEnter={() => {
                          if (actionRehoverLockMessageId !== message.id) {
                            setHoveredMessageId(message.id);
                          }
                        }}
                        onMouseLeave={() => {
                          setHoveredMessageId((current) => (current === message.id ? null : current));
                          setActionRehoverLockMessageId((current) => (current === message.id ? null : current));
                        }}
                        onFocusCapture={() => {
                          if (actionRehoverLockMessageId !== message.id) {
                            setHoveredMessageId(message.id);
                          }
                        }}
                        onBlurCapture={() => setHoveredMessageId((current) => (current === message.id ? null : current))}
                      >
                        <div
                          className={`rounded-xl px-3 py-2 text-left text-sm transition-colors hover:opacity-95 ${bubbleClass} ${
                            highlightedMessageId === message.id
                              ? "ring-2 ring-primary/70 shadow-[0_0_0_6px_rgba(34,197,94,0.15)] animate-pulse"
                              : ""
                          } ${canOpenMenu ? "pr-9" : ""}`}
                        >
                          <div className="mb-1 flex items-center gap-2 text-[11px] opacity-80">
                            <span>{senderLabel}</span>
                            {isPending && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                Perlu Follow Up
                              </span>
                            )}
                          </div>
                          {quotedMessage && (
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                scrollToMessage(quotedMessage.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  scrollToMessage(quotedMessage.id);
                                }
                              }}
                              className="mb-2 w-full cursor-pointer rounded-md border-l-4 border-white/60 bg-black/10 px-2 py-1 text-left text-xs opacity-90 transition-colors hover:bg-black/20 focus:outline-none focus:ring-1 focus:ring-white/60"
                            >
                              <div className="font-medium">Reply ke:</div>
                              <div className="line-clamp-2">{quotedMessage.text}</div>
                            </div>
                          )}
                          {isRevoked ? (
                            <div className="flex items-center gap-1 italic opacity-85">
                              <span className="text-base leading-none">⊘</span>
                              <span>Pesan ini dihapus</span>
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap break-words">{message.text}</div>
                          )}
                          {isPending && (message.follow_up_reason || message.follow_up_summary) && (
                            <div className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                              {message.follow_up_reason && (
                                <div className="font-medium">{message.follow_up_reason}</div>
                              )}
                              {message.follow_up_summary && (
                                <div className="mt-0.5 opacity-80">{message.follow_up_summary}</div>
                              )}
                            </div>
                          )}
                          <div className="mt-1 text-[11px] opacity-75 text-right">
                            {new Date(message.timestamp).toLocaleTimeString()}
                            {message.is_edited ? " • Diedit" : ""}
                          </div>
                        </div>

                        {canOpenMenu && (
                          <DropdownMenu
                            open={openActionMessageId === message.id}
                            onOpenChange={(open) => {
                              setOpenActionMessageId((current) => {
                                if (open) return message.id;
                                return current === message.id ? null : current;
                              });
                              if (open) {
                                setActionRehoverLockMessageId((current) => (current === message.id ? null : current));
                              } else {
                                setHoveredMessageId((current) => (current === message.id ? null : current));
                                setActionRehoverLockMessageId(message.id);
                              }
                            }}
                          >
                            <DropdownMenuTrigger asChild>
                              <button
                                className={`absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/20 text-white transition-all hover:bg-black/35 ${
                                  isActionVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                                }`}
                                aria-label="Aksi pesan"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align={isOutbound ? "end" : "start"} className="w-48">
                              <DropdownMenuItem
                                disabled={isActionLoading}
                                onClick={() => {
                                  setReplyTarget(message);
                                  setEditTarget(null);
                                }}
                              >
                                Balas
                              </DropdownMenuItem>
                              {message.can_edit && (
                                <DropdownMenuItem
                                  disabled={isActionLoading}
                                  onClick={() => {
                                    setEditTarget(message);
                                    setReplyTarget(null);
                                    setReplyText(message.text);
                                    setReplyImage(null);
                                    if (imageInputRef.current) {
                                      imageInputRef.current.value = "";
                                    }
                                  }}
                                >
                                  Edit
                                </DropdownMenuItem>
                              )}
                              {isPending && (
                                <DropdownMenuItem
                                  disabled={isActionLoading}
                                  onClick={() => void handleResolvePending(message)}
                                >
                                  Selesaikan status pending
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={isActionLoading}
                                onClick={() => void handleDeleteMessage(message, "me")}
                              >
                                Hapus untuk saya
                              </DropdownMenuItem>
                              {message.can_delete_for_everyone && (
                                <DropdownMenuItem
                                  disabled={isActionLoading}
                                  onClick={() => void handleDeleteMessage(message, "all")}
                                  className="text-destructive focus:text-destructive"
                                >
                                  Hapus untuk semua
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  );
                  })}
                </div>
              )}
            </div>
            {showScrollDownButton && (
              <button
                type="button"
                onClick={() => {
                  scrollThreadToBottom("smooth");
                  setNewIncomingCount(0);
                  window.requestAnimationFrame(() => updateThreadScrollState());
                }}
                className="absolute bottom-4 right-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-700 text-white shadow-lg transition-colors hover:bg-slate-800"
                aria-label="Scroll ke bawah"
              >
                <ChevronsDown className="h-5 w-5" />
                {newIncomingCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-green-600 px-1 text-[10px] font-bold text-white">
                    {newIncomingCount > 99 ? "99+" : newIncomingCount}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="bg-background px-4 pt-0 pb-3 sm:px-6 space-y-2">
            {editTarget && (
              <div className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2">
                <div className="mb-1 flex items-center justify-between text-xs text-blue-800">
                  <span>Mengedit pesan</span>
                  <button
                    onClick={() => {
                      setEditTarget(null);
                      setReplyText("");
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-blue-300 px-2 py-0.5 hover:bg-blue-100"
                  >
                    <X className="h-3 w-3" />
                    Batal
                  </button>
                </div>
                <p className="line-clamp-2 text-sm text-blue-900">{editTarget.text}</p>
              </div>
            )}
            {replyTarget && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                <div className="mb-1 flex items-center justify-between text-xs text-amber-800">
                  <span>Membalas pesan</span>
                  <button
                    onClick={() => {
                      setReplyTarget(null);
                      setReplyText("");
                      setReplyImage(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2 py-0.5 hover:bg-amber-100"
                  >
                    <X className="h-3 w-3" />
                    Batal
                  </button>
                </div>
                <p className="line-clamp-2 text-sm text-amber-900">{replyTarget.text}</p>
              </div>
            )}
            {!isWAConnected && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                WhatsApp belum terhubung. Hubungkan di menu Pengaturan WhatsApp untuk bisa kirim balasan.
              </div>
            )}
            {replyImage && (
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Image className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{replyImage.name}</div>
                    <div className="text-xs text-muted-foreground">{(replyImage.size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setReplyImage(null);
                    if (imageInputRef.current) imageInputRef.current.value = "";
                  }}
                  className="rounded-lg p-1.5 transition-colors hover:bg-muted"
                  aria-label="Hapus gambar"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  if (!file) {
                    setReplyImage(null);
                    return;
                  }
                  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
                    toast.error("Gambar harus JPG, PNG, atau WEBP");
                    event.target.value = "";
                    return;
                  }
                  if (file.size > 5 * 1024 * 1024) {
                    toast.error("Ukuran gambar maksimal 5MB");
                    event.target.value = "";
                    return;
                  }
                  setReplyImage(file);
                  setEditTarget(null);
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => imageInputRef.current?.click()}
                disabled={!isWAConnected || sending || Boolean(editTarget)}
                className="h-[56px] shrink-0 px-3"
                title={editTarget ? "Gambar tidak tersedia saat edit pesan" : "Kirim gambar"}
              >
                <Image className="h-4 w-4" />
              </Button>
              <Textarea
                ref={composerTextareaRef}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={editTarget ? "Edit isi pesan..." : replyImage ? "Tulis caption gambar..." : "Tulis balasan manual..."}
                rows={1}
                disabled={!isWAConnected || sending}
                className="min-h-[56px] max-h-[160px] resize-none overflow-hidden box-border py-3 leading-5"
              />
              <Button
                onClick={() => void handleSendReply()}
                disabled={!isWAConnected || sending || (!replyText.trim() && !replyImage)}
                className="h-[56px] shrink-0 px-4"
              >
                <Send className="h-4 w-4 mr-1" />
                {sending ? "Mengirim..." : editTarget ? "Simpan Edit" : "Kirim"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
