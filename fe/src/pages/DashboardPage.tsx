import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, Reply, BookOpen, Database, Activity, ArrowUpRight, Wifi } from "lucide-react";
import { getDashboardStats, getWAStatus } from "@/services/api";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import type { DashboardStats, WAStatus } from "@/types";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [waStatus, setWaStatus] = useState<WAStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDashboardStats(), getWAStatus()]).then(([s, w]) => {
      setStats(s);
      setWaStatus(w);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="surface-panel overflow-hidden rounded-lg p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-muted/60 px-3 py-1 text-xs font-semibold text-muted-foreground">
              <Activity className="h-3.5 w-3.5 text-primary" />
              Live workspace
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Dasbor</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Pantau performa bot WhatsApp, status koneksi, dan aktivitas auto-reply marketing dari satu tempat.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {waStatus && <StatusBadge status={waStatus.status} />}
            <Link
              to="/knowledge"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:opacity-95"
            >
              Kelola Knowledge
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Pesan" value={stats?.totalMessages ?? 0} icon={MessageSquare} trend="+12% dari minggu lalu" color="info" />
        <StatCard title="Balas Otomatis" value={stats?.totalAutoReplies ?? 0} icon={Reply} trend="95,3% tingkat respons" />
        <StatCard title="Total Knowledge" value={stats?.totalKnowledge ?? 0} icon={BookOpen} color="accent" />
        <StatCard title="Knowledge Indexed" value={stats?.indexedKnowledge ?? 0} icon={Database} />
      </div>

      {waStatus && (
        <div className="surface-panel rounded-lg p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-card-foreground">Koneksi WhatsApp</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {waStatus.phone ? `Terhubung ke nomor ${waStatus.phone}` : "Hubungkan WhatsApp untuk mulai menerima pesan customer."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Wifi className="h-5 w-5" />
              </div>
              <StatusBadge status={waStatus.status} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
