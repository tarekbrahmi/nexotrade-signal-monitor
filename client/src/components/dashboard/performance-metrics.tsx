import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function PerformanceMetrics() {
  const metrics = [
    {
      label: "Signal Processing Time",
      value: "12.3ms avg",
      percentage: 85,
      color: "bg-success"
    },
    {
      label: "WebSocket Latency",
      value: "8.7ms avg",
      percentage: 92,
      color: "bg-primary"
    },
    {
      label: "Memory Efficiency",
      value: "78% usage",
      percentage: 78,
      color: "bg-warning"
    }
  ];

  return (
    <Card>
      <CardHeader className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Performance Metrics</h3>
          <div className="flex items-center space-x-2">
            <Button variant="default" size="sm" className="px-3 py-1 text-xs">
              Last 24h
            </Button>
            <Button variant="ghost" size="sm" className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
              Last 7d
            </Button>
            <Button variant="ghost" size="sm" className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
              Last 30d
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {metrics.map((metric, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{metric.label}</span>
                <span className="text-sm font-medium" data-testid={`text-metric-${metric.label.toLowerCase().replace(/\s+/g, '-')}`}>
                  {metric.value}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className={`${metric.color} h-2 rounded-full transition-all duration-300`}
                  style={{ width: `${metric.percentage}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
