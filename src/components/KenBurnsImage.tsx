import { Img, Easing, interpolate, useCurrentFrame } from "remotion";
import type { FitMode, EasingName } from "../slideshow";

const easingMap: Record<EasingName, (value: number) => number> = {
  linear: Easing.linear,
  easeIn: Easing.bezier(0.42, 0, 1, 1),
  easeOut: Easing.bezier(0, 0, 0.58, 1),
  easeInOut: Easing.bezier(0.42, 0, 0.58, 1),
};

export type KenBurnsImageProps = {
  src: string;
  durationFrames: number;
  fromScale: number;
  toScale: number;
  fromX: number;
  toX: number;
  fromY: number;
  toY: number;
  easing?: "linear" | "easeIn" | "easeOut" | "easeInOut";
  fit?: FitMode;
};

export const KenBurnsImage = ({
  src,
  durationFrames,
  fromScale,
  toScale,
  fromX,
  toX,
  fromY,
  toY,
  easing = "linear",
  fit = "cover",
}: KenBurnsImageProps) => {
  const frame = useCurrentFrame();
  const easingFn = easingMap[easing];

  const scale = interpolate(frame, [0, durationFrames], [fromScale, toScale], {
    easing: easingFn,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const x = interpolate(frame, [0, durationFrames], [fromX, toX], {
    easing: easingFn,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const y = interpolate(frame, [0, durationFrames], [fromY, toY], {
    easing: easingFn,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Img
      src={src}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: fit,
        transformOrigin: "50% 50%",
        transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
        willChange: "transform",
      }}
    />
  );
};
