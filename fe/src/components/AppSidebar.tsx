import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, MessageSquare, Settings, BookOpen, LogOut, Bot, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dasbor" },
  { to: "/knowledge", icon: BookOpen, label: "Knowledge" },
  { to: "/messages", icon: MessageSquare, label: "Riwayat Chat" },
  { to: "/whatsapp", icon: Settings, label: "WhatsApp" },
];

interface Props {
  onLogout: () => void;
}

export function AppSidebar({ onLogout }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <aside
      className={`sidebar-gradient relative flex h-screen shrink-0 flex-col overflow-hidden text-sidebar-fg shadow-2xl shadow-slate-950/20 transition-all duration-300 ${
        collapsed ? "w-[76px]" : "w-72"
      } sticky top-0`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-white/5" />
      <div className="relative flex items-center gap-3 border-b border-white/10 px-4 py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/25">
          <Bot className="h-5 w-5 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <span className="block truncate text-lg font-extrabold tracking-tight text-sidebar-active-fg">WA Bot</span>
            <span className="block truncate text-xs font-medium text-sidebar-fg/70">Marketing assistant</span>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="relative mx-3 mt-4 rounded-lg border border-white/10 bg-white/[0.06] p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <Sparkles className="h-4 w-4 text-sidebar-active" />
            Knowledge RAG aktif
          </div>
          <p className="mt-1 text-xs leading-5 text-sidebar-fg/75">Jawaban cepat tetap prioritas, LLM bantu saat konteks tersedia.</p>
        </div>
      )}

      <nav className="relative flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const active = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all ${
                active
                  ? "bg-white text-slate-950 shadow-lg shadow-slate-950/20"
                  : "text-sidebar-fg hover:bg-white/10 hover:text-white"
              }`}
            >
              <item.icon className={`h-5 w-5 shrink-0 ${active ? "text-primary" : "text-sidebar-fg/80 group-hover:text-white"}`} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="relative space-y-1 border-t border-white/10 px-3 py-3">
        <button
          onClick={onLogout}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-sidebar-fg transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Keluar</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex min-h-10 w-full items-center justify-center rounded-lg text-sidebar-fg transition-colors hover:bg-white/10 hover:text-white"
          aria-label={collapsed ? "Buka sidebar" : "Tutup sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
