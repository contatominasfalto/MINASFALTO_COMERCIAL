# Publicação e rollback

Publicar primeiro a branch `feature/controle-alimentacao` em homologação. Ordem: backup, migração SQL, build, reinício e testes de aceite. Não promover para produção sem validação visual, funcional, reconciliação da migração e aprovação do responsável.

Em falha antes de novos dados, reverta a aplicação e execute o rollback SQL autorizado. Se já houver dados, exporte-os e restaure o backup transacional; não remova tabelas diretamente.

