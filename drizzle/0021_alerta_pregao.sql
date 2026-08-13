ALTER TABLE licitacoes
  ADD COLUMN alertaPregao boolean NOT NULL DEFAULT true AFTER horaInicioDisputa;
