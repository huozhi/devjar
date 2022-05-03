import React, { useEffect, useState, useCallback } from 'react'
import { debounce } from 'lodash-es'
import { Editor } from 'codice'
import { useLiveCode } from 'devjar/react'

export default function Page() {
  const [activeFile, setActiveFile] = useState('index.js')
  const [files, setFiles] = useState({
    'index.js':
`import React from 'react'
import useSWR from 'swr'
import Name from './mod1'

export default function App() {
  const { data } = useSWR('swr', (key) => key)
  return <div>Hello <Name /> with {data}</div>
}
`,
    './mod1':
`import React from 'react'

export default function Name() {
  return <b>Devjar</b>
}
`,
    /*'xxxswr':
    `
    import{useEffect as Ge,useLayoutEffect as ke,createContext as Be,useContext as Ve,useState as xe,createElement as Qe,useRef as H,useCallback as ve,useDebugValue as Xe}from"react";function We(e,i,r,a){function n(t){return t instanceof r?t:new r(function(f){f(t)})}return new(r||(r=Promise))(function(t,f){function c(s){try{u(a.next(s))}catch(v){f(v)}}function d(s){try{u(a.throw(s))}catch(v){f(v)}}function u(s){s.done?t(s.value):n(s.value).then(c,d)}u((a=a.apply(e,i||[])).next())})}function _e(e,i){var r={label:0,sent:function(){if(t[0]&1)throw t[1];return t[1]},trys:[],ops:[]},a,n,t,f;return f={next:c(0),throw:c(1),return:c(2)},typeof Symbol=="function"&&(f[Symbol.iterator]=function(){return this}),f;function c(u){return function(s){return d([u,s])}}function d(u){if(a)throw new TypeError("Generator is already executing.");for(;r;)try{if(a=1,n&&(t=u[0]&2?n.return:u[0]?n.throw||((t=n.return)&&t.call(n),0):n.next)&&!(t=t.call(n,u[1])).done)return t;switch(n=0,t&&(u=[u[0]&2,t.value]),u[0]){case 0:case 1:t=u;break;case 4:return r.label++,{value:u[1],done:!1};case 5:r.label++,n=u[1],u=[0];continue;case 7:u=r.ops.pop(),r.trys.pop();continue;default:if(t=r.trys,!(t=t.length>0&&t[t.length-1])&&(u[0]===6||u[0]===2)){r=0;continue}if(u[0]===3&&(!t||u[1]>t[0]&&u[1]<t[3])){r.label=u[1];break}if(u[0]===6&&r.label<t[1]){r.label=t[1],t=u;break}if(t&&r.label<t[2]){r.label=t[2],r.ops.push(u);break}t[2]&&r.ops.pop(),r.trys.pop();continue}u=i.call(e,r)}catch(s){u=[6,s],n=0}finally{a=t=0}if(u[0]&5)throw u[1];return{value:u[0]?u[1]:void 0,done:!0}}}var D=function(){},b=D(),B=Object,E=function(e){return e===b},F=function(e){return typeof e=="function"},x=function(e,i){return B.assign({},e,i)},Ee="undefined",Re=function(){return typeof window!=Ee},Ye=function(){return typeof document!=Ee},Ze=function(){return Re()&&typeof window.requestAnimationFrame!=Ee},te=new WeakMap,er=0,Y=function(e){var i=typeof e,r=e&&e.constructor,a=r==Date,n,t;if(B(e)===e&&!a&&r!=RegExp){if(n=te.get(e),n)return n;if(n=++er+"~",te.set(e,n),r==Array){for(n="@",t=0;t<e.length;t++)n+=Y(e[t])+",";te.set(e,n)}if(r==B){n="#";for(var f=B.keys(e).sort();!E(t=f.pop());)E(e[t])||(n+=t+":"+Y(e[t])+",");te.set(e,n)}}else n=a?e.toJSON():i=="symbol"?e.toString():i=="string"?JSON.stringify(e):""+e;return n},de=!0,rr=function(){return de},Fe=Re(),ye=Ye(),he=Fe&&window.addEventListener?window.addEventListener.bind(window):D,tr=ye?document.addEventListener.bind(document):D,me=Fe&&window.removeEventListener?window.removeEventListener.bind(window):D,nr=ye?document.removeEventListener.bind(document):D,ar=function(){var e=ye&&document.visibilityState;return E(e)||e!=="hidden"},ir=function(e){return tr("visibilitychange",e),he("focus",e),function(){nr("visibilitychange",e),me("focus",e)}},ur=function(e){var i=function(){de=!0,e()},r=function(){de=!1};return he("online",i),he("offline",r),function(){me("online",i),me("offline",r)}},or={isOnline:rr,isVisible:ar},fr={initFocus:ir,initReconnect:ur},ne=!Re()||"Deno"in window,sr=function(e){return Ze()?window.requestAnimationFrame(e):setTimeout(e,1)},Q=ne?Ge:ke,ce=typeof navigator<"u"&&navigator.connection,De=!ne&&ce&&(["slow-2g","2g"].includes(ce.effectiveType)||ce.saveData),pe=function(e){if(F(e))try{e=e()}catch{e=""}var i=[].concat(e);e=typeof e=="string"?e:(Array.isArray(e)?e.length:e)?Y(e):"";var r=e?"$swr$"+e:"";return[e,i,r]},P=new WeakMap,Me=0,Ne=1,Ue=2,X=function(e,i,r,a,n,t,f){f===void 0&&(f=!0);var c=P.get(e),d=c[0],u=c[1],s=c[3],v=d[i],l=u[i];if(f&&l)for(var I=0;I<l.length;++I)l[I](r,a,n);return t&&(delete s[i],v&&v[0])?v[0](Ue).then(function(){return e.get(i)}):e.get(i)},cr=0,be=function(){return++cr},Le=function(){for(var e=[],i=0;i<arguments.length;i++)e[i]=arguments[i];return We(void 0,void 0,void 0,function(){var r,a,n,t,f,c,d,u,s,v,l,I,Z,R,h,o,J,M,A,T,N;return _e(this,function(W){switch(W.label){case 0:if(r=e[0],a=e[1],n=e[2],t=e[3],f=typeof t=="boolean"?{revalidate:t}:t||{},c=E(f.populateCache)?!0:f.populateCache,d=f.revalidate!==!1,u=f.rollbackOnError!==!1,s=f.optimisticData,v=pe(a),l=v[0],I=v[2],!l)return[2];if(Z=P.get(r),R=Z[2],e.length<3)return[2,X(r,l,r.get(l),b,b,d,!0)];if(h=n,J=be(),R[l]=[J,0],M=!E(s),A=r.get(l),M&&(T=F(s)?s(A):s,r.set(l,T),X(r,l,T)),F(h))try{h=h(r.get(l))}catch(U){o=U}return h&&F(h.then)?[4,h.catch(function(U){o=U})]:[3,2];case 1:if(h=W.sent(),J!==R[l][0]){if(o)throw o;return[2,h]}else o&&M&&u&&(c=!0,h=A,r.set(l,A));W.label=2;case 2:return c&&(o||(F(c)&&(h=c(h,A)),r.set(l,h)),r.set(I,x(r.get(I),{error:o}))),R[l][1]=be(),[4,X(r,l,h,o,b,d,!!c)];case 3:if(N=W.sent(),o)throw o;return[2,c?N:h]}})})},Ie=function(e,i){for(var r in e)e[r][0]&&e[r][0](i)},He=function(e,i){if(!P.has(e)){var r=x(fr,i),a={},n=Le.bind(b,e),t=D;if(P.set(e,[a,{},{},{},n]),!ne){var f=r.initFocus(setTimeout.bind(b,Ie.bind(b,a,Me))),c=r.initReconnect(setTimeout.bind(b,Ie.bind(b,a,Ne)));t=function(){f&&f(),c&&c(),P.delete(e)}}return[e,n,t]}return[e,P.get(e)[4]]},lr=function(e,i,r,a,n){var t=r.errorRetryCount,f=n.retryCount,c=~~((Math.random()+.5)*(1<<(f<8?f:8)))*r.errorRetryInterval;!E(t)&&f>t||setTimeout(a,c,n)},Pe=He(new Map),qe=Pe[0],vr=Pe[1],ze=x({onLoadingSlow:D,onSuccess:D,onError:D,onErrorRetry:lr,onDiscarded:D,revalidateOnFocus:!0,revalidateOnReconnect:!0,revalidateIfStale:!0,shouldRetryOnError:!0,errorRetryInterval:De?1e4:5e3,focusThrottleInterval:5*1e3,dedupingInterval:2*1e3,loadingTimeout:De?5e3:3e3,compare:function(e,i){return Y(e)==Y(i)},isPaused:function(){return!1},cache:qe,mutate:vr,fallback:{}},or),Je=function(e,i){var r=x(e,i);if(i){var a=e.use,n=e.fallback,t=i.use,f=i.fallback;a&&t&&(r.use=a.concat(t)),n&&f&&(r.fallback=x(n,f))}return r},we=Be({}),dr=function(e){var i=e.value,r=Je(Ve(we),i),a=i&&i.provider,n=xe(function(){return a?He(a(r.cache||qe),i):b})[0];return n&&(r.cache=n[0],r.mutate=n[1]),Q(function(){return n?n[2]:b},[]),Qe(we.Provider,x(e,{value:r}))},hr=function(e,i){var r=xe({})[1],a=H(e),n=H({data:!1,error:!1,isValidating:!1}),t=ve(function(f){var c=!1,d=a.current;for(var u in f){var s=u;d[s]!==f[s]&&(d[s]=f[s],n.current[s]&&(c=!0))}c&&!i.current&&r({})},[]);return Q(function(){a.current=e}),[a,n.current,t]},mr=function(e){return F(e[1])?[e[0],e[1],e[2]||{}]:[e[0],null,(e[1]===null?e[2]:e[1])||{}]},br=function(){return x(ze,Ve(we))},wr=function(e){return function(){for(var r=[],a=0;a<arguments.length;a++)r[a]=arguments[a];var n=br(),t=mr(r),f=t[0],c=t[1],d=t[2],u=Je(n,d),s=e,v=u.use;if(v)for(var l=v.length;l-- >0;)s=v[l](s);return s(f,c||u.fetcher,u)}},Ae=function(e,i,r){var a=i[e]||(i[e]=[]);return a.push(r),function(){var n=a.indexOf(r);n>=0&&(a[n]=a[a.length-1],a.pop())}},le={dedupe:!0},Er=function(e,i,r){var a=r.cache,n=r.compare,t=r.fallbackData,f=r.suspense,c=r.revalidateOnMount,d=r.refreshInterval,u=r.refreshWhenHidden,s=r.refreshWhenOffline,v=P.get(a),l=v[0],I=v[1],Z=v[2],R=v[3],h=pe(e),o=h[0],J=h[1],M=h[2],A=H(!1),T=H(!1),N=H(o),W=H(i),U=H(r),m=function(){return U.current},ae=function(){return m().isVisible()&&m().isOnline()},ee=function(g){return a.set(M,x(a.get(M),g))},ge=a.get(o),Ke=E(t)?r.fallback[o]:t,V=E(ge)?Ke:ge,Se=a.get(M)||{},K=Se.error,Te=!A.current,Ce=function(){return Te&&!E(c)?c:m().isPaused()?!1:f?E(V)?!1:r.revalidateIfStale:E(V)||r.revalidateIfStale},$e=function(){return!o||!i?!1:Se.isValidating?!0:Te&&Ce()},ie=$e(),ue=hr({data:V,error:K,isValidating:ie},T),q=ue[0],oe=ue[1],re=ue[2],L=ve(function(g){return We(void 0,void 0,void 0,function(){var y,p,S,$,j,C,w,_,O,fe,G,z,se;return _e(this,function(k){switch(k.label){case 0:if(y=W.current,!o||!y||T.current||m().isPaused())return[2,!1];$=!0,j=g||{},C=!R[o]||!j.dedupe,w=function(){return!T.current&&o===N.current&&A.current},_=function(){var Oe=R[o];Oe&&Oe[1]===S&&delete R[o]},O={isValidating:!1},fe=function(){ee({isValidating:!1}),w()&&re(O)},ee({isValidating:!0}),re({isValidating:!0}),k.label=1;case 1:return k.trys.push([1,3,,4]),C&&(X(a,o,q.current.data,q.current.error,!0),r.loadingTimeout&&!a.get(o)&&setTimeout(function(){$&&w()&&m().onLoadingSlow(o,r)},r.loadingTimeout),R[o]=[y.apply(void 0,J),be()]),se=R[o],p=se[0],S=se[1],[4,p];case 2:return p=k.sent(),C&&setTimeout(_,r.dedupingInterval),!R[o]||R[o][1]!==S?(C&&w()&&m().onDiscarded(o),[2,!1]):(ee({error:b}),O.error=b,G=Z[o],!E(G)&&(S<=G[0]||S<=G[1]||G[1]===0)?(fe(),C&&w()&&m().onDiscarded(o),[2,!1]):(n(q.current.data,p)?O.data=q.current.data:O.data=p,n(a.get(o),p)||a.set(o,p),C&&w()&&m().onSuccess(p,o,r),[3,4]));case 3:return z=k.sent(),_(),m().isPaused()||(ee({error:z}),O.error=z,C&&w()&&(m().onError(z,o,r),(typeof r.shouldRetryOnError=="boolean"&&r.shouldRetryOnError||F(r.shouldRetryOnError)&&r.shouldRetryOnError(z))&&ae()&&m().onErrorRetry(z,o,r,L,{retryCount:(j.retryCount||0)+1,dedupe:!0}))),[3,4];case 4:return $=!1,fe(),w()&&C&&X(a,o,O.data,O.error,!1),[2,!0]}})})},[o]),je=ve(Le.bind(b,a,function(){return N.current}),[]);if(Q(function(){W.current=i,U.current=r}),Q(function(){if(!!o){var g=o!==N.current,y=L.bind(b,le),p=function(w,_,O){re(x({error:_,isValidating:O},n(q.current.data,w)?b:{data:w}))},S=0,$=function(w){if(w==Me){var _=Date.now();m().revalidateOnFocus&&_>S&&ae()&&(S=_+m().focusThrottleInterval,y())}else if(w==Ne)m().revalidateOnReconnect&&ae()&&y();else if(w==Ue)return L()},j=Ae(o,I,p),C=Ae(o,l,$);return T.current=!1,N.current=o,A.current=!0,g&&re({data:V,error:K,isValidating:ie}),Ce()&&(E(V)||ne?y():sr(y)),function(){T.current=!0,j(),C()}}},[o,L]),Q(function(){var g;function y(){var S=F(d)?d(V):d;S&&g!==-1&&(g=setTimeout(p,S))}function p(){!q.current.error&&(u||m().isVisible())&&(s||m().isOnline())?L(le).then(y):y()}return y(),function(){g&&(clearTimeout(g),g=-1)}},[d,u,s,L]),Xe(V),f&&E(V)&&o)throw W.current=i,U.current=r,T.current=!1,E(K)?L(le):K;return{mutate:je,get data(){return oe.data=!0,V},get error(){return oe.error=!0,K},get isValidating(){return oe.isValidating=!0,ie}}},yr=B.defineProperty(dr,"default",{value:ze}),pr=function(e){return pe(e)[0]},gr=wr(Er);export{yr as SWRConfig,gr as default,vr as mutate,pr as unstable_serialize,br as useSWRConfig};
    `*/
  })

  const { ref, load } = useLiveCode({
    getModulePath(modPath) {
      const prefix = 'https://esm.sh/'
      if (modPath === 'es-module-shims') {
        return `${prefix}${modPath}`
      }
      if (modPath.includes('/')) {
        const idx = modPath.indexOf('/')
        const pkg = modPath.slice(0, idx)
        const path = modPath.slice(idx + 1)
        return `${prefix}${pkg}?bundle&path=${path}`
      }
      return `${prefix}${modPath}?bundle`
    }
  })
  const debouncedLoad = useCallback(debounce(load, 200), [])

  useEffect(() => {
    debouncedLoad(files)
  }, [files])

  return (
    <div>
      <style jsx global>{`
        * {
          box-sizing: border-box;
        }
        html {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI',
            'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans',
            'Helvetica Neue', sans-serif;
        }
        body {
          max-width: 690px;
          margin: auto;
          padding: 40px 10px 40px;
        }
        :root {
          --sh-class: #2d5e9d;
          --sh-identifier: #354150;
          --sh-sign: #8996a3;
          --sh-string: #00a99a;
          --sh-keyword: #f47067;
          --sh-comment: #a19595;
          --sh-jsxliterals: #6266d1;
          --editor-text-color: transparent;
          --editor-background-color: transparent;
        }

        .sh__line::before {
          counter-increment: sh-line-number 1;
          content: counter(sh-line-number);
          width: 24px;
          display: inline-block;
          margin-right: 18px;
          margin-left: -42px;
          text-align: right;
          color: #a4a4a4;
        }
        .editor {
          position: relative;
          min-height: 100px;
          display: flex;
        }
        pre {
          width: 100%;
        }
        code, textarea, .preview {
          font-family: Consolas, Monaco, monospace;
          padding: 16px 12px;
          background-color: #f6f6f6;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          line-height: 1.25em;
          caret-color: #333;
        }
        textarea {
          padding-left: 54px;
        }
        code {
          counter-reset: sh-line-number;
          min-height: 100px;
          width: 100%;
          padding-left: 54px;
        }
        .executor {
          position: absolute;
          right: 8px;
          top: 8px;
          border: none;
          background: #333;
          border-radius: 4px;
          color: #fff;
        }
        .preview {
          width: 100%;
          border: 2px solid #bbb;
          background: #fefefe;
        }
      `}</style>
      <div>
        <h3>Code</h3>
        {Object.keys(files).map((filename) => (
          <button
            key={filename}
            disabled={filename === activeFile}
            onClick={() => setActiveFile(filename)}
          >
            {filename}
          </button>
        ))}
        <button
          onClick={() => {
            const newFilename = './mod' + Object.keys(files).length
            setFiles({
              ...files,
              [newFilename]: `export default function () {}`,
            })
            setActiveFile(newFilename)
          }}
        >
          +
        </button>
        <Editor
          className='editor'
          value={files[activeFile]}
          onChange={(code) => {
            setFiles({
              ...files,
              [activeFile]: code,
            })
          }}
        />
      </div>

      <div>
        <h3>Preview</h3>
        <iframe className='preview' ref={ref} />
      </div>
    </div>
  )
}
