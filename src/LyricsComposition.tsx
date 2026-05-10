import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame, Video } from "remotion";
import type { LyricsConfig } from "./lyrics";

export const DEFAULT_LYRICS_COMPOSITION_ID = "lyrics";

export type LyricsRuntimeAudioConfig = {
  src: string;
  volume: number;
  enabled: boolean;
};

export type LyricsRuntimeBackgroundConfig = {
  src: string;
  kind: "image" | "video";
};

export type LyricsRuntimeFontConfig = {
  src: string;
  family: string;
};

export type LyricsRuntimeConfig = {
  compositionId: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  output: string;
  backgroundColor: string;
  lyrics: LyricsConfig;
  themeCss: string;
  fontFaceCss?: string;
  audio?: LyricsRuntimeAudioConfig;
  background?: LyricsRuntimeBackgroundConfig;
  font?: LyricsRuntimeFontConfig;
};

export const LyricsComposition = (config: LyricsRuntimeConfig) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: config.backgroundColor, color: "#fff" }}>
      {config.background ? (
        config.background.kind === "video" ? (
          <Video
            src={staticFile(config.background.src)}
            muted
            loop
            playsInline
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <Img
            src={staticFile(config.background.src)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )
      ) : null}

      {config.audio?.enabled ? (
        <Audio src={staticFile(config.audio.src)} volume={config.audio.volume} />
      ) : null}

      {config.fontFaceCss ? <style>{config.fontFaceCss}</style> : null}
      <style>{config.themeCss}</style>

      {config.lyrics.lines.map((line) => {
        const fadeInEndFrame = line.startFrame + config.lyrics.fadeInFrames;
        const fadeOutStartFrame = Math.max(
          line.startFrame,
          line.nextStartFrame != null
            ? line.nextStartFrame - config.lyrics.fadeOutOffsetFrames
            : config.durationInFrames - config.lyrics.fadeOutFrames,
        );
        const fadeOutEndFrame = fadeOutStartFrame + config.lyrics.fadeOutFrames;

        const fadeInOpacity =
          config.lyrics.fadeInFrames > 0
            ? Math.max(
                0,
                Math.min(
                  1,
                  (frame - line.startFrame) / Math.max(1, fadeInEndFrame - line.startFrame),
                ),
              )
            : frame >= line.startFrame
              ? 1
              : 0;

        const fadeOutOpacity =
          config.lyrics.fadeOutFrames > 0
            ? Math.max(
                0,
                Math.min(
                  1,
                  (fadeOutEndFrame - frame) / Math.max(1, fadeOutEndFrame - fadeOutStartFrame),
                ),
              )
            : 1;

        return (
          <AbsoluteFill
            key={`${line.startFrame}-${line.nextStartFrame ?? "end"}-${line.text}`}
            style={{
              opacity: fadeInOpacity * fadeOutOpacity,
              pointerEvents: "none",
            }}
          >
            <div className="lyrics">{line.text}</div>
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};
