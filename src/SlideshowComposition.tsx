import { AbsoluteFill } from "remotion";
import type { SlideshowConfig } from "./slideshow";
import { SlideshowSequence } from "./components/SlideshowSequence";

export const SlideshowComposition = (config: SlideshowConfig) => {
  return (
    <AbsoluteFill style={{ backgroundColor: config.backgroundColor }}>
      <SlideshowSequence config={config} />
    </AbsoluteFill>
  );
};
