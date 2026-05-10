import React from "react";
import { createRoot } from "react-dom/client";
import { Player } from "@remotion/player";
import { SlideshowComposition } from "../SlideshowComposition";
import { getRuntimeDurationFrames } from "../utils/runtime-config";
import type { PreviewBootstrap } from "./bootstrap";

const bootstrap = window.__SLIDESHOW_PREVIEW__;

if (!bootstrap) {
  throw new Error("Preview bootstrap data was not found.");
}

const App = () => {
  const { config } = bootstrap;

  return (
    <div
      style={{
        minHeight: "100vh",
        margin: 0,
        background: "linear-gradient(180deg, #101114 0%, #050608 100%)",
        color: "#f5f5f4",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 24,
          padding: 24,
          maxWidth: 1600,
          margin: "0 auto",
        }}
      >
        <header>
          <div style={{ fontSize: 13, letterSpacing: 2, textTransform: "uppercase", opacity: 0.7 }}>
            Local Preview
          </div>
        </header>

        <Player
          component={SlideshowComposition}
          inputProps={config}
          durationInFrames={getRuntimeDurationFrames(config)}
          compositionWidth={config.width}
          compositionHeight={config.height}
          fps={config.fps}
          controls
          autoPlay
          loop
          style={{
            width: "100%",
            height: "auto",
            aspectRatio: `${config.width} / ${config.height}`,
            boxShadow: "0 22px 70px rgba(0, 0, 0, 0.45)",
            borderRadius: 20,
            overflow: "hidden",
            background: config.backgroundColor,
          }}
          acknowledgeRemotionLicense
          initiallyMuted
        />
      </div>
    </div>
  );
};

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
