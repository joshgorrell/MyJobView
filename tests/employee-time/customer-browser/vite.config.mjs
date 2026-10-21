import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
const root = path.dirname(new URL(import.meta.url).pathname);
export default defineConfig({
  root,
  plugins: [
    {
      name: "customer-time-fixtures",
      enforce: "pre",
      resolveId(source) {
        if (
          [
            "/lib/supabase",
            "/contexts/AuthContext",
            "/hooks/useEmployeeTimePolicy",
            "/lib/timezoneUtils",
            "/lib/feedback",
            "/lib/gpsTracking",
            "/lib/offlineSupport",
            "/Production/WorkOrderTimeControl",
            "/Layout/MobileClockRedirect",
          ].some((s) => source.endsWith(s))
        )
          return path.join(root, "mock.tsx");
      },
    },
    react(),
  ],
  server: { host: "127.0.0.1", port: 5192, strictPort: true },
});
