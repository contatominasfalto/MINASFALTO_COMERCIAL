import "dotenv/config";
import { Client } from "pg";

const client = new Client({
  host: process.env.CRTI_HOST,
  port: Number(process.env.CRTI_PORT || 5432),
  database: process.env.CRTI_DATABASE,
  user: process.env.CRTI_USER,
  password: process.env.CRTI_PASSWORD,
  ssl: { rejectUnauthorized: process.env.CRTI_SSL_REJECT_UNAUTHORIZED === "true" },
  connectionTimeoutMillis: 10_000,
});

await client.connect();

try {
  const pedidos = await client.query(`
    SELECT tipopedido, situacaopedido, COUNT(DISTINCT numeropedido)::int AS total
    FROM public.pedidos_venda_material
    WHERE datapedido >= CURRENT_DATE - INTERVAL '90 day'
      AND TRANSLATE(UPPER(tipopedido), 'ÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ', 'AAAAEEEIIIOOOOUUUC') LIKE '%TAPFACIL%'
    GROUP BY tipopedido, situacaopedido
    ORDER BY total DESC
  `);

  const saidas = await client.query(`
    SELECT situacao, COUNT(DISTINCT pedido)::int AS total
    FROM public.crti_pedidos
    WHERE data >= CURRENT_DATE - INTERVAL '90 day'
      AND TRANSLATE(UPPER(material), 'ÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ', 'AAAAEEEIIIOOOOUUUC') LIKE '%TAPFACIL%'
    GROUP BY situacao
    ORDER BY total DESC
  `);

  console.log(JSON.stringify({ pedidos_venda_material: pedidos.rows, crti_pedidos: saidas.rows }, null, 2));
} finally {
  await client.end();
}
