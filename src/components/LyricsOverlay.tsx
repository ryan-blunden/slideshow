import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { LyricsConfig } from "../lyrics";

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
        const fadeInEndFrame = line.startFrame + config.fadeInFrames;
        const fadeOutStartFrame = Math.max(
          line.startFrame,
          line.nextStartFrame != null
            ? line.nextStartFrame - config.fadeOutOffsetFrames
            : totalFrames - config.fadeOutFrames,
        );
        const fadeOutEndFrame = fadeOutStartFrame + config.fadeOutFrames;

        const fadeInOpacity =
          config.fadeInFrames > 0
            ? interpolate(frame, [line.startFrame, fadeInEndFrame], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            : frame >= line.startFrame
              ? 1
              : 0;

        const fadeOutOpacity =
          config.fadeOutFrames > 0
            ? interpolate(frame, [fadeOutStartFrame, fadeOutEndFrame], [1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            : 1;

        return (
          <AbsoluteFill
            key={`${line.startFrame}-${line.nextStartFrame ?? "end"}-${line.text}`}
            style={{
              alignItems: "flex-end",
              justifyContent: "center",
              opacity: fadeInOpacity * fadeOutOpacity,
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
