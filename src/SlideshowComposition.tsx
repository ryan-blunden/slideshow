import { AbsoluteFill } from "remotion";
import { LyricsOverlay } from "./components/LyricsOverlay";
import { SlideshowSequence } from "./components/SlideshowSequence";
import type { SlideshowConfig } from "./slideshow";
import { getRuntimeDurationFrames } from "./utils/runtime-config";

export const SlideshowComposition = (config: SlideshowConfig) => {
  const durationFrames = getRuntimeDurationFrames(config);

  return (
    <AbsoluteFill style={{ backgroundColor: config.backgroundColor }}>
      <SlideshowSequence config={config} />
      {config.lyrics ? <LyricsOverlay config={config.lyrics} totalFrames={durationFrames} /> : null}
    </AbsoluteFill>
  );
};
