import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FileText, MessageCircle, Pencil, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteDemoRequest, getDemoRequests, updateDemoRequest } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import type { DemoRequest, DemoRequestMeta } from "@/types";
import { Pagination } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const emptyMeta: DemoRequestMeta = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
  totalDemoRequests: 0,
};

const AUTO_REFRESH_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "5 detik", value: 5000 },
  { label: "10 detik", value: 10000 },
  { label: "30 detik", value: 30000 },
  { label: "1 menit", value: 60000 },
  { label: "2 menit", value: 120000 },
];

function formatDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLocalPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("62")) return `0${digits.slice(2)}`;
  if (digits.startsWith("8")) return `0${digits}`;
  if (digits.startsWith("0")) return digits;
  return phone;
}

function normalizeRows(rows: DemoRequest[]) {
  return rows.map((row, index) => ({
    No: String(index + 1),
    "Tanggal Masuk": formatDate(row.createdAt),
    Nama: row.nama,
    "Nama Toko": row.nama_toko,
    Alamat: row.alamat,
    "No HP": formatLocalPhone(row.no_hp),
    Orderan: row.demo_program,
    "Nomor WhatsApp": formatLocalPhone(row.phone),
    "Update Terakhir": formatDate(row.updatedAt),
    Sales: row.sales_name || "",
  }));
}

