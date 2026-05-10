import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame, Video } from "remotion";
import { getLyricLineOpacity } from "./components/lyrics-opacity";
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
        return (
          <AbsoluteFill
            key={`${line.startFrame}-${line.nextStartFrame ?? "end"}-${line.text}`}
            style={{
              opacity: getLyricLineOpacity(frame, line, config.lyrics, config.durationInFrames),
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
