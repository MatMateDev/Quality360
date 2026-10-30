import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/auth/RequireAuth";
import { RequireRole } from "@/auth/RequireRole";
import { Layout } from "@/components/Layout";
import { AdminInicioPage } from "@/pages/admin/AdminInicioPage";
import { AdminSupervisionPage } from "@/pages/admin/AdminSupervisionPage";
import { AdminUsuariosPage } from "@/pages/admin/AdminUsuariosPage";
import { HduDetailPage } from "@/pages/hdu/HduDetailPage";
import { AuditorBandejaPage } from "@/pages/auditor/AuditorBandejaPage";
import { AuditorImpedimentosPage } from "@/pages/auditor/AuditorImpedimentosPage";
import { AuditorAuditoriaUsuariosPage, AuditorBitacoraPage, AuditorCertificadosPage } from "@/pages/auditor/AuditorPestanasPage";
import { LiderBandejaPage } from "@/pages/lider/LiderBandejaPage";
import { LoginPage } from "@/pages/LoginPage";
import { PerfilPage } from "@/pages/PerfilPage";
import { PortalRedirect } from "@/pages/PortalRedirect";
import { RecuperarContrasenaPage } from "@/pages/RecuperarContrasenaPage";
import { RestablecerContrasenaPage } from "@/pages/RestablecerContrasenaPage";
import { VerificarCertificadoPage } from "@/pages/VerificarCertificadoPage";
import { QaHduListPage } from "@/pages/qa/QaHduListPage";
import { QaInicioPage } from "@/pages/qa/QaInicioPage";
import { QeAprobacionesPage } from "@/pages/qe/QeAprobacionesPage";
import { QeEquipoPage } from "@/pages/qe/QeEquipoPage";
import { QeHduFormPage } from "@/pages/qe/QeHduFormPage";
import { QeHduListPage } from "@/pages/qe/QeHduListPage";
import { QeImpedimentosPage } from "@/pages/qe/QeImpedimentosPage";
import { QeInicioPage } from "@/pages/qe/QeInicioPage";
import { QeRiesgoPage } from "@/pages/qe/QeRiesgoPage";

/** Rutas del portal: `/admin`, `/qe`, `/qa`, `/lider` y `/auditor` guardadas por rol (D6, ADR 0006, D41). */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* E1-F13 (públicas): pedir el enlace y restablecer la contraseña desde el correo. */}
      <Route path="/recuperar-contrasena" element={<RecuperarContrasenaPage />} />
      <Route path="/restablecer-contrasena" element={<RestablecerContrasenaPage />} />
      {/* Pública (D21): cualquiera con el folio verifica un certificado. */}
      <Route path="/verificar" element={<VerificarCertificadoPage />} />
      <Route path="/verificar/:folio" element={<VerificarCertificadoPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<PortalRedirect />} />
          <Route path="perfil" element={<PerfilPage />} />
          <Route path="hdu/:id" element={<HduDetailPage />} />

          <Route element={<RequireRole roles={["ADMINISTRADOR"]} />}>
            <Route path="admin" element={<AdminInicioPage />} />
            <Route path="admin/usuarios" element={<AdminUsuariosPage />} />
            <Route path="admin/supervision" element={<AdminSupervisionPage />} />
          </Route>

          <Route element={<RequireRole roles={["QE"]} />}>
            <Route path="qe" element={<QeInicioPage />} />
            <Route path="qe/equipo" element={<QeEquipoPage />} />
            <Route path="qe/hdu" element={<QeHduListPage />} />
            <Route path="qe/hdu/nueva" element={<QeHduFormPage />} />
            <Route path="qe/aprobaciones" element={<QeAprobacionesPage />} />
            <Route path="qe/impedimentos" element={<QeImpedimentosPage />} />
            <Route path="qe/impedimentos/riesgo" element={<QeRiesgoPage />} />
          </Route>

          <Route element={<RequireRole roles={["LIDER_QA"]} />}>
            <Route path="lider" element={<LiderBandejaPage />} />
          </Route>

          <Route element={<RequireRole roles={["AUDITOR"]} />}>
            <Route path="auditor" element={<AuditorBandejaPage />} />
            <Route path="auditor/hdu" element={<AuditorBandejaPage />} />
            <Route path="auditor/certificados" element={<AuditorCertificadosPage />} />
            <Route path="auditor/bitacora" element={<AuditorBitacoraPage />} />
            <Route path="auditor/auditoria-usuarios" element={<AuditorAuditoriaUsuariosPage />} />
            <Route path="auditor/impedimentos" element={<AuditorImpedimentosPage />} />
          </Route>

          <Route element={<RequireRole roles={["ANALISTA_QA"]} />}>
            <Route path="qa" element={<QaInicioPage />} />
            <Route path="qa/hdu" element={<QaHduListPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