function exportPdf(rows: DemoRequest[]) {
  const normalizedRows = normalizeRows(rows);
  const exportedAt = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Request Demo", 40, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Export ${exportedAt}`, 40, 62);

  autoTable(doc, {
    startY: 82,
    head: [["Nama", "Nama Toko", "Alamat", "No HP", "Program Demo", "Update Terakhir"]],
    body: normalizedRows.map((row) => [
      row.Nama,
      row["Nama Toko"],
      row.Alamat,
      row["No HP"],
      row["Program Demo"],
      row["Update Terakhir"],
    ]),
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 6,
      overflow: "linebreak",
      valign: "top",
      lineColor: [203, 213, 225],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [239, 246, 255],
      textColor: [29, 78, 216],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 130 },
      2: { cellWidth: 110 },
      3: { cellWidth: 85 },
      4: { cellWidth: 260 },
      5: { cellWidth: 100 },
    },
    margin: { left: 40, right: 40 },
  });

  doc.save(`request-demo-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export default function DemoRequestsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [demoRequests, setDemoRequests] = useState<DemoRequest[]>([]);
  const [meta, setMeta] = useState<DemoRequestMeta>(emptyMeta);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [editing, setEditing] = useState<DemoRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DemoRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | null>(null);
  const [autoRefreshMs, setAutoRefreshMs] = useState<number>(() => {
    const raw = localStorage.getItem("demo_request_auto_refresh_ms");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 10000;
  });

  const load = useCallback((options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    getDemoRequests({ search, page, limit })
      .then(({ data, meta: nextMeta }) => {
        setDemoRequests(data);
        setMeta(nextMeta);
      })
      .catch(() => {
        if (!options?.silent) toast.error("Gagal memuat request demo");
      })
      .finally(() => {
        if (!options?.silent) setLoading(false);
      });
  }, [limit, page, search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => load(), 250);
    return () => window.clearTimeout(timeout);
  }, [load]);

  useEffect(() => {
    if (!autoRefreshMs || autoRefreshMs <= 0) return;
    const pollId = window.setInterval(() => load({ silent: true }), autoRefreshMs);
    return () => window.clearInterval(pollId);
  }, [autoRefreshMs, load]);

  useEffect(() => {
    localStorage.setItem("demo_request_auto_refresh_ms", String(autoRefreshMs));
  }, [autoRefreshMs]);

  const exportRows = async () => {
    setExporting("pdf");
    try {
      const { data } = await getDemoRequests({ search, page: 1, limit: 5000 });
      if (data.length === 0) {
        toast.error("Tidak ada request demo untuk diexport");
        return;
      }
      exportPdf(data);
      toast.success("Export PDF diunduh");
    } catch {
      toast.error("Gagal export request demo");
    } finally {
      setExporting(null);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await updateDemoRequest(editing.id, {
        nama: editing.nama,
        nama_toko: editing.nama_toko,
        alamat: editing.alamat,
        no_hp: editing.no_hp,
        demo_program: editing.demo_program,
      });
      setDemoRequests((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setEditing(null);
      toast.success("Request demo diperbarui");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Gagal memperbarui request demo");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteDemoRequest(deleteTarget.id);
      setDemoRequests((prev) => prev.filter((row) => row.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Request demo dihapus");
      void load({ silent: true });
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Gagal menghapus request demo");
    } finally {
      setSaving(false);
    }
  };

  const openChat = (phone: string) => {
    navigate(`/messages?phone=${encodeURIComponent(phone)}`);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Request Demo</h1>
            <p className="mt-2 text-muted-foreground">Data customer yang meminta demo program dan perlu ditindaklanjuti sales.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">Auto Refresh</span>
              <select
                value={autoRefreshMs}
                onChange={(event) => setAutoRefreshMs(Number(event.target.value))}
                className="rounded-md border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {AUTO_REFRESH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <Button variant="outline" onClick={() => load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportRows} disabled={Boolean(exporting)}>
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>
      </section>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => {
            setPage(1);
            setSearch(event.target.value);
          }}
          className="w-full rounded-lg border bg-card py-2 pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:w-72"
          placeholder="Cari request demo..."
        />
      </div>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Customer</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Toko</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Alamat</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">No HP</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Program Demo</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Update</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Memuat request demo...</td></tr>
              ) : demoRequests.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Belum ada customer yang meminta demo</td></tr>
              ) : (
                demoRequests.map((request) => {
                  const currentSalesId = user?.kode_sales || user?.id;
                  const canManage = !request.sales_id || request.sales_id === currentSalesId;

                  return (
                    <tr key={request.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">{request.nama}</td>
                      <td className="px-4 py-3 text-foreground">{request.nama_toko}</td>
                      <td className="px-4 py-3 text-muted-foreground">{request.alamat}</td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{formatLocalPhone(request.no_hp)}</td>
                      <td className="max-w-md px-4 py-3 text-foreground">
                        <div className="inline-block rounded-lg bg-blue-50 px-3 py-1.5 text-sm text-blue-950 whitespace-pre-line">
                          {request.demo_program || "-"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(request.updatedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openChat(request.phone)} title="Buka chat WhatsApp" aria-label="Buka chat WhatsApp">
                            <MessageCircle className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setEditing(request)} disabled={!canManage} title={canManage ? "Edit request demo" : "Data ini milik sales lain"} aria-label="Edit request demo">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(request)} disabled={!canManage} title={canManage ? "Hapus request demo" : "Data ini milik sales lain"} aria-label="Hapus request demo">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          pageSize={limit}
          disabled={loading}
          onPageChange={setPage}
          onPageSizeChange={(nextLimit) => {
            setLimit(nextLimit);
            setPage(1);
          }}
        />
      </section>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          <DialogHeader>
            <DialogTitle>Edit Request Demo</DialogTitle>
            <DialogDescription>Rapikan data demo sebelum follow-up sales atau export.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">Nama</label>
                  <Input value={editing.nama} onChange={(event) => setEditing({ ...editing, nama: event.target.value })} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Nama Toko</label>
                  <Input value={editing.nama_toko} onChange={(event) => setEditing({ ...editing, nama_toko: event.target.value })} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Alamat</label>
                  <Input value={editing.alamat} onChange={(event) => setEditing({ ...editing, alamat: event.target.value })} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">No HP</label>
                  <Input value={editing.no_hp} onChange={(event) => setEditing({ ...editing, no_hp: event.target.value })} />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Program Demo</label>
                <Textarea value={editing.demo_program} onChange={(event) => setEditing({ ...editing, demo_program: event.target.value })} rows={5} className="font-mono" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Batal</Button>
                <Button onClick={handleSave} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="overflow-hidden p-0">
          <DialogHeader>
            <DialogTitle>Hapus Request Demo?</DialogTitle>
            <DialogDescription>
              Data demo {deleteTarget?.nama_toko || "customer"} akan dihapus dari menu Request Demo. Riwayat chat WhatsApp tetap tidak ikut dihapus.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 p-6">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Batal</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>{saving ? "Menghapus..." : "Hapus"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
