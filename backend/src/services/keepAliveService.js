import { ENV } from "../config/ENV.js";

const PING_INTERVAL_MS = 12 * 60 * 1000; // 12 minutes (Render idle timeout is 15 minutes)
let timer = null;

/**
 * Periodically pings the public health check endpoint to prevent Render
 * free tier instances from entering cold sleep due to inactivity.
 */
export const startKeepAlive = () => {
  if (!ENV.isProd) {
    return;
  }

  const healthUrl = `${ENV.apiUrl}/api/health`;

  const ping = async () => {
    try {
      const response = await fetch(healthUrl, {
        headers: { "User-Agent": "ScanMyCv-KeepAlive/1.0" },
      });
      if (response.ok) {
        const data = await response.json();
        console.log(`[KeepAlive] Heartbeat success: uptime=${data.uptime}s, db=${data.db}`);
      } else {
        console.warn(`[KeepAlive] Heartbeat returned HTTP ${response.status}`);
      }
    } catch (err) {
      console.warn(`[KeepAlive] Heartbeat ping failed (non-fatal):`, err.message);
    }
  };

  // Initial delayed ping 2 minutes after startup
  const initialDelay = setTimeout(ping, 2 * 60 * 1000);
  if (initialDelay.unref) {
    initialDelay.unref();
  }

  // Periodic recurring ping every 12 minutes
  timer = setInterval(ping, PING_INTERVAL_MS);
  if (timer.unref) {
    timer.unref();
  }

  console.log(`[KeepAlive] Service active. Pinging ${healthUrl} every 12 minutes.`);
};

export const stopKeepAlive = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};
