import { useEffect, useState } from "react";
import { MessageSquare, Reply, BookOpen, Zap } from "lucide-react";
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dasbor</h1>
          <p className="text-sm text-muted-foreground">Ringkasan chatbot WhatsApp Anda</p>
        </div>
        {waStatus && <StatusBadge status={waStatus.status} />}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Pesan" value={stats?.totalMessages ?? 0} icon={MessageSquare} trend="+12% dari minggu lalu" />
        <StatCard title="Balas Otomatis" value={stats?.totalAutoReplies ?? 0} icon={Reply} trend="95,3% tingkat respons" />
        <StatCard title="Total Aturan" value={stats?.totalRules ?? 0} icon={BookOpen} />
        <StatCard title="Aturan Aktif" value={stats?.activeRules ?? 0} icon={Zap} />
      </div>

      {waStatus && (
        <div className="mt-6 rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-card-foreground mb-3">Koneksi WhatsApp</h2>
          <div className="flex items-center gap-4">
            <StatusBadge status={waStatus.status} />
            {waStatus.phone && <span className="text-sm text-muted-foreground">Telepon: {waStatus.phone}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
