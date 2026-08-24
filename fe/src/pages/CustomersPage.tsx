import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FileText, MessageCircle, Pencil, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCustomerOrder, getCustomerOrders, updateCustomerOrder } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import type { CustomerOrder, CustomerOrderMeta } from "@/types";
import { Pagination } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const emptyMeta: CustomerOrderMeta = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
  totalCustomers: 0,
  totalOrders: 0,
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

function normalizeRows(rows: CustomerOrder[]) {
  return rows.map((row, index) => ({
    No: String(index + 1),
    "Tanggal Masuk": formatDate(row.createdAt),
    Nama: row.nama,
    "Nama Toko": row.nama_toko,
    Alamat: row.alamat,
    "No HP": formatLocalPhone(row.no_hp),
    Orderan: row.orderan,
    "Nomor WhatsApp": formatLocalPhone(row.phone),
    "Update Terakhir": formatDate(row.updatedAt),
    Sales: row.sales_name || "",
  }));
}

function exportPdf(rows: CustomerOrder[]) {
  const normalizedRows = normalizeRows(rows);
  const exportedAt = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Data Customer", 40, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Export ${exportedAt}`, 40, 62);

  autoTable(doc, {
    startY: 82,
    head: [["Nama", "Nama Toko", "Alamat", "No HP", "Orderan", "Update Terakhir"]],
    body: normalizedRows.map((row) => [
      row.Nama,
      row["Nama Toko"],
      row.Alamat,
      row["No HP"],
      row.Orderan,
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
      fillColor: [236, 253, 245],
      textColor: [6, 95, 70],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 120 },
      2: { cellWidth: 95 },
      3: { cellWidth: 80 },
      4: { cellWidth: 240 },
      5: { cellWidth: 95 },
    },
    margin: { left: 40, right: 40 },
  });

  doc.save(`data-customer-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export default function CustomersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerOrder[]>([]);
  const [meta, setMeta] = useState<CustomerOrderMeta>(emptyMeta);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [editing, setEditing] = useState<CustomerOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | null>(null);
  const [autoRefreshMs, setAutoRefreshMs] = useState<number>(() => {
    const raw = localStorage.getItem("customer_auto_refresh_ms");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 10000;
  });

  const load = useCallback((options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    getCustomerOrders({ search, page, limit })
      .then(({ data, meta: nextMeta }) => {
        setCustomers(data);
        setMeta(nextMeta);
      })
      .catch(() => {
        if (!options?.silent) {
          toast.error("Gagal memuat data customer");
        }
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
    if (!autoRefreshMs || autoRefreshMs <= 0) {
      return;
    }

    const pollId = window.setInterval(() => {
      load({ silent: true });
    }, autoRefreshMs);

    return () => window.clearInterval(pollId);
  }, [autoRefreshMs, load]);

  useEffect(() => {
    localStorage.setItem("customer_auto_refresh_ms", String(autoRefreshMs));
  }, [autoRefreshMs]);

  const exportRows = async () => {
    setExporting("pdf");
    try {
      const { data } = await getCustomerOrders({ search, page: 1, limit: 5000 });
      if (data.length === 0) {
        toast.error("Tidak ada data customer untuk diexport");
        return;
      }
      exportPdf(data);
      toast.success("Export PDF diunduh");
    } catch {
      toast.error("Gagal export data customer");
    } finally {
      setExporting(null);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await updateCustomerOrder(editing.id, {
        nama: editing.nama,
        nama_toko: editing.nama_toko,
        alamat: editing.alamat,
        no_hp: editing.no_hp,
        orderan: editing.orderan,
      });
      setCustomers((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setEditing(null);
      toast.success("Data customer diperbarui");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Gagal memperbarui customer");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteCustomerOrder(deleteTarget.id);
      setCustomers((prev) => prev.filter((row) => row.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Data customer dihapus");
      void load({ silent: true });
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Gagal menghapus customer");
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
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Customer</h1>
            <p className="mt-2 text-muted-foreground">Data customer yang sudah beli dari percakapan WhatsApp dan siap diexport.</p>
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
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
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
          placeholder="Cari customer..."
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
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Orderan</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Update</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Memuat data customer...</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Belum ada customer yang tercatat beli</td></tr>
              ) : (
                customers.map((customer) => {
                  const currentSalesId = user?.kode_sales || user?.id;
                  const canManageCustomer = !customer.sales_id || customer.sales_id === currentSalesId;

                  return (
                    <tr key={customer.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">{customer.nama}</td>
                      <td className="px-4 py-3 text-foreground">{customer.nama_toko}</td>
                      <td className="px-4 py-3 text-muted-foreground">{customer.alamat}</td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{customer.no_hp}</td>
                      <td className="max-w-md px-4 py-3 text-foreground">
                        <div className="inline-block rounded-lg bg-muted px-3 py-1.5 text-sm whitespace-pre-line">
                          {customer.orderan || "-"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(customer.updatedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openChat(customer.phone)}
                            title="Follow up WhatsApp"
                            aria-label="Follow up WhatsApp"
                          >
                            <MessageCircle className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditing(customer)}
                            disabled={!canManageCustomer}
                            title={canManageCustomer ? "Edit customer" : "Data ini milik sales lain"}
                            aria-label="Edit customer"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteTarget(customer)}
                            disabled={!canManageCustomer}
                            title={canManageCustomer ? "Hapus customer" : "Data ini milik sales lain"}
                            aria-label="Hapus customer"
                          >
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
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>Rapikan data customer sebelum export atau follow-up sales.</DialogDescription>
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
                <label className="mb-2 block text-sm font-medium">Orderan</label>
                <Textarea
                  value={editing.orderan}
                  onChange={(event) => setEditing({ ...editing, orderan: event.target.value })}
                  rows={6}
                  className="font-mono"
                />
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
            <DialogTitle>Hapus Data Customer?</DialogTitle>
            <DialogDescription>
              Data {deleteTarget?.nama_toko || "customer"} akan dihapus dari menu Customer. Riwayat chat WhatsApp tetap tidak ikut dihapus.
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
