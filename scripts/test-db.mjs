import "dotenv/config";
import mysql from "mysql2/promise";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL nao configurada.");
  process.exit(1);
}

let connection;
try {
  connection = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await connection.query("SELECT DATABASE() AS databaseName, 1 AS ok");
  const databaseName = rows?.[0]?.databaseName || "(desconhecido)";
  console.log(`Conexao MySQL OK. Banco atual: ${databaseName}`);
} catch (error) {
  console.error("Falha ao conectar no MySQL.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await connection?.end();
}
