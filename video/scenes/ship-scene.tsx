import {AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame} from 'remotion';
import {Backdrop} from '../components/backdrop';

const Route: React.FC<{frame: number; start: number; file: string; route: string}> = ({frame, start, file, route}) => (
  <div style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: 36, padding: '21px 0', borderBottom: '1px solid #e2dfd8', opacity: interpolate(frame, [start, start + 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), translate: interpolate(frame, [start, start + 12], ['0px 18px', '0px 0px'], {easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}><span>{file}</span><span style={{color: '#58a7a6'}}>{route}</span></div>
);

export const ShipScene: React.FC = () => {
  const frame = useCurrentFrame();
  const ease = Easing.bezier(0.16, 1, 0.3, 1);
  return (
    <AbsoluteFill style={{color: '#171717', fontFamily: 'Arial, Helvetica, sans-serif'}}>
      <Backdrop />
      <div style={{position: 'absolute', left: 116, right: 116, top: 104, bottom: 90, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 90, alignItems: 'center'}}>
        <div>
          <Interactive.Div name="Static export title" style={{fontSize: 108, fontWeight: 900, letterSpacing: '-0.07em', lineHeight: 0.98, whiteSpace: 'nowrap', opacity: interpolate(frame, [0, 16], [0, 1], {easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), translate: interpolate(frame, [0, 18], ['0px 42px', '0px 0px'], {easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>Static Site Export</Interactive.Div>
          <Interactive.Div name="CLI description" style={{marginTop: 48, maxWidth: 720, color: '#79736b', fontSize: 42, lineHeight: 1.32, opacity: interpolate(frame, [12, 28], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>Export live playground to static site and deploy everywhere.</Interactive.Div>
        </div>
        <div style={{opacity: interpolate(frame, [5, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), translate: interpolate(frame, [5, 22], ['54px 0px', '0px 0px'], {easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
          <div style={{background: '#e9e6df', color: '#34312d', padding: '29px 32px', borderRadius: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 32}}><span style={{color: '#77736d'}}>$</span> npx devjar build<span style={{display: 'inline-block', width: 3, height: 32, marginLeft: 6, verticalAlign: -5, background: '#77736d', opacity: frame < 28 && frame % 12 < 8 ? 1 : 0}} /></div>
          <div style={{padding: '24px 32px 34px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 28, color: '#4e4a45'}}>
            <Route frame={frame} start={22} file="pages/index.tsx" route="/" /><Route frame={frame} start={30} file="pages/docs.tsx" route="/docs" /><Route frame={frame} start={38} file="pages/about.tsx" route="/about" />
            <div style={{marginTop: 31, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#297d73', fontWeight: 700, opacity: interpolate(frame, [48, 60], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), scale: interpolate(frame, [48, 57, 66], [0.94, 1.04, 1], {easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}><span>✓ Built 3 routes</span><span style={{fontWeight: 400, color: '#8a847b'}}>ready</span></div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
