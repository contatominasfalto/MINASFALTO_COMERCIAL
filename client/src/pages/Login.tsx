import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { withAppBase } from "@/lib/app-base";
import minasfaltoLogo from "@/assets/minasfalto-logo.jpg";

function MinasfaltoLogo() {
  return (
    <img
      src={minasfaltoLogo}
      alt="Minasfalto"
      className="login-logo"
    />
  );
}

export default function Login() {
  const utils = trpc.useUtils();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { data: authConfig } = trpc.auth.config.useQuery(undefined, {
    retry: false,
  });

  const localLogin = trpc.auth.localLogin.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      window.location.href = withAppBase("/");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    localLogin.mutate({ username, password });
  };

  const showLocalLogin = authConfig?.localLoginEnabled ?? true;
  const showOAuthLogin = authConfig?.oauthEnabled ?? false;

  return (
    <main className="login-shell">
      <section className="login-card" aria-label="Acesso ao Sistema">
        <aside className="login-brand">
          <MinasfaltoLogo />
          <div className="login-product">
            <b>Controle Comercial</b>
            <span>Pedidos de Vendas</span>
          </div>
          <small>v1.0  •  2026</small>
        </aside>

        <section className="login-panel">
          <h1>Acesso ao Sistema</h1>

          {showLocalLogin && (
            <form className="login-form" onSubmit={handleSubmit}>
              <label htmlFor="username">Usuário</label>
              <input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoFocus
              />

              <label htmlFor="password">Senha</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />

              <button type="submit" disabled={localLogin.isPending}>
                {localLogin.isPending ? "Entrando..." : "Entrar"}
              </button>
            </form>
          )}

          {showOAuthLogin && (
            <button className="login-oauth" type="button" onClick={() => window.location.href = getLoginUrl()}>
              Entrar com login corporativo
            </button>
          )}

          {!showLocalLogin && !showOAuthLogin && (
            <p className="login-warning">
              Nenhum método de login está configurado. Configure LOCAL_LOGIN_USER/LOCAL_LOGIN_PASSWORD ou OAuth.
            </p>
          )}
        </section>

        <footer className="login-footer">© 2026 Minasfalto — Uso interno</footer>
      </section>
    </main>
  );
}
