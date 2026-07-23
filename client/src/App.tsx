import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import StockPage from "@/pages/Stock";
import Login from "@/pages/Login";
import CustoObras from "@/pages/CustoObras";
import { Route, Router as WouterRouter, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Spinner } from "@/components/ui/spinner";
import { appBasePath } from "@/lib/app-base";
import { StockProvider } from "@/contexts/StockContext";
import "./stock.css";
import { useEffect, useRef } from "react";

const SESSION_STORAGE_KEY = "minasfalto_active_session";
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

function useSessionLifecycle(isAuthenticated: boolean, loading: boolean, logout: () => Promise<void>) {
  const logoutRef = useRef(logout);

  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  useEffect(() => {
    if (loading || !isAuthenticated) return;

    if (!sessionStorage.getItem(SESSION_STORAGE_KEY)) {
      void logoutRef.current().finally(() => {
        window.location.href = appBasePath ? `${appBasePath}/login` : "/login";
      });
      return;
    }

    let timeoutId: number | undefined;
    const logoutByInactivity = () => {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      void logoutRef.current().finally(() => {
        window.location.href = appBasePath ? `${appBasePath}/login` : "/login";
      });
    };
    const resetTimer = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(logoutByInactivity, INACTIVITY_TIMEOUT_MS);
    };
    const events = ["click", "keydown", "mousemove", "scroll", "touchstart", "visibilitychange"];

    events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [isAuthenticated, loading]);
}

function Router() {
  const { isAuthenticated, loading, logout } = useAuth();

  useSessionLifecycle(isAuthenticated, loading, logout);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path={"/login"} component={Login} />
        <Route component={Login} />
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path={"/"}>
        <Home />
      </Route>
      <Route path={"/comercial"} component={Dashboard} />
      <Route path={"/custo-obras"} component={CustoObras} />
      <Route path={"/estoque"}>
        <StockProvider>
          <StockPage />
        </StockProvider>
      </Route>
      <Route path={"/login"}>
        <Home />
      </Route>
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <WouterRouter base={appBasePath || undefined}>
            <Router />
          </WouterRouter>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
