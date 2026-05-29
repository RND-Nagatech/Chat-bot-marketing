import type { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  color?: string;
}

export function StatCard({ title, value, icon: Icon, trend, color = "primary" }: Props) {
  const toneClass = color === "accent"
    ? "bg-accent text-accent-foreground"
    : color === "info"
      ? "bg-info/10 text-info"
      : "bg-primary/10 text-primary";

  return (
    <div className="surface-panel group rounded-lg p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">{title}</p>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-3xl font-extrabold tracking-tight text-card-foreground">{value.toLocaleString()}</p>
      {trend && <p className="mt-2 text-xs font-medium text-muted-foreground">{trend}</p>}
    </div>
  );
}
