import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./base.css";
import Landing from "./site/Landing.jsx";

// The builder (and its 3D engine) only loads on /build.
const Builder = lazy(() => import("./builder/Builder.jsx"));

const path = window.location.pathname.replace(/\/+$/, "") || "/";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {path === "/build" ? (
      <Suspense fallback={<div className="page-loading">Opening the builder…</div>}>
        <Builder />
      </Suspense>
    ) : (
      <Landing />
    )}
  </StrictMode>
);
