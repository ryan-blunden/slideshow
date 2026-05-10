import { Composition, registerRoot, type CalculateMetadataFunction } from "remotion";
import { SlideshowComposition } from "./SlideshowComposition";
import { DEFAULT_COMPOSITION_ID, type SlideshowConfig } from "./slideshow";
import { buildAutoConfig } from "./utils/randomize";
import { getRuntimeDurationFrames } from "./utils/runtime-config";

const defaultRuntimeConfig: SlideshowConfig = buildAutoConfig({
  inputFiles: [
    "assets/photos/001.jpg",
    "assets/photos/002.jpg",
    "assets/photos/003.jpg",
  ],
  width: 3840,
  height: 2160,
  fps: 25,
  durationSeconds: 3,
  crossfadeSeconds: 1,
  output: "renders/ken-burns-slideshow.mov",
  compositionId: DEFAULT_COMPOSITION_ID,
  backgroundColor: "#000000",
});

const calculateMetadata: CalculateMetadataFunction<SlideshowConfig> = async ({ props }) => {
  return {
    durationInFrames: getRuntimeDurationFrames(props),
    fps: props.fps,
    width: props.width,
    height: props.height,
    props,
  };
};

const Root = () => {
  return (
    <Composition
      id={DEFAULT_COMPOSITION_ID}
      component={SlideshowComposition}
      defaultProps={defaultRuntimeConfig}
      calculateMetadata={calculateMetadata}
    />
  );
};

registerRoot(Root);
