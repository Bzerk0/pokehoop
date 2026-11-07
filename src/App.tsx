import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { ErrorBoundary } from "./ui/components/ErrorBoundary.tsx";
import { Footer } from "./ui/components/Footer.tsx";
import { ArcadePage } from "./ui/pages/ArcadePage.tsx";
import { Builder } from "./ui/pages/Builder.tsx";
import { Dex } from "./ui/pages/Dex.tsx";
import { DraftPage } from "./ui/pages/DraftPage.tsx";
import { PlayPage } from "./ui/pages/PlayPage.tsx";
import { SharedTeam } from "./ui/pages/SharedTeam.tsx";
import { Title } from "./ui/pages/Title.tsx";

export function App() {
  return (
    <BrowserRouter>
      <div className="flex h-full flex-col">
        <main className="min-h-0 flex-1 overflow-auto">
          <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Title />} />
            <Route path="/dex" element={<Dex />} />
            <Route path="/build" element={<Builder />} />
            <Route path="/draft" element={<DraftPage />} />
            <Route path="/play" element={<PlayPage />} />
            <Route path="/play/live" element={<ArcadePage />} />
            <Route path="/t/:code" element={<SharedTeam />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ErrorBoundary>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}
