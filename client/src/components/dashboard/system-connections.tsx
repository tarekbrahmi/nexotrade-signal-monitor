import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function SystemConnections() {
  const { data: connections, isLoading } = useQuery({
    queryKey: ["/api/dashboard/connections"],
    refetchInterval: 10000,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
      case 'subscribed':
      case 'online':
        return 'text-success';
      case 'disconnected':
      case 'offline':
        return 'text-destructive';
      default:
        return 'text-warning';
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'connected':
      case 'subscribed':
      case 'online':
        return 'bg-success';
      case 'disconnected':
      case 'offline':
        return 'bg-destructive';
      default:
        return 'bg-warning';
    }
  };

  return (
    <Card>
      <CardHeader className="p-6 border-b border-border">
        <h3 className="text-lg font-semibold">System Connections</h3>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 border border-border rounded-lg animate-pulse">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-muted rounded-full"></div>
                  <div>
                    <div className="h-4 bg-muted rounded w-32 mb-1"></div>
                    <div className="h-3 bg-muted rounded w-24"></div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-muted rounded-full"></div>
                  <div className="h-3 bg-muted rounded w-16"></div>
                </div>
              </div>
            ))}
          </div>
        ) : connections && connections.length > 0 ? (
          connections.map((connection: any, index: number) => (
            <div key={index} className="flex items-center justify-between p-3 border border-border rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-success/10 rounded-full flex items-center justify-center">
                  <i className={`fas ${
                    connection.type === 'websocket' ? 'fa-wifi' :
                    connection.type === 'kafka' ? 'fa-stream' :
                    connection.type === 'redis' ? 'fa-database' :
                    'fa-server'
                  } text-success text-xs`}></i>
                </div>
                <div>
                  <p className="text-sm font-medium" data-testid={`text-connection-${connection.name.toLowerCase().replace(/\s+/g, '-')}`}>
                    {connection.name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">{connection.host}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${getStatusDot(connection.status)}`}></div>
                <span className={`text-xs ${getStatusColor(connection.status)} capitalize`}>
                  {connection.status}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <i className="fas fa-plug text-2xl mb-2"></i>
            <p>No connection data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
