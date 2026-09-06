import {Easing, interpolate, useCurrentFrame} from 'remotion';

export const JarMark: React.FC<{size: number; color: string; lineWidth?: number}> = ({size, color, lineWidth = 3}) => {
  const frame = useCurrentFrame();
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{overflow: 'visible'}}>
      <path d="M23 16h18v9l4 5a8 8 0 0 1 2 5v13a6 6 0 0 1-6 6H23a6 6 0 0 1-6-6V35a8 8 0 0 1 2-5l4-5V16Z" fill="none" stroke={color} strokeWidth={lineWidth} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={interpolate(frame, [0, 24], [1, 0], {easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
      <path d="m25 35 5 5-5 5m10 0h7" fill="none" stroke={color} strokeWidth={lineWidth} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={interpolate(frame, [12, 30], [1, 0], {easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
    </svg>
  );
};
