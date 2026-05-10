import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { LyricsConfig } from "../lyrics";
import { getLyricLineOpacity } from "./lyrics-opacity";

export type LyricsOverlayProps = {
  config: LyricsConfig;
  totalFrames: number;
};

export const LyricsOverlay = ({ config, totalFrames }: LyricsOverlayProps) => {
  const frame = useCurrentFrame();

  if (config.lines.length === 0) {
    return null;
  }

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {config.lines.map((line) => {
        return (
          <AbsoluteFill
            key={`${line.startFrame}-${line.nextStartFrame ?? "end"}-${line.text}`}
            style={{
              alignItems: "flex-end",
              justifyContent: "center",
              opacity: getLyricLineOpacity(frame, line, config, totalFrames),
              padding: "0 8vw 9vh",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                maxWidth: "84vw",
                color: "white",
                textAlign: "center",
                fontSize: "clamp(32px, 3.4vw, 72px)",
                lineHeight: 1.15,
                fontWeight: 600,
                whiteSpace: "pre-wrap",
                textShadow: "0 2px 12px rgba(0, 0, 0, 0.85)",
              }}
            >
              {line.text}
            </div>
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};
