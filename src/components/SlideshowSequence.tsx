import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import type { SlideshowConfig } from "../slideshow";
import { getSegmentTimelines } from "../utils/timing";
import { KenBurnsImage } from "./KenBurnsImage";
import { CrossFade } from "./CrossFade";

export type SlideshowSequenceProps = {
  config: SlideshowConfig;
};

export const SlideshowSequence = ({ config }: SlideshowSequenceProps) => {
  const timelines = getSegmentTimelines(config.segments, config.defaults.crossfadeFrames);

  return (
    <AbsoluteFill>
      {config.audio?.enabled ? (
        <Audio src={staticFile(config.audio.src)} volume={config.audio.volume} />
      ) : null}

      {config.segments.map((segment, index) => {
        const timeline = timelines[index];
        const isFirst = index === 0;
        const isLast = index === config.segments.length - 1;
        const fadeFrames = config.defaults.crossfadeFrames;

        return (
          <Sequence
            key={`${segment.src}-${index}`}
            from={timeline.startFrame}
            durationInFrames={timeline.layerDurationFrames}
            layout="none"
          >
            <CrossFade
              durationFrames={timeline.layerDurationFrames}
              fadeFrames={fadeFrames}
              fadeIn={!isFirst}
              fadeOut={!isLast}
            >
              <KenBurnsImage
                src={staticFile(segment.src)}
                durationFrames={timeline.layerDurationFrames}
                fromScale={segment.kenBurns.fromScale}
                toScale={segment.kenBurns.toScale}
                fromX={segment.kenBurns.fromX}
                toX={segment.kenBurns.toX}
                fromY={segment.kenBurns.fromY}
                toY={segment.kenBurns.toY}
                easing="linear"
                fit={config.defaults.fit}
              />
            </CrossFade>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
