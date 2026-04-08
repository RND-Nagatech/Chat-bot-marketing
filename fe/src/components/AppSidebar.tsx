import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, MessageSquare, Settings, BookOpen, LogOut, Bot, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dasbor" },
  { to: "/rules", icon: BookOpen, label: "Aturan" },
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
      className={`sidebar-gradient flex flex-col text-sidebar-fg transition-all duration-300 ${
        collapsed ? "w-[68px]" : "w-64"
      } h-screen shrink-0 sticky top-0`}
    >
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-hover">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Bot className="h-5 w-5 text-primary-foreground" />
        </div>
        {!collapsed && <span className="text-lg font-bold text-sidebar-active-fg tracking-tight">WA Bot</span>}
      </div>

      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map((item) => {
          const active = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-primary/20 text-sidebar-active-fg"
                  : "hover:bg-sidebar-hover text-sidebar-fg"
              }`}
            >
              <item.icon className={`h-5 w-5 shrink-0 ${active ? "text-sidebar-active" : ""}`} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="px-2 pb-2 space-y-1">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-fg hover:bg-sidebar-hover transition-colors"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Keluar</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center py-2 rounded-lg text-sidebar-fg hover:bg-sidebar-hover transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
