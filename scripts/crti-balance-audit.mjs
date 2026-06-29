import "dotenv/config";
import mysql from "mysql2/promise";
import { Client } from "pg";

const daysArg = Number.parseInt(process.argv[2] || process.env.CRTI_SYNC_DAYS || "120", 10);
const days = Number.isFinite(daysArg) && daysArg > 0 ? daysArg : 120;

const crti = new Client({
  host: process.env.CRTI_HOST,
  port: Number(process.env.CRTI_PORT || 5432),
  database: process.env.CRTI_DATABASE,
  user: process.env.CRTI_USER,
  password: process.env.CRTI_PASSWORD,
  ssl: process.env.CRTI_SSL === "false"
    ? false
    : { rejectUnauthorized: process.env.CRTI_SSL_REJECT_UNAUTHORIZED === "true" },
  connectionTimeoutMillis: 10_000,
  query_timeout: 60_000,
});

await crti.connect();

try {
  const { rows: summaryRows } = await crti.query(
    `
      WITH base AS (
        SELECT
          pedidos.numeropedido::text AS pedido,
          SUM(CASE WHEN UPPER(pedidos.situacaopedido) LIKE 'APROV%' THEN pedidos.quantidadepedido ELSE 0 END)::numeric AS aprovado_qtde,
          SUM(CASE WHEN UPPER(pedidos.situacaopedido) LIKE 'APROV%' THEN pedidos.valortotalitem ELSE 0 END)::numeric AS aprovado_total,
          SUM(CASE WHEN UPPER(pedidos.situacaopedido) LIKE 'CONCLU%' THEN pedidos.quantidadepedido ELSE 0 END)::numeric AS concluido_qtde,
          SUM(CASE WHEN UPPER(pedidos.situacaopedido) LIKE 'CONCLU%' THEN pedidos.valortotalitem ELSE 0 END)::numeric AS concluido_total,
          COALESCE(MAX(saidas.valor_saida), 0)::numeric AS saida_total
        FROM public.pedidos_venda_material pedidos
        LEFT JOIN (
          SELECT numeropedido::text AS pedido, SUM(valortotalliquido)::numeric AS valor_saida
          FROM public.vendas_saida_material_analitico
          WHERE datahorasaida >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
          GROUP BY numeropedido
        ) saidas ON saidas.pedido = pedidos.numeropedido::text
        WHERE UPPER(pedidos.tipopedido) LIKE '%TAPF%'
          AND (UPPER(pedidos.tipopedido) LIKE '%SC%' OR UPPER(pedidos.tipopedido) LIKE '%GRANEL%')
          AND pedidos.datapedido >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
          AND (UPPER(pedidos.situacaopedido) LIKE 'APROV%' OR UPPER(pedidos.situacaopedido) LIKE 'CONCLU%')
        GROUP BY pedidos.numeropedido
      )
      SELECT
        COUNT(*)::int AS total_distintos,
        COUNT(*) FILTER (WHERE GREATEST(aprovado_total - saida_total, 0) > 0)::int AS com_saldo,
        COUNT(*) FILTER (WHERE concluido_qtde > 0)::int AS com_concluido,
        COUNT(*) FILTER (WHERE GREATEST(aprovado_total - saida_total, 0) > 0 AND concluido_qtde > 0)::int AS mistos,
        SUM(GREATEST(aprovado_total - saida_total, 0))::numeric AS saldo_pendente_crti,
        SUM(concluido_total)::numeric AS total_concluido_crti
      FROM base
    `,
    [days],
  );

  const { rows: mixedRows } = await crti.query(
    `
      SELECT
        numeropedido::text AS pedido,
        MAX(nomecliente) AS cliente,
        SUM(CASE WHEN UPPER(situacaopedido) LIKE 'APROV%' THEN quantidadepedido ELSE 0 END)::numeric AS aprovado_qtde,
        SUM(CASE WHEN UPPER(situacaopedido) LIKE 'APROV%' THEN valortotalitem ELSE 0 END)::numeric AS aprovado_total,
        COALESCE(MAX(saidas.valor_saida), 0)::numeric AS saida_total,
        GREATEST(SUM(CASE WHEN UPPER(situacaopedido) LIKE 'APROV%' THEN valortotalitem ELSE 0 END) - COALESCE(MAX(saidas.valor_saida), 0), 0)::numeric AS saldo_pendente,
        SUM(CASE WHEN UPPER(situacaopedido) LIKE 'CONCLU%' THEN quantidadepedido ELSE 0 END)::numeric AS concluido_qtde,
        SUM(CASE WHEN UPPER(situacaopedido) LIKE 'CONCLU%' THEN valortotalitem ELSE 0 END)::numeric AS concluido_total
      FROM public.pedidos_venda_material pedidos
      LEFT JOIN (
        SELECT numeropedido::text AS pedido, SUM(valortotalliquido)::numeric AS valor_saida
        FROM public.vendas_saida_material_analitico
        WHERE datahorasaida >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
        GROUP BY numeropedido
      ) saidas ON saidas.pedido = pedidos.numeropedido::text
      WHERE UPPER(pedidos.tipopedido) LIKE '%TAPF%'
        AND (UPPER(pedidos.tipopedido) LIKE '%SC%' OR UPPER(pedidos.tipopedido) LIKE '%GRANEL%')
        AND pedidos.datapedido >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
        AND (UPPER(pedidos.situacaopedido) LIKE 'APROV%' OR UPPER(pedidos.situacaopedido) LIKE 'CONCLU%')
      GROUP BY numeropedido
      HAVING GREATEST(SUM(CASE WHEN UPPER(situacaopedido) LIKE 'APROV%' THEN valortotalitem ELSE 0 END) - COALESCE(MAX(saidas.valor_saida), 0), 0) > 0
         AND SUM(CASE WHEN UPPER(situacaopedido) LIKE 'CONCLU%' THEN quantidadepedido ELSE 0 END) > 0
      ORDER BY numeropedido
    `,
    [days],
  );

  console.log(`\nResumo CRTI (${days} dias)`);
  console.table(summaryRows);

  console.log("\nPedidos mistos no CRTI (tem parte aprovada e parte concluida)");
  console.table(mixedRows.slice(0, 30));

  if (process.env.DATABASE_URL) {
    const mysqlConnection = await mysql.createConnection(process.env.DATABASE_URL);
    try {
      const [localRows] = await mysqlConnection.query(
        `
          SELECT
            COUNT(*) AS total_local,
            SUM(CASE WHEN status = 'PENDENTE' THEN 1 ELSE 0 END) AS pendentes,
            SUM(CASE WHEN status = 'SAÍDA OK' THEN 1 ELSE 0 END) AS saida_ok,
            SUM(saldo) AS saldo_local
          FROM pedidos
        `,
      );
      console.log("\nResumo MySQL local");
      console.table(localRows);

      if (mixedRows.length > 0) {
        const pedidos = mixedRows.map((row) => row.pedido);
        const [localMixedRows] = await mysqlConnection.query(
          `
            SELECT pedido, cliente, status, qtde, qtdeTapFacil, totalPedido, saldo, percentual
            FROM pedidos
            WHERE pedido IN (${pedidos.map(() => "?").join(",")})
            ORDER BY pedido
          `,
          pedidos,
        );

        console.log("\nComo os pedidos mistos estao no MySQL");
        console.table(localMixedRows);
      }
    } finally {
      await mysqlConnection.end();
    }
  }
} finally {
  await crti.end().catch(() => undefined);
}
