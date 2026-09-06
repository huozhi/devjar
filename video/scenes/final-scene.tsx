import {AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame} from 'remotion';
import {Backdrop} from '../components/backdrop';
import {JarMark} from '../components/jar-mark';

export const FinalScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{color: '#f8f6f1', fontFamily: 'Arial, Helvetica, sans-serif'}}>
      <Backdrop dark />
      <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 58}}>
        <div style={{opacity: interpolate(frame, [0, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), scale: interpolate(frame, [0, 24], [0.84, 1], {easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
          <JarMark size={190} color="#f8f6f1" lineWidth={2.5} />
        </div>
        <Interactive.Div name="Website URL" style={{color: '#f8f6f1', fontSize: 118, fontWeight: 900, letterSpacing: '-0.055em', transformOrigin: 'center center', opacity: interpolate(frame, [18, 34], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), scale: interpolate(frame, [18, 54], [0.7, 1.08], {easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>devjar.vercel.app</Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
