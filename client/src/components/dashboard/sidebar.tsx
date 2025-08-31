import { useState } from "react";

export function Sidebar() {
  const [activeItem, setActiveItem] = useState("Dashboard");

  const menuItems = [
    { icon: "fas fa-tachometer-alt", label: "Dashboard", active: true },
    { icon: "fas fa-signal", label: "Active Signals" },
    { icon: "fas fa-plug", label: "Connections" },
    { icon: "fas fa-database", label: "Redis Cache" },
    { icon: "fas fa-stream", label: "Kafka Events" },
    { icon: "fas fa-cog", label: "Configuration" },
    { icon: "fas fa-file-alt", label: "Logs" },
  ];

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <i className="fas fa-chart-line text-primary-foreground text-sm"></i>
          </div>
          <div>
            <h1 className="text-lg font-semibold">Trade Signal Monitor</h1>
            <p className="text-xs text-muted-foreground">v1.0.0</p>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.label}
            onClick={() => setActiveItem(item.label)}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-left transition-colors ${
              activeItem === item.label
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <i className={`${item.icon} w-4`}></i>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      
      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
            <i className="fas fa-user text-muted-foreground text-xs"></i>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">System Admin</p>
            <p className="text-xs text-muted-foreground">admin@nexotrade.net</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
