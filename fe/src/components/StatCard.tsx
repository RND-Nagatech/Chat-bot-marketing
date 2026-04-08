import type { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  color?: string;
}

export function StatCard({ title, value, icon: Icon, trend, color = "primary" }: Props) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-accent`}>
          <Icon className="h-4 w-4 text-accent-foreground" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-card-foreground">{value.toLocaleString()}</p>
      {trend && <p className="mt-1 text-xs text-muted-foreground">{trend}</p>}
    </div>
  );
}
