import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/auth/RequireAuth";
import { RequireRole } from "@/auth/RequireRole";
import { Layout } from "@/components/Layout";
import { AdminInicioPage } from "@/pages/admin/AdminInicioPage";
import { AdminSupervisionPage } from "@/pages/admin/AdminSupervisionPage";
import { AdminUsuariosPage } from "@/pages/admin/AdminUsuariosPage";
import { HduDetailPage } from "@/pages/hdu/HduDetailPage";
import { LoginPage } from "@/pages/LoginPage";
import { PerfilPage } from "@/pages/PerfilPage";
import { PortalRedirect } from "@/pages/PortalRedirect";
import { QaHduListPage } from "@/pages/qa/QaHduListPage";
import { QaInicioPage } from "@/pages/qa/QaInicioPage";
import { QeEquipoPage } from "@/pages/qe/QeEquipoPage";
import { QeHduFormPage } from "@/pages/qe/QeHduFormPage";
import { QeHduListPage } from "@/pages/qe/QeHduListPage";
import { QeInicioPage } from "@/pages/qe/QeInicioPage";

/** Rutas del portal: `/admin`, `/qe` y `/qa` guardadas por rol (D6, ADR 0006). */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

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
