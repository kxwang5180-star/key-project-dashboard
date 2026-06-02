module.exports = {
  apps: [
    {
      name: "key-project-dashboard",
      script: "src/server.js",
      cwd: "/srv/key-project-dashboard",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
