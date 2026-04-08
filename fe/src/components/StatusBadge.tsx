interface Props {
  status: "disconnected" | "connecting" | "qr_ready" | "authorizing" | "connected";
}

const statusConfig = {
  disconnected: {
    label: "Tidak Terhubung",
    className: "bg-destructive/10 text-destructive",
    dotClassName: "bg-destructive",
  },
  connecting: {
    label: "Menghubungkan",
    className: "bg-secondary text-secondary-foreground",
    dotClassName: "bg-secondary-foreground animate-pulse",
  },
  qr_ready: {
    label: "QR Siap Dipindai",
    className: "bg-amber-100 text-amber-700",
    dotClassName: "bg-amber-500 animate-pulse",
  },
  authorizing: {
    label: "Memverifikasi Login",
    className: "bg-blue-100 text-blue-700",
    dotClassName: "bg-blue-500 animate-pulse",
  },
  connected: {
    label: "Terhubung",
    className: "bg-accent text-accent-foreground",
    dotClassName: "bg-primary animate-pulse-dot",
  },
} as const;

export function StatusBadge({ status }: Props) {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dotClassName}`} />
      {config.label}
    </span>
  );
}
