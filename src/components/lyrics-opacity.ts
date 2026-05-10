type LyricLineLike = {
  startFrame: number;
  nextStartFrame?: number;
};

type LyricFadeConfig = {
  fadeInFrames: number;
  fadeOutFrames: number;
  fadeOutOffsetFrames: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getLyricLineOpacity(
  frame: number,
  line: LyricLineLike,
  config: LyricFadeConfig,
  totalFrames: number,
): number {
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
      ? clamp((frame - line.startFrame) / Math.max(1, fadeInEndFrame - line.startFrame), 0, 1)
      : frame >= line.startFrame
        ? 1
        : 0;

  const fadeOutOpacity =
    config.fadeOutFrames > 0
      ? clamp((fadeOutEndFrame - frame) / Math.max(1, fadeOutEndFrame - fadeOutStartFrame), 0, 1)
      : 1;

  return fadeInOpacity * fadeOutOpacity;
}
