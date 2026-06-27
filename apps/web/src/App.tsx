import { BrowserRouter, Routes, Route } from "react-router-dom";
import { NavigationProvider } from "./contexts/NavigationContext";
import { Header } from "./components/Header";
import { StatusBar } from "./components/StatusBar";
// CookieConsent is intentionally NOT rendered: seedr sets no cookies and runs no
// tracking/analytics, so no consent banner is legally required (see Privacy.tsx).
// The component is kept for open-source reuse — uncomment this import and the render
// in App() below to re-enable a banner.
// import { CookieConsent } from "./components/CookieConsent";
import { Home } from "./routes/Home";
import { Browse } from "./routes/Browse";
import { Detail } from "./routes/Detail";
import { Privacy } from "./routes/Privacy";
import { Impressum } from "./routes/Impressum";

const isEmbed = new URLSearchParams(window.location.search).has("embed");

export function App() {
  return (
    <BrowserRouter>
      <NavigationProvider>
        <div className="min-h-screen flex flex-col pb-8">
          {!isEmbed && <Header />}
          <main className="flex-grow">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/impressum" element={<Impressum />} />
              <Route path="/:type" element={<Browse />} />
              <Route path="/:type/:slug" element={<Detail />} />
            </Routes>
          </main>
          {!isEmbed && <StatusBar />}
          {/* {!isEmbed && <CookieConsent />} — disabled; see the note on the import above */}
        </div>
      </NavigationProvider>
    </BrowserRouter>
  );
}
