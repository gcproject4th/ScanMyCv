import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { UIProvider } from "@/context/UIContext";
import { router } from "@/routes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes fresh window: instant tab switching with zero redundant network requests
      gcTime: 10 * 60 * 1000, // 10 minutes cache retention in memory
    },
  },
});

export default function App() {
  useEffect(() => {
    // Predictive background warm-up: triggers gentle wake-up if backend is cold
    fetch("/api/health", { priority: "low" }).catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <UIProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </UIProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
