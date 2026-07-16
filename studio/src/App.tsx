import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/organisms/AppShell";
import { ComponentGalleryPage } from "./pages/ComponentGalleryPage";
import { CoursePage } from "./pages/CoursePage";
import { HomePage } from "./pages/HomePage";
import { LibraryPage } from "./pages/LibraryPage";
import { ReviewHubPage } from "./pages/ReviewHubPage";
import { SessionPage } from "./pages/SessionPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="session" element={<SessionPage />} />
        <Route path="course" element={<CoursePage />} />
        <Route path="review" element={<ReviewHubPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="components" element={<ComponentGalleryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
