import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";

interface Props {
  onLogout: () => void;
}

export function DashboardLayout({ onLogout }: Props) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar onLogout={onLogout} />
      <main className="min-h-0 flex-1 overflow-y-auto p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
