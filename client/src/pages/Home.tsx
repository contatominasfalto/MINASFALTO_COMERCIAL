import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { withAppBase } from "@/lib/app-base";
import {
  Briefcase,
  Calculator,
  ChevronDown,
  FileText,
  LogOut,
  Menu,
  UserCircle,
  Warehouse,
  Utensils,
  UserCog,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import minasfaltoLogo from "@/assets/minasfalto-logo.jpg";
import cartaoMinasfalto from "@/assets/cartao-minasfalto.png";
import assinaturaMaxwell from "@/assets/assinatura-maxwell.png";
import { usePermissions } from "@/_core/hooks/usePermissions";

type HomeView = "welcome" | "costs";
const HIDDEN_COST_PROFILES = new Set(["comercial", "subcomercial", "semicomercial"]);

function normalizeUserKey(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function MinasfaltoLogo({ compact = false }: { compact?: boolean }) {
  return (
    <img
      src={minasfaltoLogo}
      alt="Minasfalto"
      className={compact ? "home-logo home-logo-compact" : "home-logo"}
    />
  );
}

export default function Home({ view = "welcome" }: { view?: HomeView }) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const permissions = usePermissions();
  const utils = trpc.useUtils();
  const [collapsed, setCollapsed] = useState(false);
  const [commercialOpen, setCommercialOpen] = useState(false);
  const [costsOpen, setCostsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const userProfile = normalizeUserKey((user as { profile?: unknown } | null)?.profile);
  const userName = normalizeUserKey(user?.name);
  const isAdmfull = [userProfile, normalizeUserKey((user as any)?.username), userName].includes("admfull");
  const canAccessCosts = permissions.can("custo_obras", "access");
  const activeView = view === "costs" && canAccessCosts ? "costs" : "welcome";

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
          <MinasfaltoLogo compact={collapsed} />
        </section>

        <nav className="home-menu" aria-label="Menu principal">
          {!collapsed && <span className="home-menu-label">MENU</span>}

          {permissions.can("comercial", "access") && <button
            type="button"
            className="home-menu-trigger"
            onClick={() => setCommercialOpen((current) => !current)}
            title="Comercial"
          >
            <Briefcase size={22} />
            {!collapsed && <span>Comercial</span>}
            {!collapsed && <ChevronDown className={commercialOpen ? "home-chevron open" : "home-chevron"} size={18} />}
          </button>}

          {permissions.can("comercial", "access") && commercialOpen && !collapsed && (
            <div className="home-submenu">
              <button type="button" onClick={() => navigate("/comercial")}>
                Painel Comercial
              </button>
              {permissions.can("estoque", "access") && <button type="button" onClick={() => navigate("/estoque")}>
                <Warehouse size={15} />
                Estoque
              </button>}
            </div>
          )}

          {canAccessCosts && (
            <>
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

            </>
          )}
          {permissions.can("licitacoes", "access") && (
            <button type="button" className="home-menu-trigger" onClick={() => navigate("/licitacoes")} title="Licitações">
              <FileText size={22} />
              {!collapsed && <span>Licitações</span>}
            </button>
          )}
          {permissions.can("alimentacao", "access") && (
            <button type="button" className="home-menu-trigger" onClick={() => navigate("/alimentacao")} title="Controle de Alimentação">
              <Utensils size={22} />
              {!collapsed && <span>Alimentação</span>}
            </button>
          )}
          {permissions.can("compras", "access") && (
            <button type="button" className="home-menu-trigger" onClick={() => navigate("/compras")} title="Controle de Compras">
              <ShoppingCart size={22} />
              {!collapsed && <span>Controle de Compras</span>}
            </button>
          )}
          {permissions.can("usuarios", "access") && (
            <button type="button" className="home-menu-trigger" onClick={() => navigate("/controle-usuarios")} title="Controle de Usuários">
              <UserCog size={22} />
              {!collapsed && <span>Controle de Usuários</span>}
            </button>
          )}
          {isAdmfull && (
            <button type="button" className="home-menu-trigger" onClick={() => navigate("/rastreabilidade")} title="Rastreabilidade">
              <ShieldCheck size={22} />
              {!collapsed && <span>Rastreabilidade</span>}
            </button>
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

        <section className={`home-stage${activeView === "welcome" ? " home-stage-welcome" : ""}`}>
          {activeView === "costs" && (
            <>
              <div className="home-watermark home-watermark-left" />
              <div className="home-watermark home-watermark-right" />
            </>
          )}

          {activeView === "costs" ? (
            <div className="home-center">
              <Calculator className="home-cost-icon" size={74} />
              <h1>CUSTO OBRAS</h1>
              <h2>Painel de Custos</h2>
              <p>Modulo em desenvolvimento.</p>
            </div>
          ) : (
            <>
              <div className="home-welcome-card">
                <img src={cartaoMinasfalto} alt="Minasfalto" />
              </div>
              <img
                src={assinaturaMaxwell}
                alt="Assinatura digital"
                className="home-stage-signature"
              />
            </>
          )}
        </section>
      </section>
    </main>
  );
}
