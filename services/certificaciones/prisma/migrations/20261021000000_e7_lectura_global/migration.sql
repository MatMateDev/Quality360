-- Quality360 · Certificaciones · Corrida E7 (D52): solo índices de lectura global para el
-- Auditor (bitácora y certificados). Ninguna llave foránea sale del esquema.

CREATE INDEX "evento_checklist_fecha_idx" ON "evento_checklist"("fecha");
CREATE INDEX "evento_checklist_accion_fecha_idx" ON "evento_checklist"("accion", "fecha");
CREATE INDEX "evento_checklist_actor_id_fecha_idx" ON "evento_checklist"("actor_id", "fecha");
CREATE INDEX "certificado_emitido_en_idx" ON "certificado"("emitido_en");
CREATE INDEX "certificado_emitido_por_id_idx" ON "certificado"("emitido_por_id");
