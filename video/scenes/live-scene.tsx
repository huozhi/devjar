import {AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame} from 'remotion';
import {Backdrop} from '../components/backdrop';
import {WindowChrome} from '../components/chrome';

const tail = ' live.';
const CodeLine: React.FC<{number: number; children: React.ReactNode}> = ({number, children}) => <div style={{display: 'grid', gridTemplateColumns: '42px 1fr', minHeight: 40}}><span style={{color: '#5e5e5e'}}>{number}</span><span>{children}</span></div>;

export const LiveScene: React.FC = () => {
  const frame = useCurrentFrame();
  const typed = tail.slice(0, Math.max(0, Math.min(tail.length, Math.floor((frame - 20) / 2))));
  const complete = frame >= 36;
  const ease = Easing.bezier(0.16, 1, 0.3, 1);
  return (
    <AbsoluteFill style={{color: '#f8f6f1', fontFamily: 'Arial, Helvetica, sans-serif'}}>
      <Backdrop dark />
      <div style={{position: 'absolute', left: 116, right: 116, top: 70, bottom: 70}}>
        <div style={{height: 470, display: 'flex', alignItems: 'center'}}>
          <Interactive.Div name="Live scene title" style={{fontSize: 142, fontWeight: 900, letterSpacing: '-0.07em', whiteSpace: 'nowrap', opacity: interpolate(frame, [0, 16], [0, 1], {easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), translate: interpolate(frame, [0, 16], ['0px 28px', '0px 0px'], {easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>React Live Preview</Interactive.Div>
        </div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, height: 420}}>
          <div style={{opacity: interpolate(frame, [4, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), translate: interpolate(frame, [4, 22], ['-46px 0px', '0px 0px'], {easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
            <WindowChrome title="pages/index.tsx" dark><div style={{padding: '28px 34px', color: '#e6e1da', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 27, lineHeight: 1.45}}>
              <CodeLine number={1}><span style={{color: '#d8d8d8'}}>export default</span> <span style={{color: '#aaa'}}>function</span> App() {'{'}</CodeLine>
              <CodeLine number={2}>&nbsp;&nbsp;<span style={{color: '#d8d8d8'}}>return</span> &lt;<span style={{color: '#aaa'}}>h1</span></CodeLine>
              <CodeLine number={3}>&nbsp;&nbsp;&nbsp;&nbsp;className=<span style={{color: '#c7c7c7'}}>&quot;text-5xl font-bold&quot;</span>&gt;</CodeLine>
              <CodeLine number={4}>&nbsp;&nbsp;&nbsp;&nbsp;Built{typed}<span style={{display: complete ? 'none' : 'inline-block', marginLeft: 2, width: 3, height: 26, verticalAlign: -5, background: '#aaa', opacity: frame % 12 < 8 ? 1 : 0}} /></CodeLine>
              <CodeLine number={5}>&nbsp;&nbsp;&lt;/<span style={{color: '#aaa'}}>h1</span>&gt;</CodeLine>
              <CodeLine number={6}>{'}'}</CodeLine>
              <div style={{position: 'absolute', left: 34, bottom: 24, display: 'inline-flex', alignItems: 'center', gap: 10, color: complete ? '#d0d0d0' : '#858585', fontSize: 18}}><span style={{width: 8, height: 8, borderRadius: 99, background: complete ? '#aaa' : '#666'}} />{complete ? 'updated in 28ms' : 'watching…'}</div>
            </div></WindowChrome>
          </div>
          <div style={{opacity: interpolate(frame, [10, 26], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), translate: interpolate(frame, [10, 28], ['46px 0px', '0px 0px'], {easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
            <WindowChrome title="localhost:3000">
              <div style={{height: 'calc(100% - 62px)', display: 'grid', placeItems: 'center', background: '#f8f6f1'}}><div style={{fontSize: 76, fontWeight: 900, letterSpacing: '-0.055em', color: '#171717', scale: interpolate(frame, [30, 42, 56], [0.96, 1.04, 1], {easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>{complete ? 'Built live.' : 'Built'}</div></div>
              <Interactive.Div name="Fast refresh status" style={{position: 'absolute', right: 30, bottom: 24, display: 'flex', alignItems: 'center', gap: 10, color: '#77736d', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 18, opacity: interpolate(frame, [8, 22], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}><span style={{width: 8, height: 8, borderRadius: 99, background: '#77736d'}} />Fast Refresh</Interactive.Div>
            </WindowChrome>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
