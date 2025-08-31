module.exports = {
  apps: [
    {
      name: "nexotrade-signal-monitor",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      env_production: { NODE_ENV: "production" },
      watch: false,
      ignore_watch: ["node_modules"],
      max_memory_restart: "1G",
    },
  ],
};
