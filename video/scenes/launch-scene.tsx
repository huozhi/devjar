import {AbsoluteFill, Interactive, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop} from '../components/backdrop';

const FallingCard: React.FC<{
  frame: number;
  start: number;
  left: number;
  endTop: number;
  rotate: number;
  dark?: boolean;
  children: React.ReactNode;
}> = ({frame, start, left, endTop, rotate, dark = false, children}) => {
  const {fps} = useVideoConfig();
  const drop = spring({frame: frame - start, fps, durationInFrames: 40, config: {damping: 9, mass: 0.85, stiffness: 120}});
  return (
    <div style={{position: 'absolute', zIndex: 2, left, top: interpolate(drop, [0, 1], [-250, endTop], {extrapolateLeft: 'clamp'}), width: 132, height: 164, display: 'grid', placeItems: 'center', background: dark ? '#242424' : '#eeeae1', color: dark ? '#f8f6f1' : '#171717', rotate: `${rotate}deg`, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 32}}>
      {children}
    </div>
  );
};

export const LaunchScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{color: '#171717', fontFamily: 'Arial, Helvetica, sans-serif'}}>
      <Backdrop />
      <div style={{position: 'absolute', left: 116, top: 272, width: 760}}>
        <Interactive.Div name="Product name" style={{fontSize: 188, fontWeight: 800, letterSpacing: '-0.085em', lineHeight: 0.9}}>devjar</Interactive.Div>
        <Interactive.Div name="Product subtitle" style={{marginTop: 72, color: '#69655f', fontSize: 43, fontWeight: 400, lineHeight: 1.04, letterSpacing: '-0.04em', whiteSpace: 'nowrap'}}>Live Playground &amp; Static Site Export</Interactive.Div>
      </div>

      <div style={{position: 'absolute', right: 100, top: 118, width: 760, height: 860, overflow: 'hidden', opacity: interpolate(frame, [4, 16], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
        <FallingCard frame={frame} start={18} left={150} endTop={500} rotate={-8}>&lt;/&gt;</FallingCard>
        <FallingCard frame={frame} start={26} left={318} endTop={558} rotate={4}><span style={{fontSize: 24, lineHeight: 1.7}}>—<br />—<br />—</span></FallingCard>
        <FallingCard frame={frame} start={34} left={480} endTop={520} rotate={7} dark><span style={{color: '#a8dddd'}}>|</span></FallingCard>

        <svg viewBox="0 0 760 860" width={760} height={860} style={{position: 'absolute', zIndex: 3, inset: 0}}>
          <path d="M210 230h340v82c0 26 17 45 39 64 45 39 71 96 71 156v188c0 78-53 120-130 120H230c-77 0-130-42-130-120V532c0-60 26-117 71-156 22-19 39-38 39-64v-82Z" fill="rgba(255,255,255,.16)" stroke="#77726b" strokeWidth="5" strokeLinejoin="round" />
          <path d="M196 230h368" stroke="#77726b" strokeWidth="14" strokeLinecap="round" />
          <path d="M155 425c-24 42-35 81-35 130v142" fill="none" stroke="#fff" strokeWidth="16" strokeLinecap="round" opacity=".55" />
        </svg>
      </div>
    </AbsoluteFill>
  );
};
