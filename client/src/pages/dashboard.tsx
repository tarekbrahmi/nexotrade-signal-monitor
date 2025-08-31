import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { SystemStatusCards } from "@/components/dashboard/system-status-cards";
import { RecentSignals } from "@/components/dashboard/recent-signals";
import { SystemConnections } from "@/components/dashboard/system-connections";
import { PerformanceMetrics } from "@/components/dashboard/performance-metrics";
import { ActiveChannels } from "@/components/dashboard/active-channels";
import { SystemConfiguration } from "@/components/dashboard/system-configuration";

export default function Dashboard() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header />
        
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <SystemStatusCards />
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecentSignals />
            <SystemConnections />
          </div>
          
          <PerformanceMetrics />
          <ActiveChannels />
          <SystemConfiguration />
        </div>
      </main>
    </div>
  );
}
