import "dotenv/config";
import mysql from "mysql2/promise";

const apply = process.argv.includes("--apply");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurado.");

const connection = await mysql.createConnection(process.env.DATABASE_URL);

async function exists(kind, name, table = "users") {
  const sources = {
    column: ["information_schema.columns", "table_name=? AND column_name=?", [table, name]],
    table: ["information_schema.tables", "table_name=?", [name]],
    index: ["information_schema.statistics", "table_name=? AND index_name=?", [table, name]],
    trigger: ["information_schema.triggers", "trigger_name=?", [name]],
  };
  const [source, where, params] = sources[kind];
  const [[row]] = await connection.query(
    `SELECT COUNT(*) total FROM ${source} WHERE table_schema=DATABASE() AND ${where}`,
    params,
  );
  return Number(row?.total || 0) > 0;
}

const columns = [
  ["username", "varchar(64) NULL"],
  ["status", "enum('active','inactive','archived') NOT NULL DEFAULT 'active'"],
  ["isProtected", "boolean NOT NULL DEFAULT false"],
  ["updatedByUserId", "int NULL"],
  ["archivedAt", "timestamp NULL"],
];

const tableStatements = {
  user_permissions: `CREATE TABLE user_permissions (
    id int AUTO_INCREMENT PRIMARY KEY, userId int NOT NULL,
    resourceKey varchar(80) NOT NULL, actionKey varchar(40) NOT NULL,
    effect enum('allow','deny','view') NOT NULL, updatedByUserId int NULL,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT user_permission_unique UNIQUE (userId,resourceKey,actionKey),
    KEY user_permission_user_idx (userId),
    CONSTRAINT user_permissions_user_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )`,
  profile_permissions: `CREATE TABLE profile_permissions (
    id int AUTO_INCREMENT PRIMARY KEY, profileKey varchar(40) NOT NULL,
    resourceKey varchar(80) NOT NULL, actionKey varchar(40) NOT NULL,
    effect enum('allow','deny','view') NOT NULL,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT profile_permission_unique UNIQUE (profileKey,resourceKey,actionKey)
  )`,
  permission_audit_log: `CREATE TABLE permission_audit_log (
    id int AUTO_INCREMENT PRIMARY KEY, actorUserId int NULL, targetUserId int NULL,
    action varchar(80) NOT NULL, previousValue text NULL, newValue text NULL,
    reason varchar(500) NULL, createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY permission_audit_target_idx (targetUserId)
  )`,
};

