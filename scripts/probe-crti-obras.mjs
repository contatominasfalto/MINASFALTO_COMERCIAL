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
  query_timeout: 60_000,
});

const normalizeSql = (field) =>
  `TRANSLATE(UPPER(${field}), 'ÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ', 'AAAAEEEIIIOOOOUUUC')`;

await client.connect();

try {
  const typeSummary = await client.query(`
    SELECT
      tipopedido,
      situacaopedido,
      COUNT(DISTINCT numeropedido)::int AS total
    FROM public.pedidos_venda_material
    WHERE ${normalizeSql("tipopedido")} LIKE '%OBRAS%'
       OR ${normalizeSql("tipopedido")} LIKE '%MATERIAL%'
    GROUP BY tipopedido, situacaopedido
    ORDER BY total DESC, tipopedido, situacaopedido
    LIMIT 80
  `);

  const materialObras = await client.query(`
    SELECT
      numeropedido::text,
      datapedido,
      nomecliente,
      situacaopedido,
      tipopedido,
      condicaopagamento,
      emiteboletoautomaticamente,
      descricaomaterial,
      quantidadepedido,
      valorunitario,
      valortotalitem
    FROM public.pedidos_venda_material
    WHERE ${normalizeSql("tipopedido")} LIKE '%MATERIAL%OBRAS%PROPRIAS%'
       OR ${normalizeSql("tipopedido")} LIKE '%MATERIAL%OBRA%PROPRIA%'
       OR ${normalizeSql("tipopedido")} LIKE '%OBRAS%PROPRIAS%'
    ORDER BY datapedido DESC, numeropedido DESC
    LIMIT 20
  `);

  const statusSummary = await client.query(`
    SELECT
      situacaopedido,
      COUNT(DISTINCT numeropedido)::int AS total
    FROM public.pedidos_venda_material
    WHERE ${normalizeSql("tipopedido")} LIKE '%MATERIAL%OBRAS%PROPRIAS%'
       OR ${normalizeSql("tipopedido")} LIKE '%MATERIAL%OBRA%PROPRIA%'
       OR ${normalizeSql("tipopedido")} LIKE '%OBRAS%PROPRIAS%'
    GROUP BY situacaopedido
    ORDER BY total DESC, situacaopedido
  `);

  const aggregateSample = await client.query(`
    WITH saidas AS (
      SELECT
        numeropedido::text AS numeropedido,
        SUM(valortotalliquido) AS valor_saida
      FROM public.vendas_saida_material_analitico
      GROUP BY numeropedido
    )
    SELECT
      pedidos.numeropedido::text AS numeropedido,
      MIN(pedidos.datapedido) AS datapedido,
      MAX(pedidos.nomecliente) AS nomecliente,
      MAX(pedidos.situacaopedido) AS situacaopedido,
      MAX(pedidos.tipopedido) AS tipopedido,
      MAX(pedidos.condicaopagamento) AS condicaopagamento,
      SUM(pedidos.quantidadepedido) AS quantidade_total,
      SUM(pedidos.valortotalitem) AS valor_total,
      COALESCE(MAX(saidas.valor_saida), 0) AS valor_saida,
      CASE
        WHEN ${normalizeSql("MAX(pedidos.situacaopedido)")} IN ('CONCLUIDO', 'CANCELADO') THEN 0
        ELSE GREATEST(SUM(pedidos.valortotalitem) - COALESCE(MAX(saidas.valor_saida), 0), 0)
      END AS saldo_total,
      STRING_AGG(DISTINCT pedidos.descricaomaterial, ' | ') AS materiais
    FROM public.pedidos_venda_material pedidos
    LEFT JOIN saidas ON saidas.numeropedido = pedidos.numeropedido::text
    WHERE (
        ${normalizeSql("pedidos.tipopedido")} LIKE '%MATERIAL%OBRAS%PROPRIAS%'
        OR ${normalizeSql("pedidos.tipopedido")} LIKE '%MATERIAL%OBRA%PROPRIA%'
        OR ${normalizeSql("pedidos.tipopedido")} LIKE '%OBRAS%PROPRIAS%'
      )
      AND ${normalizeSql("pedidos.situacaopedido")} IN ('APROVADO', 'CONCLUIDO', 'CANCELADO')
    GROUP BY pedidos.numeropedido
    ORDER BY MIN(pedidos.datapedido) DESC, pedidos.numeropedido DESC
    LIMIT 10
  `);

  console.log(JSON.stringify({
    typeSummary: typeSummary.rows,
    statusSummary: statusSummary.rows,
    aggregateSample: aggregateSample.rows,
    sample: materialObras.rows,
  }, null, 2));
} finally {
  await client.end();
}
