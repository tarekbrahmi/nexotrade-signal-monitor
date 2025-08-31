import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export function ActiveChannels() {
  const [filterText, setFilterText] = useState("");
  
  const { data: channels, isLoading } = useQuery({
    queryKey: ["/api/dashboard/channels"],
    refetchInterval: 10000,
  });

  const filteredChannels = channels?.filter((channel: any) =>
    channel.id.toString().includes(filterText)
  ) || [];

  return (
    <Card>
      <CardHeader className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Active Channels</h3>
          <div className="flex items-center space-x-2">
            <div className="relative">
              <Input
                type="text"
                placeholder="Filter channels..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="bg-input border border-border rounded-md px-3 py-1 text-sm pr-8"
                data-testid="input-filter-channels"
              />
              <i className="fas fa-search absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground text-xs"></i>
            </div>
          </div>
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr className="text-left">
              <th className="px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Channel ID
              </th>
              <th className="px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Connected Traders
              </th>
              <th className="px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Active Signals
              </th>
              <th className="px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Last Signal
              </th>
              <th className="px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-4 bg-muted rounded w-8"></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-4 bg-muted rounded w-12"></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-4 bg-muted rounded w-8"></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-4 bg-muted rounded w-20"></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-6 bg-muted rounded w-16"></div>
                  </td>
                </tr>
              ))
            ) : filteredChannels.length > 0 ? (
              filteredChannels.map((channel: any) => (
                <tr key={channel.id} className="hover:bg-muted/50" data-testid={`row-channel-${channel.id}`}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-mono text-sm font-medium">{channel.id}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <i className="fas fa-users text-xs text-muted-foreground"></i>
                      <span className="text-sm">{channel.connectedTraders}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <i className="fas fa-signal text-xs text-primary"></i>
                      <span className="text-sm">{channel.activeSignals}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {channel.lastSignal}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${
                      channel.status === 'active' 
                        ? 'bg-success/10 text-success border-success/20'
                        : 'bg-warning/10 text-warning border-warning/20'
                    }`}>
                      {channel.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                  <i className="fas fa-users text-2xl mb-2"></i>
                  <p>No active channels found</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
