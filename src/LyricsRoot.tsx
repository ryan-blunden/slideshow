import { type CalculateMetadataFunction, Composition, registerRoot } from "remotion";
import {
  DEFAULT_LYRICS_COMPOSITION_ID,
  LyricsComposition,
  type LyricsRuntimeConfig,
} from "./LyricsComposition";

const calculateMetadata: CalculateMetadataFunction<LyricsRuntimeConfig> = async ({ props }) => {
  return {
    durationInFrames: props.durationInFrames,
    fps: props.fps,
    width: props.width,
    height: props.height,
    props,
  };
};

const Root = () => {
  return (
    <Composition
      id={DEFAULT_LYRICS_COMPOSITION_ID}
      component={LyricsComposition}
      defaultProps={{
        compositionId: DEFAULT_LYRICS_COMPOSITION_ID,
        width: 1920,
        height: 1080,
        fps: 25,
        durationInFrames: 1,
        output: "renders/lyrics.mov",
        backgroundColor: "transparent",
        lyrics: {
          lines: [],
          startOffsetFrames: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          fadeOutOffsetFrames: 0,
        },
        themeCss: "",
      }}
      calculateMetadata={calculateMetadata}
    />
  );
};

registerRoot(Root);
