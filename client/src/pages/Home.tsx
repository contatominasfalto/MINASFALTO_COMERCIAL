import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { withAppBase } from "@/lib/app-base";
import {
  Briefcase,
  Calculator,
  ChevronDown,
  LogOut,
  Menu,
  UserCircle,
  Warehouse,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type HomeView = "welcome" | "costs";

function MinasfaltoMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "home-mark home-mark-compact" : "home-mark"} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

export default function Home({ view = "welcome" }: { view?: HomeView }) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [collapsed, setCollapsed] = useState(false);
  const [commercialOpen, setCommercialOpen] = useState(true);
  const [costsOpen, setCostsOpen] = useState(true);
  const [userOpen, setUserOpen] = useState(false);

  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      window.location.href = withAppBase("/login");
    },
    onError: (error) => toast.error(`Erro ao sair: ${error.message}`),
  });

  return (
    <main className={collapsed ? "home-shell home-shell-collapsed" : "home-shell"}>
      <aside className="home-sidebar">
        <section className="home-brand">
          <MinasfaltoMark compact={collapsed} />
          {!collapsed && <strong>MINASFALTO</strong>}
        </section>

        <nav className="home-menu" aria-label="Menu principal">
          {!collapsed && <span className="home-menu-label">MENU</span>}

          <button
            type="button"
            className="home-menu-trigger"
            onClick={() => setCommercialOpen((current) => !current)}
            title="Comercial"
          >
            <Briefcase size={22} />
            {!collapsed && <span>Comercial</span>}
            {!collapsed && <ChevronDown className={commercialOpen ? "home-chevron open" : "home-chevron"} size={18} />}
          </button>

          {commercialOpen && !collapsed && (
            <div className="home-submenu">
              <button type="button" onClick={() => navigate("/comercial")}>
                Painel Comercial
              </button>
              <button type="button" onClick={() => navigate("/estoque")}>
                <Warehouse size={15} />
                Estoque
              </button>
            </div>
          )}

          <button
            type="button"
            className="home-menu-trigger"
            onClick={() => setCostsOpen((current) => !current)}
            title="Custo Obras"
          >
            <Calculator size={22} />
            {!collapsed && <span>Custo Obras</span>}
            {!collapsed && <ChevronDown className={costsOpen ? "home-chevron open" : "home-chevron"} size={18} />}
          </button>

          {costsOpen && !collapsed && (
            <div className="home-submenu">
              <button type="button" onClick={() => navigate("/custo-obras")}>
                Painel de Custos
              </button>
            </div>
          )}
        </nav>

        <section className="home-user">
          <button
            type="button"
            className="home-user-trigger"
            onClick={() => setUserOpen((current) => !current)}
            title="Usuario"
          >
            <UserCircle size={30} />
            {!collapsed && <span>{user?.name ?? "Usuario"}</span>}
            {!collapsed && <ChevronDown className={userOpen ? "home-chevron open" : "home-chevron"} size={18} />}
          </button>

          {userOpen && !collapsed && (
            <div className="home-user-menu">
              <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
                <LogOut size={16} />
                {logout.isPending ? "Saindo..." : "Sair"}
              </button>
            </div>
          )}
        </section>
      </aside>

      <section className="home-content">
        <header className="home-topbar">
          <button
            type="button"
            className="home-menu-toggle"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <Menu size={28} />
          </button>
        </header>

        <section className="home-stage">
          <div className="home-watermark home-watermark-left" />
          <div className="home-watermark home-watermark-right" />

          {view === "costs" ? (
            <div className="home-center">
              <Calculator className="home-cost-icon" size={74} />
              <h1>CUSTO OBRAS</h1>
              <h2>Painel de Custos</h2>
              <p>Modulo em desenvolvimento.</p>
            </div>
          ) : (
            <div className="home-center">
              <MinasfaltoMark />
              <h1>MINASFALTO</h1>
              <h2>Bem-vindo!</h2>
              <p>Selecione uma opcao no menu ao lado para comecar.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