try {
  const [[databaseRow]] = await connection.query("SELECT DATABASE() banco");
  const database = String(databaseRow?.banco || "");
  if (!database) throw new Error("Nenhum banco selecionado no DATABASE_URL.");

  const missingColumns = [];
  for (const [name] of columns) if (!(await exists("column", name))) missingColumns.push(name);
  const missingTables = [];
  for (const name of Object.keys(tableStatements)) if (!(await exists("table", name))) missingTables.push(name);
  console.log(`Banco de destino: ${database}`);
  console.log(`Colunas pendentes: ${missingColumns.length ? missingColumns.join(", ") : "nenhuma"}`);
  console.log(`Tabelas pendentes: ${missingTables.length ? missingTables.join(", ") : "nenhuma"}`);
  if (!apply) {
    console.log("Diagnóstico concluído. Nenhuma alteração foi feita. Use --apply para confirmar.");
    process.exit(0);
  }

  for (const [name, definition] of columns) {
    if (!(await exists("column", name))) await connection.query(`ALTER TABLE users ADD COLUMN \`${name}\` ${definition}`);
  }
  if (!(await exists("index", "users_username_unique"))) {
    await connection.query("ALTER TABLE users ADD UNIQUE KEY users_username_unique (username)");
  }
  for (const [name, statement] of Object.entries(tableStatements)) {
    if (!(await exists("table", name))) await connection.query(statement);
  }

  await connection.query(`INSERT INTO users (openId,username,name,email,loginMethod,role,profile,status,isProtected)
    VALUES
      ('local_login:admfull','admfull','admfull',NULL,'local','admin','admfull','active',true),
      ('local_login:comercial','comercial','comercial',NULL,'local','user','comercial','active',false),
      ('local_login:subcomercial','subcomercial','subcomercial',NULL,'local','user','subcomercial','active',false),
      ('local_login:gerencia','gerencia','gerencia',NULL,'local','user','gerencia','active',false),
      ('local_login:diretoria','diretoria','diretoria',NULL,'local','user','diretoria','active',false)
    ON DUPLICATE KEY UPDATE username=VALUES(username), name=COALESCE(users.name,VALUES(name)), profile=VALUES(profile),
      role=IF(VALUES(username)='admfull','admin',users.role),
      status=IF(VALUES(username)='admfull','active',users.status),
      isProtected=IF(VALUES(username)='admfull',true,users.isProtected)`);

  await connection.query(`INSERT INTO profile_permissions (profileKey,resourceKey,actionKey,effect)
    SELECT p.profileKey,r.resourceKey,a.actionKey,
      CASE WHEN p.profileKey='admfull' THEN 'allow'
        WHEN p.profileKey IN ('gerencia','diretoria') AND r.resourceKey<>'usuarios' THEN 'allow'
        WHEN p.profileKey IN ('comercial','subcomercial') AND r.resourceKey IN ('inicio','comercial','estoque') THEN 'allow'
        ELSE 'deny' END
    FROM (SELECT 'admfull' profileKey UNION ALL SELECT 'comercial' UNION ALL SELECT 'subcomercial' UNION ALL SELECT 'gerencia' UNION ALL SELECT 'diretoria') p
    CROSS JOIN (SELECT 'inicio' resourceKey UNION ALL SELECT 'comercial' UNION ALL SELECT 'estoque' UNION ALL SELECT 'custo_obras' UNION ALL SELECT 'licitacoes' UNION ALL SELECT 'alimentacao' UNION ALL SELECT 'usuarios') r
    CROSS JOIN (SELECT 'access' actionKey UNION ALL SELECT 'read' UNION ALL SELECT 'create' UNION ALL SELECT 'update' UNION ALL SELECT 'delete' UNION ALL SELECT 'export' UNION ALL SELECT 'import' UNION ALL SELECT 'sync' UNION ALL SELECT 'manage') a
    ON DUPLICATE KEY UPDATE effect=VALUES(effect)`);

  if (!(await exists("trigger", "protect_admfull_update"))) {
    await connection.query(`CREATE TRIGGER protect_admfull_update BEFORE UPDATE ON users FOR EACH ROW BEGIN
      IF OLD.isProtected=true AND (NOT (NEW.openId <=> OLD.openId) OR NEW.username<>'admfull' OR
        NOT (NEW.name <=> OLD.name) OR NOT (NEW.email <=> OLD.email) OR NOT (NEW.loginMethod <=> OLD.loginMethod) OR
        NEW.role<>'admin' OR NEW.profile<>'admfull' OR NEW.status<>'active' OR NEW.isProtected<>true)
      THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='O usuario master admfull e protegido'; END IF; END`);
  }
  if (!(await exists("trigger", "protect_admfull_delete"))) {
    await connection.query(`CREATE TRIGGER protect_admfull_delete BEFORE DELETE ON users FOR EACH ROW BEGIN
      IF OLD.isProtected=true THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='O usuario master admfull nao pode ser excluido'; END IF; END`);
  }

  const remainingColumns = [];
  for (const [name] of columns) if (!(await exists("column", name))) remainingColumns.push(name);
  const remainingTables = [];
  for (const name of Object.keys(tableStatements)) if (!(await exists("table", name))) remainingTables.push(name);
  if (remainingColumns.length || remainingTables.length) throw new Error("Estrutura de usuários incompleta após aplicação.");
  const [[master]] = await connection.query("SELECT id,username,profile,status,isProtected FROM users WHERE username='admfull' LIMIT 1");
  if (!master || master.profile !== "admfull" || master.status !== "active" || !master.isProtected) {
    throw new Error("O usuário master não foi criado ou protegido corretamente.");
  }
  console.log("Estrutura do Controle de Usuários criada e validada com sucesso.");
  console.table([master]);
} finally {
  await connection.end();
}
