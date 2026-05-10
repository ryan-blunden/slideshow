import type { KenBurnsConfig, SlideshowConfig, SlideshowDefaults, SlideshowSegment, RuntimeSlideshowSegment } from "../slideshow";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function isSupportedImageFile(fileName: string): boolean {
  return /\.(jpe?g|png|webp)$/i.test(fileName);
}

export function sortPathsNaturally(values: string[]): string[] {
  return [...values].sort((a, b) => collator.compare(a, b));
}

function hashString(input: string): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededRandom(seed: number): number {
  let value = seed + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function randomBetween(seed: number, min: number, max: number): number {
  return min + (max - min) * seededRandom(seed);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function percentToFraction(percent: number): number {
  return clamp(percent, 0, 100) / 100;
}

function minSafeScale(
  width: number,
  height: number,
  fromX: number,
  toX: number,
  fromY: number,
  toY: number,
): number {
  const maxX = Math.max(Math.abs(fromX), Math.abs(toX));
  const maxY = Math.max(Math.abs(fromY), Math.abs(toY));
  const requiredX = 1 + (2 * maxX) / Math.max(width, 1);
  const requiredY = 1 + (2 * maxY) / Math.max(height, 1);
  return Math.max(requiredX, requiredY);
}

function maxTravelAlongAngle({
  width,
  height,
  scale,
  angle,
}: {
  width: number;
  height: number;
  scale: number;
  angle: number;
}): number {
  const unitX = Math.abs(Math.cos(angle));
  const unitY = Math.abs(Math.sin(angle));
  const xAllowance = Math.max(0, (width * (scale - 1)) / 2);
  const yAllowance = Math.max(0, (height * (scale - 1)) / 2);
  const maxX = unitX === 0 ? Number.POSITIVE_INFINITY : xAllowance / unitX;
  const maxY = unitY === 0 ? Number.POSITIVE_INFINITY : yAllowance / unitY;
  return Math.max(0, Math.min(maxX, maxY));
}

function createAutoKenBurns({
  src,
  index,
  width,
  height,
  defaults,
  motionPercent,
  zoomPercent,
}: {
  src: string;
  index: number;
  width: number;
  height: number;
  defaults: SlideshowDefaults;
  motionPercent: number;
  zoomPercent: number;
}): KenBurnsConfig {
  const seed = hashString(`${src}:${index}`);
  const angle = randomBetween(seed, 0, Math.PI * 2);
  const unitX = Math.cos(angle);
  const unitY = Math.sin(angle);
  const zoomingIn = seededRandom(seed + 1) < 0.5;
  const zoomSpan = percentToFraction(zoomPercent) * randomBetween(seed + 2, 0.9, 1.08);
  const scaleDelta = Math.max(zoomSpan, 0.03);
  const baseScale = Math.max(defaults.fromScale, defaults.toScale, 1.05);
  const fromScale = zoomingIn ? baseScale : baseScale + scaleDelta;
  const toScale = zoomingIn ? baseScale + scaleDelta : baseScale;

  const travelLimit = Math.min(
    maxTravelAlongAngle({
      width,
      height,
      scale: fromScale,
      angle,
    }),
    maxTravelAlongAngle({
      width,
      height,
      scale: toScale,
      angle,
    }),
  );
  const motionFraction = percentToFraction(motionPercent) * randomBetween(seed + 3, 0.85, 1.05);
  const pathDistance = travelLimit * motionFraction;
  const startLead = pathDistance * randomBetween(seed + 4, 0.72, 1);
  const endLead = pathDistance * randomBetween(seed + 5, 0.18, 0.45);
  const panDirection = seededRandom(seed + 6) < 0.5 ? -1 : 1;
  const fromX = Number((panDirection * -unitX * startLead).toFixed(2));
  const toX = Number((panDirection * -unitX * endLead).toFixed(2));
  const fromY = Number((panDirection * -unitY * startLead).toFixed(2));
  const toY = Number((panDirection * -unitY * endLead).toFixed(2));

  const safeScale = minSafeScale(width, height, fromX, toX, fromY, toY);
  const safeBaseScale = Math.max(baseScale, safeScale);
  const adjustedFromScale = zoomingIn ? safeBaseScale : safeBaseScale + scaleDelta;
  const adjustedToScale = zoomingIn ? safeBaseScale + scaleDelta : safeBaseScale;

  return {
    fromScale: Number(adjustedFromScale.toFixed(3)),
    toScale: Number(adjustedToScale.toFixed(3)),
    fromX,
    toX,
    fromY,
    toY,
  };
}

export function buildRuntimeSegments({
  segments,
  width,
  height,
  defaults,
  motionPercent = 6,
  zoomPercent = 8,
}: {
  segments: SlideshowSegment[];
  width: number;
  height: number;
  defaults: SlideshowDefaults;
  motionPercent?: number;
  zoomPercent?: number;
}): RuntimeSlideshowSegment[] {
  return segments.map((segment, index) => {
    const durationFrames = segment.durationFrames ?? defaults.imageDurationFrames;
    const autoMotion = segment.kenBurns
      ? null
      : createAutoKenBurns({
          src: segment.src,
          index,
          width,
          height,
          defaults,
          motionPercent,
          zoomPercent,
        });
    const baseKenBurns = segment.kenBurns ?? autoMotion;

    if (!baseKenBurns) {
      throw new Error("Unable to generate Ken Burns motion for a segment.");
    }

    const kenBurns = {
      fromScale: baseKenBurns.fromScale ?? defaults.fromScale,
      toScale: baseKenBurns.toScale ?? defaults.toScale,
      fromX: baseKenBurns.fromX ?? 0,
      toX: baseKenBurns.toX ?? 0,
      fromY: baseKenBurns.fromY ?? 0,
      toY: baseKenBurns.toY ?? 0,
    };

    if (Math.abs(kenBurns.toScale - kenBurns.fromScale) < 0.02) {
      if (kenBurns.toScale >= kenBurns.fromScale) {
        kenBurns.toScale = Number((kenBurns.fromScale + 0.08).toFixed(3));
      } else {
        kenBurns.fromScale = Number((kenBurns.toScale + 0.08).toFixed(3));
      }
    }

    return {
      src: segment.src,
      durationFrames,
      kenBurns,
    };
  });
}

export function buildAutoConfig({
  inputFiles,
  width,
  height,
  fps,
  durationSeconds,
  crossfadeSeconds,
  output,
  compositionId,
  backgroundColor,
  audio,
  motionPercent = 6,
  zoomPercent = 8,
}: {
  inputFiles: string[];
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  crossfadeSeconds: number;
  output: string;
  compositionId: string;
  backgroundColor: string;
  audio?: SlideshowConfig["audio"];
  motionPercent?: number;
  zoomPercent?: number;
}): SlideshowConfig {
  const imageDurationFrames = Math.round(durationSeconds * fps);
  const crossfadeFrames = Math.round(crossfadeSeconds * fps);
  const defaults = {
    imageDurationFrames,
    crossfadeFrames,
    easing: "easeInOut" as const,
    fit: "cover" as const,
    fromScale: 1.05,
    toScale: 1.18,
  };

  return {
    compositionId,
    width,
    height,
    fps,
    output,
    backgroundColor,
    audio,
    defaults,
    segments: buildRuntimeSegments({
      segments: inputFiles.map((src) => ({ src })),
      width,
      height,
      defaults,
      motionPercent,
      zoomPercent,
    }),
  };
}
