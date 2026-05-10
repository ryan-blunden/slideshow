import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

export type CrossFadeProps = {
  children: ReactNode;
  durationFrames: number;
  fadeFrames: number;
  fadeIn?: boolean;
  fadeOut?: boolean;
};

export const CrossFade = ({
  children,
  durationFrames,
  fadeFrames,
  fadeIn = true,
  fadeOut = true,
}: CrossFadeProps) => {
  const frame = useCurrentFrame();

  const fadeInOpacity =
    fadeIn && fadeFrames > 0
      ? interpolate(frame, [0, fadeFrames], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const fadeOutOpacity =
    fadeOut && fadeFrames > 0
      ? interpolate(frame, [durationFrames - fadeFrames, durationFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  return (
    <AbsoluteFill
      style={{
        opacity: fadeInOpacity * fadeOutOpacity,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
