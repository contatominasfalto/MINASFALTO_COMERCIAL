import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import { novoLicitacaoItem, lerLicitacaoItens } from "../shared/licitacao-itens";
import { createLicitacao, updateLicitacao, listLicitacoes, getMysqlPool } from "./db";

// Somente banco descartável preparado para este teste; nunca usar a base operacional.
const testUrl = process.env.LICITACAO_ITENS_TEST_DATABASE_URL;
describe.skipIf(!testUrl)("persistência de itens em MySQL/MariaDB isolado", () => {
  let connection: Connection;
  const ids: number[] = [];
  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/codex_licitacao_itens_test" || url.port !== "33317")
      throw new Error("Os testes exigem a instância isolada na porta 33317.");
    process.env.DATABASE_URL = testUrl!;
    connection = await mysql.createConnection(testUrl!);
  });
  afterAll(async () => {
    if (connection) {
      for (const id of ids) await connection.query("DELETE FROM licitacoes WHERE id = ?", [id]);
      await connection.end();
      await (await getMysqlPool()).end();
    }
  });
  const read = async (id: number) => {
    const [rows] = await connection.query<RowDataPacket[]>("SELECT * FROM licitacoes WHERE id = ?", [id]);
    return rows[0];
  };

  it.each([0, 12345.67])("salvar observações mantém os campos históricos, inclusive ÚNICO e total %s", async (valorInicialContrato) => {
    const original = { orgao: "LEGADO TESTE", item: "ÚNICO", tipo: "SACO DE 25 KG", qtdeSc: 1500.123,
      valorUnit: 30.87, lanceLimite: 28.21, valorAdjudicado: 27.89, qtdeTn: 37.5, valorInicialContrato };
    const { id } = await createLicitacao(original); ids.push(id);
    const before = await read(id);
    // Mesmo se o navegador enviar zero por engano, a ausência de itens preserva os valores no banco.
    await updateLicitacao(id, { ...original, qtdeSc: 0, valorUnit: 0, item: "1", observacoesGerais: "Observação alterada" });
    const after = await read(id);
    for (const key of ["item", "tipo", "qtdeSc", "valorUnit", "lanceLimite", "valorAdjudicado", "qtdeTn", "valorInicialContrato", "itensJson"])
      expect(after[key]).toBe(before[key]);
    expect(after.observacoesGerais).toBe("Observação alterada");
  });

  it("cria, reabre e edita cinco itens; o servidor ignora o total informado pelo cliente", async () => {
    const itens = Array.from({ length: 5 }, (_, i) => ({ ...novoLicitacaoItem(i + 1), tipo: `TIPO ${i + 1}`, qtdeSc: 10, valorUnit: i + 1 }));
    const { id } = await createLicitacao({ orgao: "MULTI TESTE", itens, valorInicialContrato: 999999 }); ids.push(id);
    const row = (await listLicitacoes()).find(row => row.id === id)!;
    expect(lerLicitacaoItens(row)).toEqual(itens);
    expect(Number(row.valorInicialContrato)).toBe(150);
    expect(Number(row.qtdeSc)).toBe(50);
    expect(row.valorUnit).toBeNull();
    const alterados = itens.map(item => ({ ...item, qtdeSc: 20 }));
    await updateLicitacao(id, { orgao: "MULTI TESTE", itens: alterados, valorInicialContrato: 1 });
    const after = await read(id);
    expect(Number(after.valorInicialContrato)).toBe(300);
    expect(lerLicitacaoItens(after)).toEqual(alterados);
    await updateLicitacao(id, { orgao: "MULTI TESTE", observacoesGerais: "Sem alterar itens" });
    const metadata = await read(id);
    expect(metadata.itensJson).toBe(after.itensJson);
    expect(metadata.valorInicialContrato).toBe(after.valorInicialContrato);
  });

  it("rejeita itens inválidos antes de qualquer gravação", async () => {
    const { id } = await createLicitacao({ orgao: "INVALIDO TESTE", itens: [novoLicitacaoItem(1)] }); ids.push(id);
    const before = await read(id);
    await expect(updateLicitacao(id, { orgao: "NÃO GRAVAR", itens: [{ ...novoLicitacaoItem(1), valorUnit: -1 }] })).rejects.toThrow();
    expect(await read(id)).toEqual(before);
  });
});
