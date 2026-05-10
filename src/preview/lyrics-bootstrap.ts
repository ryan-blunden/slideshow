import type { LyricsRuntimeConfig } from "../LyricsComposition";

export type LyricsPreviewBootstrap = {
  config: LyricsRuntimeConfig;
};

declare global {
  interface Window {
    __VIDTOOLS_LYRICS_PREVIEW__?: LyricsPreviewBootstrap;
  }
}
