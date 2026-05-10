export type SlideshowDurationSelection = {
  includedFiles: string[];
  excludedFiles: string[];
  requestedDurationFrames: number;
  selectedDurationFrames: number;
};

function getTotalDurationFramesForCount(imageCount: number, durationFrames: number): number {
  if (imageCount <= 0) {
    return 0;
  }

  return imageCount * durationFrames;
}

export function selectImagesForSlideshowDuration({
  inputFiles,
  durationFrames,
  crossfadeFrames,
  slideshowDurationSeconds,
  fps,
}: {
  inputFiles: string[];
  durationFrames: number;
  crossfadeFrames: number;
  slideshowDurationSeconds?: number;
  fps: number;
}): SlideshowDurationSelection {
  if (slideshowDurationSeconds === undefined) {
    return {
      includedFiles: inputFiles,
      excludedFiles: [],
      requestedDurationFrames: 0,
      selectedDurationFrames: getTotalDurationFramesForCount(inputFiles.length, durationFrames),
    };
  }

  if (!Number.isFinite(slideshowDurationSeconds) || slideshowDurationSeconds <= 0) {
    throw new Error("The slideshow duration must be a positive number of seconds.");
  }

  if (!Number.isFinite(durationFrames) || durationFrames <= 0) {
    throw new Error("Image duration must be a positive number of frames.");
  }

  if (!Number.isFinite(crossfadeFrames) || crossfadeFrames < 0) {
    throw new Error("Cross-fade length must be zero or a positive number of frames.");
  }

  const requestedDurationFrames = Math.floor(slideshowDurationSeconds * fps);
  if (requestedDurationFrames <= 0) {
    throw new Error("The slideshow duration is too short to fit even one frame.");
  }

  let selectedCount = inputFiles.length;

  while (
    selectedCount > 0 &&
    getTotalDurationFramesForCount(selectedCount, durationFrames) > requestedDurationFrames
  ) {
    selectedCount -= 1;
  }

  if (selectedCount === 0) {
    throw new Error(
      `Requested slideshow duration of ${slideshowDurationSeconds} seconds is shorter than a single image duration of ${durationFrames / fps} seconds.`,
    );
  }

  const includedFiles = inputFiles.slice(0, selectedCount);
  const excludedFiles = inputFiles.slice(selectedCount);

  return {
    includedFiles,
    excludedFiles,
    requestedDurationFrames,
    selectedDurationFrames: getTotalDurationFramesForCount(includedFiles.length, durationFrames),
  };
}
