import type { SlideshowConfig } from "../slideshow";
import { buildRuntimeSegments } from "./randomize";
import { getTotalDurationFrames } from "./timing";

export function getRuntimeDurationFrames(config: SlideshowConfig): number {
  return getTotalDurationFrames(config.segments, config.defaults.crossfadeFrames);
}
