import app from "./app.js";
import connectDB from "./config/dpconfig.js";
import { ENV } from "./config/ENV.js";
import { startKeepAlive } from "./services/keepAliveService.js";

const PORT = ENV.port;

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
      startKeepAlive();
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

startServer();

export default app;
