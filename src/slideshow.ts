export const DEFAULT_COMPOSITION_ID = "ken-burns-slideshow";

export type EasingName = "linear" | "easeIn" | "easeOut" | "easeInOut";
export type FitMode = "cover" | "contain";

export type KenBurnsConfig = {
  fromScale: number;
  toScale: number;
  fromX: number;
  toX: number;
  fromY: number;
  toY: number;
};

export type SlideshowAudioConfig = {
  src: string;
  volume: number;
  enabled: boolean;
};

export type RuntimeLyricLine = {
  startFrame: number;
  text: string;
  nextStartFrame?: number;
};

export type LyricsConfig = {
  lines: RuntimeLyricLine[];
  startOffsetFrames: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  fadeOutOffsetFrames: number;
};

export type SlideshowDefaults = {
  imageDurationFrames: number;
  crossfadeFrames: number;
  easing: EasingName;
  fit: FitMode;
  fromScale: number;
  toScale: number;
  minImageDimensionPercent: number;
};

export type SlideshowSegment = {
  src: string;
  durationFrames?: number;
  kenBurns?: KenBurnsConfig;
  fit?: FitMode;
};

export type RuntimeSlideshowSegment = {
  src: string;
  durationFrames: number;
  kenBurns: KenBurnsConfig;
  fit: FitMode;
};

export type SlideshowConfig = {
  compositionId: string;
  width: number;
  height: number;
  fps: number;
  output: string;
  backgroundColor: string;
  audio?: SlideshowAudioConfig;
  lyrics?: LyricsConfig;
  defaults: SlideshowDefaults;
  segments: RuntimeSlideshowSegment[];
};
