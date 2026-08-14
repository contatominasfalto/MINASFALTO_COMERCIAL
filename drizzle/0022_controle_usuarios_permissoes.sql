ALTER TABLE `users`
  ADD COLUMN `username` varchar(64) NULL,
  ADD COLUMN `passwordHash` varchar(255) NULL,
  ADD COLUMN `status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
  ADD COLUMN `isProtected` boolean NOT NULL DEFAULT false,
  ADD COLUMN `updatedByUserId` int NULL,
  ADD COLUMN `archivedAt` timestamp NULL,
  ADD UNIQUE KEY `users_username_unique` (`username`);
--> statement-breakpoint
CREATE TABLE `user_permissions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `resourceKey` varchar(80) NOT NULL,
  `actionKey` varchar(40) NOT NULL,
  `effect` enum('allow','deny','view') NOT NULL,
  `updatedByUserId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `user_permissions_id` PRIMARY KEY(`id`),
  CONSTRAINT `user_permission_unique` UNIQUE(`userId`,`resourceKey`,`actionKey`),
  KEY `user_permission_user_idx` (`userId`),
  CONSTRAINT `user_permissions_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `profile_permissions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `profileKey` varchar(40) NOT NULL,
  `resourceKey` varchar(80) NOT NULL,
  `actionKey` varchar(40) NOT NULL,
  `effect` enum('allow','deny','view') NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `profile_permissions_id` PRIMARY KEY(`id`),
  CONSTRAINT `profile_permission_unique` UNIQUE(`profileKey`,`resourceKey`,`actionKey`)
);
--> statement-breakpoint
CREATE TABLE `permission_audit_log` (
  `id` int AUTO_INCREMENT NOT NULL,
  `actorUserId` int NULL,
  `targetUserId` int NULL,
  `action` varchar(80) NOT NULL,
  `previousValue` text NULL,
  `newValue` text NULL,
  `reason` varchar(500) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `permission_audit_log_id` PRIMARY KEY(`id`),
  KEY `permission_audit_target_idx` (`targetUserId`)
);
--> statement-breakpoint
INSERT INTO `users` (`openId`,`username`,`name`,`email`,`loginMethod`,`role`,`profile`,`status`,`isProtected`)
VALUES
  ('local_login:admfull','admfull','admfull',NULL,'local','admin','admfull','active',true),
  ('local_login:comercial','comercial','comercial',NULL,'local','user','comercial','active',false),
  ('local_login:subcomercial','subcomercial','subcomercial',NULL,'local','user','subcomercial','active',false),
  ('local_login:gerencia','gerencia','gerencia',NULL,'local','user','gerencia','active',false),
  ('local_login:diretoria','diretoria','diretoria',NULL,'local','user','diretoria','active',false)
ON DUPLICATE KEY UPDATE
  `username`=VALUES(`username`),
  `name`=COALESCE(`users`.`name`,VALUES(`name`)),
  `profile`=VALUES(`profile`),
  `role`=IF(VALUES(`username`)='admfull','admin',`users`.`role`),
  `status`=IF(VALUES(`username`)='admfull','active',`users`.`status`),
  `isProtected`=IF(VALUES(`username`)='admfull',true,`users`.`isProtected`);
--> statement-breakpoint
INSERT INTO `profile_permissions` (`profileKey`,`resourceKey`,`actionKey`,`effect`)
SELECT p.profileKey, r.resourceKey, a.actionKey,
  CASE
    WHEN p.profileKey='admfull' THEN 'allow'
    WHEN p.profileKey IN ('gerencia','diretoria') AND r.resourceKey<>'usuarios' THEN 'allow'
    WHEN p.profileKey IN ('comercial','subcomercial') AND r.resourceKey IN ('inicio','comercial','estoque') THEN 'allow'
    ELSE 'deny'
  END
FROM (
  SELECT 'admfull' profileKey UNION ALL SELECT 'comercial' UNION ALL SELECT 'subcomercial' UNION ALL SELECT 'gerencia' UNION ALL SELECT 'diretoria'
) p
CROSS JOIN (
  SELECT 'inicio' resourceKey UNION ALL SELECT 'comercial' UNION ALL SELECT 'estoque' UNION ALL SELECT 'custo_obras' UNION ALL SELECT 'licitacoes' UNION ALL SELECT 'alimentacao' UNION ALL SELECT 'usuarios'
) r
CROSS JOIN (
  SELECT 'access' actionKey UNION ALL SELECT 'read' UNION ALL SELECT 'create' UNION ALL SELECT 'update' UNION ALL SELECT 'delete' UNION ALL SELECT 'export' UNION ALL SELECT 'import' UNION ALL SELECT 'sync' UNION ALL SELECT 'manage'
) a
ON DUPLICATE KEY UPDATE `effect`=VALUES(`effect`);
--> statement-breakpoint
CREATE TRIGGER `protect_admfull_update`
BEFORE UPDATE ON `users` FOR EACH ROW
BEGIN
  IF OLD.`isProtected` = true AND (
    NOT (NEW.`openId` <=> OLD.`openId`) OR NEW.`username` <> 'admfull' OR
    NOT (NEW.`name` <=> OLD.`name`) OR NOT (NEW.`email` <=> OLD.`email`) OR
    NOT (NEW.`loginMethod` <=> OLD.`loginMethod`) OR
    NOT (NEW.`passwordHash` <=> OLD.`passwordHash`) OR
    NEW.`role` <> 'admin' OR NEW.`profile` <> 'admfull' OR
    NEW.`status` <> 'active' OR NEW.`isProtected` <> true
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'O usuario master admfull e protegido';
  END IF;
END;
--> statement-breakpoint
CREATE TRIGGER `protect_admfull_delete`
BEFORE DELETE ON `users` FOR EACH ROW
BEGIN
  IF OLD.`isProtected` = true THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'O usuario master admfull nao pode ser excluido';
  END IF;
END;
