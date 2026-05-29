import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  activateKnowledgeDocument,
  createTextKnowledgeDocument,
  createRule,
  deleteKnowledgeDocument,
  deleteRule,
  getKnowledgeDocuments,
  getKnowledgeStatus,
  getRules,
  reindexKnowledgeDocument,
  updateKnowledgeDocument,
  updateRule,
  uploadKnowledgeDocument,
} from "@/services/api";
import { RuleFormModal } from "@/components/RuleFormModal";
import type { KnowledgeDocument, KnowledgeStatus, Rule } from "@/types";
import { toast } from "sonner";

const matchTypeLabel: Record<Rule["match_type"], string> = {
  contains: "Mengandung",
  exact: "Persis",
};

const documentStatusLabel: Record<KnowledgeDocument["status"], string> = {
  indexed: "Indexed",
  processing: "Processing",
  failed: "Failed",
};

const AUTO_REFRESH_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "5 detik", value: 5000 },
  { label: "10 detik", value: 10000 },
  { label: "30 detik", value: 30000 },
  { label: "1 menit", value: 60000 },
  { label: "2 menit", value: 120000 }
];

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function QuickAnswersTab({ autoRefreshMs }: { autoRefreshMs: number }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback((options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    getRules()
      .then(setRules)
      .catch(() => toast.error("Gagal memuat jawaban cepat"))
      .finally(() => {
        if (!options?.silent) {
          setLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefreshMs || autoRefreshMs <= 0) {
      return;
    }

    const pollId = window.setInterval(() => {
      load({ silent: true });
    }, autoRefreshMs);

    return () => window.clearInterval(pollId);
  }, [autoRefreshMs, load]);

  const filtered = rules.filter((rule) =>
    rule.keyword.toLowerCase().includes(search.toLowerCase()) ||
    rule.response.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async (data: Omit<Rule, "id" | "created_at">) => {
    setSaving(true);
    try {
      if (editingRule) {
        const updated = await updateRule(editingRule.id, data);
        setRules((prev) => prev.map((rule) => (rule.id === editingRule.id ? { ...rule, ...updated } : rule)));
        toast.success("Jawaban cepat diperbarui");
      } else {
        const created = await createRule(data);
        setRules((prev) => [...prev, created]);
        toast.success("Jawaban cepat dibuat");
      }
      setModalOpen(false);
      setEditingRule(null);
    } catch {
      toast.error("Gagal menyimpan jawaban cepat");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus jawaban cepat ini?")) return;
    try {
      await deleteRule(id);
      setRules((prev) => prev.filter((rule) => rule.id !== id));
      toast.success("Jawaban cepat dihapus");
    } catch {
      toast.error("Gagal menghapus jawaban cepat");
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari keyword atau respons..."
            className="h-10 w-full rounded-lg border bg-card pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          onClick={() => { setEditingRule(null); setModalOpen(true); }}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Tambah Jawaban
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Keyword</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipe</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Respons</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Memuat jawaban cepat...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Belum ada jawaban cepat</td></tr>
              ) : (
                filtered.map((rule) => (
                  <tr key={rule.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">{rule.keyword}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        {matchTypeLabel[rule.match_type]}
                      </span>
                    </td>
                    <td className="max-w-md truncate px-4 py-3 text-muted-foreground">{rule.response}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        rule.is_active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${rule.is_active ? "bg-primary" : "bg-muted-foreground"}`} />
                        {rule.is_active ? "Aktif" : "Tidak Aktif"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => { setEditingRule(rule); setModalOpen(true); }}
                          className="rounded-lg p-2 transition-colors hover:bg-muted"
                          aria-label="Edit jawaban cepat"
                        >
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="rounded-lg p-2 transition-colors hover:bg-destructive/10"
                          aria-label="Hapus jawaban cepat"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RuleFormModal
        open={modalOpen}
        rule={editingRule}
        onClose={() => { setModalOpen(false); setEditingRule(null); }}
        onSave={handleSave}
        loading={saving}
      />
    </section>
  );
}

function DocumentsTab({ autoRefreshMs }: { autoRefreshMs: number }) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingText, setSavingText] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [textFormOpen, setTextFormOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<KnowledgeDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDocument | null>(null);
  const [textTitle, setTextTitle] = useState("");
  const [textBody, setTextBody] = useState("");

  const load = useCallback((options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    Promise.all([getKnowledgeDocuments(), getKnowledgeStatus()])
      .then(([docs, knowledgeStatus]) => {
        setDocuments(docs);
        setStatus(knowledgeStatus);
      })
      .catch(() => toast.error("Gagal memuat dokumen knowledge"))
      .finally(() => {
        if (!options?.silent) {
          setLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefreshMs || autoRefreshMs <= 0) {
      return;
    }

    const pollId = window.setInterval(() => {
      load({ silent: true });
    }, autoRefreshMs);

    return () => window.clearInterval(pollId);
  }, [autoRefreshMs, load]);

  const indexedCount = useMemo(
    () => documents.filter((document) => document.status === "indexed" && document.status_active !== true).length,
    [documents]
  );

  const activeCount = useMemo(
    () => documents.filter((document) => document.status_active !== true).length,
    [documents]
  );

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Pilih file TXT, MD, PDF, JPG, PNG, atau WEBP terlebih dahulu");
      return;
    }

    setUploading(true);
    try {
      const document = await uploadKnowledgeDocument(selectedFile);
      setDocuments((prev) => [document, ...prev]);
      setSelectedFile(null);
      toast.success(document.status === "indexed" ? "Dokumen berhasil diindex" : "Dokumen diterima, tetapi belum berhasil diindex");
    } catch {
      toast.error("Gagal upload dokumen knowledge");
    } finally {
      setUploading(false);
    }
  };

  const resetTextForm = () => {
    setEditingDocument(null);
    setTextTitle("");
    setTextBody("");
    setTextFormOpen(false);
  };

  const openCreateTextForm = () => {
    setEditingDocument(null);
    setTextTitle("");
    setTextBody("");
    setTextFormOpen(true);
  };

  const openEditTextForm = (document: KnowledgeDocument) => {
    if (document.status_active === true) return;
    setEditingDocument(document);
    setTextTitle(document.title || document.original_filename);
    setTextBody(document.extracted_text || "");
    setTextFormOpen(true);
  };

  const handleSaveText = async () => {
    if (!textTitle.trim()) {
      toast.error("Judul knowledge wajib diisi");
      return;
    }
    if (textBody.trim().length < 20) {
      toast.error("Isi knowledge minimal 20 karakter");
      return;
    }

    setSavingText(true);
    try {
      const document = editingDocument
        ? await updateKnowledgeDocument(editingDocument._id, textTitle.trim(), textBody.trim())
        : await createTextKnowledgeDocument(textTitle.trim(), textBody.trim());

      setDocuments((prev) => {
        if (editingDocument) {
          return prev.map((item) => (item._id === editingDocument._id ? document : item));
        }
        return [document, ...prev];
      });
      resetTextForm();
      toast.success(document.status === "indexed" ? "Knowledge berhasil diindex" : "Knowledge disimpan, tetapi belum berhasil diindex");
    } catch {
      toast.error("Gagal menyimpan knowledge");
    } finally {
      setSavingText(false);
    }
  };

  const handleReindex = async (id: string) => {
    setBusyId(id);
    try {
      const updated = await reindexKnowledgeDocument(id);
      setDocuments((prev) => prev.map((document) => (document._id === id ? updated : document)));
      toast.success(updated.status === "indexed" ? "Dokumen berhasil diindex ulang" : "Reindex belum berhasil");
    } catch {
      toast.error("Gagal reindex dokumen");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget._id);
    try {
      const updated = await deleteKnowledgeDocument(deleteTarget._id);
      setDocuments((prev) => prev.map((document) => (document._id === updated._id ? updated : document)));
      setDeleteTarget(null);
      toast.success("Dokumen dinonaktifkan");
    } catch {
      toast.error("Gagal menghapus dokumen");
    } finally {
      setBusyId(null);
    }
  };

  const handleActivate = async (id: string) => {
    setBusyId(id);
    try {
      const updated = await activateKnowledgeDocument(id);
      setDocuments((prev) => prev.map((document) => (document._id === id ? updated : document)));
      toast.success("Dokumen diaktifkan kembali");
    } catch {
      toast.error("Gagal mengaktifkan dokumen");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">Dokumen indexed</div>
          <div className="mt-2 text-2xl font-bold text-foreground">{indexedCount}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">Total dokumen</div>
          <div className="mt-2 text-2xl font-bold text-foreground">{documents.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">{activeCount} aktif</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {status?.lm_studio.connected ? <Wifi className="h-4 w-4 text-primary" /> : <WifiOff className="h-4 w-4 text-destructive" />}
            LM Studio
          </div>
          <div className="mt-2 text-sm font-medium text-foreground">
            {status?.lm_studio.connected ? "Terhubung" : "Tidak terhubung"}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{status?.lm_studio.base_url || "Memuat..."}</div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Tambah Knowledge Marketing</h2>
            <p className="mt-1 text-sm text-muted-foreground">Upload file TXT/MD/PDF/gambar atau ketik materi langsung.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="file"
              accept=".txt,.md,.pdf,.jpg,.jpeg,.png,.webp,text/plain,text/markdown,application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:text-foreground"
            />
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {uploading ? "Mengupload..." : "Upload"}
            </button>
            <button
              onClick={() => {
                if (textFormOpen && !editingDocument) {
                  resetTextForm();
                } else {
                  openCreateTextForm();
                }
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              {textFormOpen && !editingDocument ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {textFormOpen && !editingDocument ? "Tutup" : "Tambah Teks"}
            </button>
          </div>
        </div>
        {textFormOpen && (
          <div className="mt-4 grid gap-3 border-t pt-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">
                {editingDocument ? "Edit Knowledge" : "Tambah Knowledge Teks"}
              </h3>
              {editingDocument && (
                <button
                  onClick={resetTextForm}
                  className="rounded-lg p-1.5 transition-colors hover:bg-muted"
                  aria-label="Tutup edit knowledge"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-card-foreground">Judul</label>
              <input
                value={textTitle}
                onChange={(event) => setTextTitle(event.target.value)}
                maxLength={120}
                placeholder="cth. Promo Paket Website Mei"
                className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-card-foreground">Isi Knowledge</label>
              <textarea
                value={textBody}
                onChange={(event) => setTextBody(event.target.value)}
                rows={7}
                placeholder="Tulis materi marketing, detail produk, promo, FAQ, benefit, atau informasi layanan di sini..."
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={resetTextForm}
                className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
              >
                Batal
              </button>
              <button
                onClick={handleSaveText}
                disabled={savingText}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {savingText ? "Menyimpan..." : editingDocument ? "Simpan Perubahan" : "Simpan Teks"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">Dokumen Knowledge</h2>
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Memuat dokumen...</div>
          ) : documents.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Belum ada dokumen knowledge</div>
          ) : (
            documents.map((document) => (
              <div
                key={document._id}
                className={`flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between ${
                  document.status_active === true ? "bg-muted/30 opacity-75" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="truncate font-medium text-foreground">{document.title || document.original_filename}</div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{document.original_filename}</span>
                    <span>{formatBytes(document.size_bytes)}</span>
                    <span>{document.chunk_count} chunks</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                      document.status_active === true ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                    }`}>
                      {document.status_active === true ? "Tidak Aktif" : "Aktif"}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                      document.status === "indexed"
                        ? "bg-accent text-accent-foreground"
                        : document.status === "failed"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}>
                      {document.status === "indexed" ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                      {documentStatusLabel[document.status]}
                    </span>
                  </div>
                  {document.error_message && (
                    <div className="mt-2 text-xs text-destructive">{document.error_message}</div>
                  )}
                </div>
                <div className="flex items-center gap-1 self-end lg:self-auto">
                  {document.status_active === true ? (
                    <button
                      onClick={() => handleActivate(document._id)}
                      disabled={busyId === document._id}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      Aktifkan
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => openEditTextForm(document)}
                        disabled={busyId === document._id}
                        className="rounded-lg p-2 transition-colors hover:bg-muted disabled:opacity-50"
                        aria-label="Edit dokumen"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleReindex(document._id)}
                        disabled={busyId === document._id}
                        className="rounded-lg p-2 transition-colors hover:bg-muted disabled:opacity-50"
                        aria-label="Reindex dokumen"
                      >
                        <RefreshCw className={`h-4 w-4 text-muted-foreground ${busyId === document._id ? "animate-spin" : ""}`} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(document)}
                        disabled={busyId === document._id}
                        className="rounded-lg p-2 transition-colors hover:bg-destructive/10 disabled:opacity-50"
                        aria-label="Nonaktifkan dokumen"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-destructive/10 p-2">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-card-foreground">Nonaktifkan knowledge?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Knowledge ini tidak akan dipakai bot, tapi tetap muncul di daftar dan bisa diaktifkan kembali.
                </p>
                <div className="mt-3 truncate rounded-lg bg-muted px-3 py-2 text-sm font-medium text-foreground">
                  {deleteTarget.title || deleteTarget.original_filename}
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={busyId === deleteTarget._id}
                className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={busyId === deleteTarget._id}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busyId === deleteTarget._id ? "Memproses..." : "Nonaktifkan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function KnowledgePage() {
  const [activeTab, setActiveTab] = useState<"answers" | "documents">("answers");
  const [autoRefreshMs, setAutoRefreshMs] = useState<number>(() => {
    const raw = localStorage.getItem("knowledge_auto_refresh_ms");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 10000;
  });

  useEffect(() => {
    localStorage.setItem("knowledge_auto_refresh_ms", String(autoRefreshMs));
  }, [autoRefreshMs]);

  return (
    <div className="space-y-6">
      <div className="surface-panel flex flex-col gap-4 rounded-lg p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Knowledge</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kelola jawaban cepat dan dokumen marketing untuk auto-reply WhatsApp.
          </p>
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

      <div className="inline-flex rounded-lg border bg-card/90 p-1 shadow-sm">
        <button
          onClick={() => setActiveTab("answers")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "answers" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Jawaban Cepat
        </button>
        <button
          onClick={() => setActiveTab("documents")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "documents" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Dokumen
        </button>
      </div>

      {activeTab === "answers" ? (
        <QuickAnswersTab autoRefreshMs={autoRefreshMs} />
      ) : (
        <DocumentsTab autoRefreshMs={autoRefreshMs} />
      )}
    </div>
  );
}
