import type { RuntimeSlideshowSegment } from "../slideshow";

export type SegmentTimeline = {
  index: number;
  holdStartFrame: number;
  holdEndFrame: number;
  startFrame: number;
  endFrame: number;
  displayDurationFrames: number;
  layerDurationFrames: number;
};

export function getSegmentTimelines(
  segments: RuntimeSlideshowSegment[],
  crossfadeFrames: number,
): SegmentTimeline[] {
  if (segments.length === 0) {
    throw new Error("No images were found. Add at least one photo to the input directory.");
  }

  if (crossfadeFrames < 0) {
    throw new Error("Cross-fade length cannot be negative.");
  }

  const timelines: SegmentTimeline[] = [];
  let cursor = 0;

  segments.forEach((segment, index) => {
    if (segment.durationFrames <= 0) {
      throw new Error(
        `Segment ${index + 1} has an invalid duration of ${segment.durationFrames} frames.`,
      );
    }

    const isFirst = index === 0;
    const isLast = index === segments.length - 1;
    const holdStartFrame = cursor;
    const holdEndFrame = cursor + segment.durationFrames;
    const startFrame = holdStartFrame - (isFirst ? 0 : crossfadeFrames);
    const endFrame = holdEndFrame + (isLast ? 0 : crossfadeFrames);
    const layerDurationFrames = endFrame - startFrame;

    timelines.push({
      index,
      holdStartFrame,
      holdEndFrame,
      startFrame,
      endFrame,
      displayDurationFrames: segment.durationFrames,
      layerDurationFrames,
    });

    cursor += segment.durationFrames;
  });

  return timelines;
}

export function getTotalDurationFrames(
  segments: RuntimeSlideshowSegment[],
  crossfadeFrames: number,
): number {
  const timelines = getSegmentTimelines(segments, crossfadeFrames);
  return timelines.at(-1)?.endFrame ?? 0;
}
