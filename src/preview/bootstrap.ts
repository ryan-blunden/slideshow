import type { SlideshowConfig } from "../slideshow";

export type PreviewBootstrap = {
  config: SlideshowConfig;
  durationInFrames: number;
};

declare global {
  interface Window {
    __SLIDESHOW_PREVIEW__?: PreviewBootstrap;
  }
}

export {};
