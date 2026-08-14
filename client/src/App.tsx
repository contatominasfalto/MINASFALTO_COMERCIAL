import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import StockPage from "@/pages/Stock";
import Login from "@/pages/Login";
import CustoObras from "@/pages/CustoObras";
import Licitacoes from "@/pages/Licitacoes";
import Alimentacao from "@/pages/Alimentacao";
import ControleUsuarios from "@/pages/ControleUsuarios";
import { Route, Router as WouterRouter, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Spinner } from "@/components/ui/spinner";
import { appBasePath } from "@/lib/app-base";
import { StockProvider } from "@/contexts/StockContext";
import "./stock.css";
import { useEffect, useRef } from "react";
import LicitacaoPregaoAlert from "@/components/LicitacaoPregaoAlert";
import { usePermissions } from "@/_core/hooks/usePermissions";

const SESSION_STORAGE_KEY = "minasfalto_active_session";
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const HIDDEN_COST_PROFILES = new Set(["comercial", "subcomercial", "semicomercial"]);

function normalizeUserKey(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

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
  const { user, isAuthenticated, loading, logout } = useAuth();
  const permissions = usePermissions();

  useSessionLifecycle(isAuthenticated, loading, logout);

  if (loading || (isAuthenticated && permissions.isLoading)) {
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

  const canAccessCosts = permissions.can("custo_obras", "access");
  const denied = <main className="users-denied"><h1>Acesso negado</h1><p>Você não possui permissão para acessar este módulo.</p></main>;

  return (
    <>
      {permissions.can("licitacoes", "access") && <LicitacaoPregaoAlert />}
      <Switch>
      <Route path={"/"}>
        {permissions.can("inicio", "access") ? <Home /> : denied}
      </Route>
      <Route path={"/comercial"}>{permissions.can("comercial", "access") ? <Dashboard /> : denied}</Route>
      <Route path={"/custo-obras"}>{canAccessCosts ? <CustoObras /> : denied}</Route>
      <Route path={"/licitacoes"}>
        {permissions.can("licitacoes", "access") ? <Licitacoes /> : denied}
      </Route>
      <Route path={"/alimentacao"}>
        {permissions.can("alimentacao", "access") ? <Alimentacao /> : denied}
      </Route>
      <Route path={"/estoque"}>
        {permissions.can("estoque", "access") ? <StockProvider>
          <StockPage />
        </StockProvider> : denied}
      </Route>
      <Route path={"/controle-usuarios"}>{permissions.master ? <ControleUsuarios /> : denied}</Route>
      <Route path={"/login"}>
        <Home />
      </Route>
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
      </Switch>
    </>
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
