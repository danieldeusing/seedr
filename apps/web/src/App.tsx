import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { NavigationProvider } from "./contexts/NavigationContext";
import { Header } from "./components/Header";
import { StatusBar } from "./components/StatusBar";
import { Home } from "./routes/Home";
import { Browse } from "./routes/Browse";
import { Detail } from "./routes/Detail";
import { Privacy } from "./routes/Privacy";
import { Impressum } from "./routes/Impressum";
import { NotFound } from "./routes/NotFound";

// ?embed hides the site chrome so a page can be framed by the danieldeusing estate
// (frame-ancestors in public/_headers lists who may do that).
const isEmbed = new URLSearchParams(window.location.search).has("embed");

export function App() {
  return (
    <BrowserRouter>
      <NavigationProvider>
        <div className="flex min-h-screen flex-col pb-16 sm:pb-8">
          {!isEmbed && <Header />}
          <main className="flex-grow">
            <AppErrorBoundary>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/impressum" element={<Impressum />} />
              <Route path="/:type" element={<Browse />} />
              <Route path="/:type/:slug" element={<Detail />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </AppErrorBoundary>
          </main>
          {!isEmbed && <StatusBar />}
        </div>
      </NavigationProvider>
    </BrowserRouter>
  );
}
