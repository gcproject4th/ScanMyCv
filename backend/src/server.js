import mongoose from "mongoose";
import app from "./app.js";
import connectDB from "./config/dpconfig.js";
import { ENV } from "./config/ENV.js";
import { startKeepAlive, stopKeepAlive } from "./services/keepAliveService.js";

const PORT = ENV.port;
let httpServer = null;
let isShuttingDown = false;

const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Server] Received ${signal}. Closing HTTP server and DB connection...`);

  stopKeepAlive();

  const forceTimer = setTimeout(() => {
    console.error("[Server] Forced shutdown after timeout.");
    process.exit(1);
  }, 10000);
  forceTimer.unref();

  try {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    clearTimeout(forceTimer);
    console.log("[Server] Graceful shutdown complete.");
    process.exit(0);
  } catch (err) {
    console.error("[Server] Error during shutdown:", err);
    process.exit(1);
  }
};

const startServer = async () => {
  try {
    await connectDB();
    httpServer = app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
      startKeepAlive();
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

startServer();

export default app;
