import { Button } from "@/components/ui/button";

export function Header() {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <header className="bg-card border-b border-border px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">System Dashboard</h2>
          <p className="text-sm text-muted-foreground">Real-time monitoring and control</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 px-3 py-1 bg-success/10 border border-success/20 rounded-full">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
            <span className="text-xs text-success font-medium">System Online</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted"
            data-testid="button-refresh"
          >
            <i className="fas fa-sync-alt"></i>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted"
            data-testid="button-notifications"
          >
            <i className="fas fa-bell"></i>
          </Button>
        </div>
      </div>
    </header>
  );
}
