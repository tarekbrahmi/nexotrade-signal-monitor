import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function RecentSignals() {
  const { data: signals, isLoading } = useQuery({
    queryKey: ["/api/dashboard/signals/recent"],
    refetchInterval: 10000,
  });

  return (
    <Card>
      <CardHeader className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Recent Trade Signals</h3>
          <Button variant="link" className="text-xs text-primary hover:text-primary/80 p-0">
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 border border-border rounded-lg animate-pulse">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-muted rounded-full"></div>
                  <div>
                    <div className="h-4 bg-muted rounded w-20 mb-1"></div>
                    <div className="h-3 bg-muted rounded w-16"></div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="h-4 bg-muted rounded w-12 mb-1"></div>
                  <div className="h-3 bg-muted rounded w-16"></div>
                </div>
              </div>
            ))}
          </div>
        ) : signals && signals.length > 0 ? (
          signals.slice(0, 3).map((signal: any) => (
            <div key={signal.uuid} className="flex items-center justify-between p-3 border border-border rounded-lg">
              <div className="flex items-center space-x-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  signal.signalType === 'buy' ? 'bg-success/10' : 'bg-destructive/10'
                }`}>
                  <i className={`fas ${signal.signalType === 'buy' ? 'fa-arrow-up text-success' : 'fa-arrow-down text-destructive'} text-xs`}></i>
                </div>
                <div>
                  <p className="font-mono text-sm font-medium" data-testid={`text-signal-asset-${signal.uuid}`}>
                    {signal.assetSymbol}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Channel {signal.channelId} • {signal.signalType.toUpperCase()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-sm font-medium ${signal.signalType === 'buy' ? 'text-success' : 'text-destructive'}`}>
                  {signal.status === 'active' ? 'ACTIVE' : signal.status.toUpperCase()}
                </p>
                <p className="text-xs text-muted-foreground">
                  Entry: ${parseFloat(signal.entryPrice).toFixed(2)}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <i className="fas fa-signal text-2xl mb-2"></i>
            <p>No recent signals available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
