import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";

export function SystemStatusCards() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-muted rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
              <i className="fas fa-plug text-success"></i>
            </div>
            <div className="w-2 h-2 bg-success rounded-full"></div>
          </div>
          <h3 className="text-lg font-semibold mb-1" data-testid="text-active-connections">
            {stats?.activeConnections || 0}
          </h3>
          <p className="text-sm text-muted-foreground">Active WebSocket Connections</p>
          <div className="mt-3 text-xs text-success">
            Real-time connections
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <i className="fas fa-signal text-primary"></i>
            </div>
            <div className="w-2 h-2 bg-success rounded-full"></div>
          </div>
          <h3 className="text-lg font-semibold mb-1" data-testid="text-active-signals">
            {stats?.activeSignals || 0}
          </h3>
          <p className="text-sm text-muted-foreground">Active Trade Signals</p>
          <div className="mt-3 text-xs text-primary">
            Real-time monitoring
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center">
              <i className="fas fa-stream text-warning"></i>
            </div>
            <div className="w-2 h-2 bg-success rounded-full"></div>
          </div>
          <h3 className="text-lg font-semibold mb-1" data-testid="text-kafka-messages">
            {stats?.kafkaMessagesProcessed || 0}
          </h3>
          <p className="text-sm text-muted-foreground">Kafka Messages Processed</p>
          <div className="mt-3 text-xs text-warning">
            Event streaming active
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center">
              <i className="fas fa-database text-destructive"></i>
            </div>
            <div className="w-2 h-2 bg-success rounded-full"></div>
          </div>
          <h3 className="text-lg font-semibold mb-1" data-testid="text-redis-memory">
            {stats?.redisMemoryUsage || "0B"}
          </h3>
          <p className="text-sm text-muted-foreground">Redis Memory Usage</p>
          <div className="mt-3 text-xs text-destructive">
            Cache operational
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
