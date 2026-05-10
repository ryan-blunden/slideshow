import { type CalculateMetadataFunction, Composition, registerRoot } from "remotion";
import { SlideshowComposition } from "./SlideshowComposition";
import { DEFAULT_COMPOSITION_ID, type SlideshowConfig } from "./slideshow";
import { buildAutoConfig } from "./utils/randomize";
import { getRuntimeDurationFrames } from "./utils/runtime-config";

const defaultRuntimeConfig: SlideshowConfig = buildAutoConfig({
  inputFiles: [
    "public/assets/photos/001.jpg",
    "public/assets/photos/002.jpg",
    "public/assets/photos/003.jpg",
  ],
  width: 1920,
  height: 1080,
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
