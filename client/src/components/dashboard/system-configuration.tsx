import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function SystemConfiguration() {
  const { toast } = useToast();
  
  const { data: config, isLoading } = useQuery({
    queryKey: ["/api/dashboard/config"],
  });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: "Configuration value copied successfully",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="p-6 border-b border-border">
          <h3 className="text-lg font-semibold">Environment Configuration</h3>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/2"></div>
                <div className="h-10 bg-muted rounded"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const configurations = [
    {
      label: "Market Data WebSocket URL",
      value: config?.marketDataWebsocketUrl || "",
      testId: "market-data-url"
    },
    {
      label: "Kafka Broker URL", 
      value: config?.kafkaBrokerUrl || "",
      testId: "kafka-broker-url"
    },
    {
      label: "Redis URL",
      value: config?.redisUrl || "",
      testId: "redis-url"
    },
    {
      label: "MySQL Database",
      value: config?.mysqlDatabase || "",
      testId: "mysql-database"
    }
  ];

  return (
    <Card>
      <CardHeader className="p-6 border-b border-border">
        <h3 className="text-lg font-semibold">Environment Configuration</h3>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {configurations.map((item, index) => (
            <div key={index}>
              <Label className="block text-sm font-medium mb-2">{item.label}</Label>
              <div className="relative">
                <Input
                  type="text"
                  value={item.value}
                  className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm font-mono pr-10"
                  readOnly
                  data-testid={`input-${item.testId}`}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(item.value)}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                  data-testid={`button-copy-${item.testId}`}
                >
                  <i className="fas fa-copy text-xs"></i>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
