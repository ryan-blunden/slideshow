import type { SlideshowConfig } from "../slideshow";
import { getTotalDurationFrames } from "./timing";

export function getRuntimeDurationFrames(config: SlideshowConfig): number {
  return getTotalDurationFrames(config.segments, config.defaults.crossfadeFrames);
}
