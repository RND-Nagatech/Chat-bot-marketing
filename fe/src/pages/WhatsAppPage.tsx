import { useCallback, useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { getWAStatus, getWAQR, connectWA, disconnectWA, reconnectWA, refreshWAQR } from "@/services/api";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import type { WAStatus } from "@/types";

export default function WhatsAppPage() {
  const [status, setStatus] = useState<WAStatus | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const pollingRef = useRef<number | null>(null);
  const pairingInProgressRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const hadQrRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const loadStatus = useCallback(async (options?: { keepSpinner?: boolean }) => {
    try {
      const s = await getWAStatus();
      setStatus(s);

      if (s.status === "qr_ready" && s.qr_available) {
        const qrUrl = await getWAQR();
        setQr(qrUrl);
        hadQrRef.current = true;
        reconnectAttemptRef.current = 0;
      } else if (s.status !== "qr_ready") {
        setQr(null);
      }

      if (s.status === "connected") {
        pairingInProgressRef.current = false;
        hadQrRef.current = false;
        reconnectAttemptRef.current = 0;
        stopPolling();
      } else if (s.status === "disconnected" && pairingInProgressRef.current && s.last_error) {
        if (reconnectAttemptRef.current < 2) {
          reconnectAttemptRef.current += 1;
          await reconnectWA();
        } else {
          pairingInProgressRef.current = false;
          stopPolling();
        }
      } else if (s.status === "disconnected" && !pairingInProgressRef.current) {
        stopPolling();
      }
    } finally {
      if (options?.keepSpinner !== false) {
        setLoading(false);
      }
    }
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    if (pollingRef.current !== null) return;

    pollingRef.current = window.setInterval(() => {
      void loadStatus({ keepSpinner: false });
    }, 1000);
  }, [loadStatus]);

  const handleRefreshQR = useCallback(async (showToast = true) => {
    if (!status || status.status !== "qr_ready") {
      await loadStatus({ keepSpinner: false });
      return;
    }

    setActionLoading(true);
    try {
      pairingInProgressRef.current = true;
      await refreshWAQR();
      setQr(null);
      startPolling();
      await loadStatus({ keepSpinner: false });
      if (showToast) {
        toast.success("QR code sedang diperbarui.");
      }
    } catch {
      if (showToast) {
        toast.error("Gagal memperbarui QR code");
      }
    } finally {
      setActionLoading(false);
    }
  }, [loadStatus, startPolling, status]);

  useEffect(() => {
    void loadStatus();

    return () => {
      stopPolling();
    };
  }, [loadStatus, stopPolling]);

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      pairingInProgressRef.current = true;
      await connectWA();
      startPolling();
      await loadStatus({ keepSpinner: false });
      toast.success("Proses koneksi dimulai. Silakan scan QR saat muncul.");
    } catch {
      pairingInProgressRef.current = false;
      toast.error("Koneksi gagal");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setActionLoading(true);
    try {
      pairingInProgressRef.current = false;
      hadQrRef.current = false;
      reconnectAttemptRef.current = 0;
      await disconnectWA();
      stopPolling();
      setQr(null);
      setStatus({ status: "disconnected", qr_available: false });
      toast.success("WhatsApp terputus");
    } catch {
      toast.error("Gagal memutuskan");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Pengaturan WhatsApp</h1>
        <p className="text-sm text-muted-foreground">Kelola koneksi WhatsApp Anda</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-card-foreground mb-4">Status Koneksi</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <StatusBadge status={status?.status ?? "disconnected"} />
            </div>
            {status?.phone && (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-card-foreground">Telepon:</span> {status.phone}
              </div>
            )}
            {status?.status === "connecting" && (
              <p className="text-sm text-muted-foreground">
                {hadQrRef.current
                  ? "Sedang memproses penyambungan WhatsApp Anda..."
                  : "Sedang menyambungkan ke WhatsApp dan menunggu QR code dibuat."}
              </p>
            )}
            {status?.status === "qr_ready" && (
              <p className="text-sm text-muted-foreground">
                QR code siap. Silakan pindai dari WhatsApp di ponsel Anda.
              </p>
            )}
            {status?.status === "authorizing" && (
              <p className="text-sm text-muted-foreground">
                QR sudah dipindai. Sedang proses penyambungan akun WhatsApp Anda.
              </p>
            )}
            {status?.status === "disconnected" && status?.last_error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {status.last_error}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              {status?.status === "connected" || status?.status === "connecting" || status?.status === "qr_ready" ? (
                <button
                  onClick={handleDisconnect}
                  disabled={actionLoading}
                  className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <WifiOff className="h-4 w-4" />
                  {actionLoading ? "Memutuskan..." : "Putuskan"}
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={actionLoading}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Wifi className="h-4 w-4" />
                  {actionLoading ? "Menghubungkan..." : "Hubungkan"}
                </button>
              )}
              <button
                onClick={() => void (status?.status === "qr_ready"
                  ? handleRefreshQR()
                  : loadStatus({ keepSpinner: false }))}
                disabled={actionLoading}
                className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                {status?.status === "qr_ready" ? "Segarkan QR" : "Segarkan"}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-card-foreground mb-4">Kode QR</h2>
          {qr ? (
            <div className="flex flex-col items-center gap-4">
              <img src={qr} alt="Kode QR WhatsApp" className="h-64 w-64 rounded-lg border" />
              <p className="text-sm text-muted-foreground text-center">
                Pindai kode QR ini dengan WhatsApp di ponsel Anda.
              </p>
            </div>
          ) : status?.status === "connecting" ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4" />
              <p className="text-sm text-center">
                {hadQrRef.current
                  ? "Sedang memverifikasi proses scan di perangkat..."
                  : "Sedang menyiapkan QR code WhatsApp..."}
              </p>
            </div>
          ) : status?.status === "authorizing" ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4" />
              <p className="text-sm text-center">Sedang memverifikasi login dari scan perangkat...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Wifi className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">
                {status?.status === "connected" ? "Sudah terhubung" : "Klik Hubungkan untuk membuat kode QR"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
