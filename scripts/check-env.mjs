import "dotenv/config";

const required = ["DATABASE_URL", "JWT_SECRET"];
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(`Variaveis obrigatorias ausentes: ${missing.join(", ")}`);
  process.exit(1);
}

let databaseUrl;
try {
  databaseUrl = new URL(process.env.DATABASE_URL);
} catch {
  console.error("DATABASE_URL invalida. Use o formato mysql://usuario:senha@host:3306/banco");
  process.exit(1);
}

if (!["mysql:", "mysql2:"].includes(databaseUrl.protocol)) {
  console.error(`DATABASE_URL deve usar MySQL. Protocolo atual: ${databaseUrl.protocol}`);
  process.exit(1);
}

if (!databaseUrl.username || !databaseUrl.password || !databaseUrl.hostname || !databaseUrl.pathname.slice(1)) {
  console.error("DATABASE_URL precisa conter usuario, senha, host e nome do banco.");
  process.exit(1);
}

const localLoginVars = [
  "LOCAL_LOGIN_ADMFULL",
  "LOCAL_LOGIN_COMERCIAL",
  "LOCAL_LOGIN_SUBCOMERCIAL",
  "LOCAL_LOGIN_GERENCIA",
  "LOCAL_LOGIN_DIRETORIA",
];

const hasLocalLogin = localLoginVars.some((name) => Boolean(process.env[name]));
if (!hasLocalLogin && !process.env.OAUTH_SERVER_URL) {
  console.warn("Aviso: nenhum login local ou OAuth foi configurado.");
}

console.log("Ambiente OK:");
console.log(`- Banco: ${databaseUrl.pathname.slice(1)}`);
console.log(`- Usuario: ${decodeURIComponent(databaseUrl.username)}`);
console.log(`- Host: ${databaseUrl.hostname}:${databaseUrl.port || "3306"}`);
console.log(`- Login local: ${hasLocalLogin ? "configurado" : "nao configurado"}`);
