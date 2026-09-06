export const WindowChrome: React.FC<{title: string; children: React.ReactNode; dark?: boolean}> = ({title, children, dark = false}) => (
  <div style={{position: 'relative', height: '100%', overflow: 'hidden', borderRadius: 18, background: dark ? '#202020' : '#f1efe9'}}>
    <div style={{height: 62, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 9, color: dark ? '#929292' : '#77736d', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 18}}>
      <span style={{width: 8, height: 8, borderRadius: 99, background: '#777'}} /><span style={{width: 8, height: 8, borderRadius: 99, background: '#777'}} /><span style={{width: 8, height: 8, borderRadius: 99, background: '#777'}} /><span style={{marginLeft: 15}}>{title}</span>
    </div>
    {children}
  </div>
);
