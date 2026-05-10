import { Player } from "@remotion/player";
import { createRoot } from "react-dom/client";
import { LyricsComposition } from "../LyricsComposition";

const bootstrap = window.__VIDTOOLS_LYRICS_PREVIEW__;

if (!bootstrap) {
  throw new Error("Lyrics preview bootstrap data was not found.");
}

const App = () => {
  const { config } = bootstrap;

  return (
    <div
      style={{
        minHeight: "100vh",
        margin: 0,
        background:
          "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.1), transparent 30%), linear-gradient(180deg, #171717 0%, #080808 100%)",
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
          maxWidth: 1800,
          margin: "0 auto",
        }}
      >
        <header>
          <div style={{ fontSize: 13, letterSpacing: 2, textTransform: "uppercase", opacity: 0.7 }}>
            Lyrics Preview
          </div>
        </header>

        <Player
          component={LyricsComposition}
          inputProps={config}
          durationInFrames={config.durationInFrames}
          compositionWidth={config.width}
          compositionHeight={config.height}
          fps={config.fps}
          controls
          autoPlay
          loop
          clickToPlay={false}
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
          initialVolume={config.audio?.volume ?? 1}
          initiallyMuted
        />
      </div>
    </div>
  );
};

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
