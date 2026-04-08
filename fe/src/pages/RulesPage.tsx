import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { getRules, createRule, updateRule, deleteRule } from "@/services/api";
import { RuleFormModal } from "@/components/RuleFormModal";
import type { Rule } from "@/types";
import { toast } from "sonner";

const matchTypeLabel: Record<Rule["match_type"], string> = {
  contains: "Mengandung",
  exact: "Persis",
};

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [search, setSearch] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(1);

  const load = () => {
    setLoading(true);
    getRules().then((r) => { setRules(r); setLoading(false); });
  };

  useEffect(load, []);

  const filtered = rules.filter((r) =>
    r.keyword.toLowerCase().includes(search.toLowerCase()) ||
    r.response.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paginated = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  useEffect(() => {
    setPage(1);
  }, [search, rowsPerPage]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleSave = async (data: Omit<Rule, "id" | "created_at">) => {
    setSaving(true);
    try {
      if (editingRule) {
        const updated = await updateRule(editingRule.id, data);
        setRules((prev) => prev.map((r) => (r.id === editingRule.id ? { ...r, ...updated } : r)));
        toast.success("Aturan diperbarui");
      } else {
        const created = await createRule(data);
        setRules((prev) => [...prev, created]);
        toast.success("Aturan dibuat");
      }
      setModalOpen(false);
      setEditingRule(null);
    } catch {
      toast.error("Gagal menyimpan aturan");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus aturan ini?")) return;
    try {
      await deleteRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast.success("Aturan dihapus");
    } catch {
      toast.error("Gagal menghapus aturan");
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Aturan</h1>
          <p className="text-sm text-muted-foreground">Kelola aturan balas otomatis untuk chatbot Anda</p>
        </div>
        <button
          onClick={() => { setEditingRule(null); setModalOpen(true); }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" /> Tambah Aturan
        </button>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari aturan..."
          className="w-full sm:w-72 rounded-lg border bg-card pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {filtered.length > rowsPerPage && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Menampilkan {filtered.length === 0 ? 0 : (page - 1) * rowsPerPage + 1}-
            {Math.min(page * rowsPerPage, filtered.length)} dari {filtered.length} aturan
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Per halaman</label>
            <select
              value={rowsPerPage}
              onChange={(e) => setRowsPerPage(Number(e.target.value))}
              className="rounded-lg border bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </div>
        </div>
      )}

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
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kata Kunci</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipe</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Respons</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((rule) => (
                  <tr key={rule.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground font-mono">{rule.keyword}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        {matchTypeLabel[rule.match_type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{rule.response}</td>
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
                        <button onClick={() => { setEditingRule(rule); setModalOpen(true); }} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button onClick={() => handleDelete(rule.id)} className="rounded-lg p-1.5 hover:bg-destructive/10 transition-colors">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginated.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Tidak ada aturan</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filtered.length > rowsPerPage && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border px-3 py-1.5 text-sm text-muted-foreground disabled:opacity-50 hover:bg-muted transition-colors"
          >
            Sebelumnya
          </button>
          <span className="text-sm text-muted-foreground">
            Halaman {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border px-3 py-1.5 text-sm text-muted-foreground disabled:opacity-50 hover:bg-muted transition-colors"
          >
            Berikutnya
          </button>
        </div>
      )}

      <RuleFormModal
        open={modalOpen}
        rule={editingRule}
        onClose={() => { setModalOpen(false); setEditingRule(null); }}
        onSave={handleSave}
        loading={saving}
      />
    </div>
  );
}
