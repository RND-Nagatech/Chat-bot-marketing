import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import type { User } from "@/types";

interface Props {
  onLogout: () => void;
  user?: User | null;
}

export function DashboardLayout({ onLogout, user }: Props) {
  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-transparent">
      <div className="subtle-grid pointer-events-none absolute inset-x-0 top-0 h-80" />
      <AppSidebar onLogout={onLogout} user={user} />
      <main className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
