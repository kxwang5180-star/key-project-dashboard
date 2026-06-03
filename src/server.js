import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`key-project-dashboard listening on http://0.0.0.0:${config.port}`);
});

function gracefulShutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log("Prisma disconnected, server stopped.");
    } catch (error) {
      console.error("Error during shutdown:", error);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
