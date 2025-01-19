import React, { useRef, useState, useId, useEffect, useCallback } from 'react';
import { transform } from 'sucrase';
import { init, parse } from 'es-module-lexer';

// declare esmsInitOptions on global window
async function createModule(files, { getModuleUrl }) {
    let currentImportMap;
    let shim;
    async function setupImportMap() {
        if (shim) return shim;
        window.esmsInitOptions = {
            shimMode: true,
            mapOverrides: true
        };
        shim = import(/* webpackIgnore: true */ getModuleUrl('es-module-shims'));
        await shim;
    }
    function updateImportMap(imports) {
        imports['react'] = getModuleUrl('react');
        imports['react-dom'] = getModuleUrl('react-dom');
        imports['react-dom/client'] = getModuleUrl('react-dom/client');
        const script = document.createElement('script');
        script.type = 'importmap-shim';
        script.innerHTML = JSON.stringify({
            imports
        });
        document.body.appendChild(script);
        if (currentImportMap) {
            currentImportMap.parentNode.removeChild(currentImportMap);
        }
        currentImportMap = script;
    }
    function createInlinedModule(code, type) {
        if (type === 'css') return `data:text/css;utf-8,${encodeURIComponent(code)}`;
        return `data:text/javascript;utf-8,${encodeURIComponent(code)}`;
    }
    await setupImportMap();
    const imports = Object.fromEntries(Object.entries(files).map(([fileName, code])=>[
            fileName,
            createInlinedModule(code, fileName.endsWith('.css') ? 'css' : 'js')
        ]));
    updateImportMap(imports);
    return self.importShim('index.js');
}

let esModuleLexerInit;
const isRelative = (s)=>s.startsWith('./');
function transformCode(_code, getModuleUrl, externals) {
    const code = transform(_code, {
        transforms: [
            'jsx',
            'typescript'
        ]
    }).code;
    return replaceImports(code, getModuleUrl, externals);
}
function replaceImports(source, getModuleUrl, externals) {
    let code = '';
    let lastIndex = 0;
    let hasReactImports = false;
    const [imports] = parse(source);
    const cssImports = [];
    let cssImportIndex = 0;
    // start, end, statementStart, statementEnd, assertion, name
    imports.forEach(({ s, e, ss, se, a, n })=>{
        code += source.slice(lastIndex, ss) // content from last import to beginning of this line 
        ;
        // handle imports
        if (n.endsWith('.css')) {
            // Map './styles.css' -> '@styles.css', and collect it
            const cssPath = `${'@' + n.slice(2)}`;
            cssImports.push(cssPath);
        } else {
            code += source.substring(ss, s);
            code += isRelative(n) ? '@' + n.slice(2) : externals.has(n) ? n : getModuleUrl(n);
            code += source.substring(e, se);
        }
        lastIndex = se;
        if (n === 'react') {
            const statement = source.slice(ss, se);
            if (statement.includes('React')) {
                hasReactImports = true;
            }
        }
        cssImports.forEach((cssPath)=>{
            code += `\nimport sheet${cssImportIndex} from "${cssPath}" assert { type: "css" };\n`;
            cssImportIndex++;
        });
    });
    if (cssImports.length) {
        code += `const __customStyleSheets = [`;
        for(let i = 0; i < cssImports.length; i++){
            code += `sheet${i}`;
            if (i < cssImports.length - 1) {
                code += `, `;
            }
        }
        code += `];\n`;
        code += `document.adoptedStyleSheets = [...document.adoptedStyleSheets, ...__customStyleSheets];\n`;
    }
    code += source.substring(lastIndex);
    if (!hasReactImports) {
        code = `import React from 'react';\n${code}`;
    }
    return code;
}
function createRenderer(createModule_, getModuleUrl) {
    let reactRoot;
    async function render(files) {
        const mod = await createModule_(files, {
            getModuleUrl
        });
        const ReactMod = await self.importShim('react');
        const ReactDOMMod = await self.importShim('react-dom/client');
        const _jsx = ReactMod.createElement;
        const root = document.getElementById('__reactRoot');
        class ErrorBoundary extends ReactMod.Component {
            componentDidCatch(error) {
                this.setState({
                    error
                });
            }
            render() {
                if (this.state.error) {
                    return _jsx('div', null, this.state.error?.message);
                }
                return this.props.children;
            }
            constructor(props){
                super(props);
                this.state = {
                    error: null
                };
            }
        }
        if (!reactRoot) {
            reactRoot = ReactDOMMod.createRoot(root);
        }
        const Component = mod.default;
        const element = _jsx(ErrorBoundary, null, _jsx(Component));
        reactRoot.render(element);
    }
    return render;
}
function createMainScript({ uid }) {
    const code = `\
'use strict';
const _createModule = ${createModule.toString()};
const _createRenderer = ${createRenderer.toString()};

const getModuleUrl = (m) => window.parent.__devjar__[globalThis.uid].getModuleUrl(m)

globalThis.uid = ${JSON.stringify(uid)};
globalThis.__render__ = _createRenderer(_createModule, getModuleUrl);
`;
    return code;
}
function createEsShimOptionsScript() {
    return `\
window.esmsInitOptions = {
  polyfillEnable: ['css-modules', 'json-modules'],
  onerror: error => console.log(error),
}`;
}
function useScript() {
    return useRef(typeof window !== 'undefined' ? document.createElement('script') : null);
}
function createScript(scriptRef, { content, src, type } = {}) {
    const script = scriptRef.current;
    if (type) script.type = type;
    if (content) {
        script.src = `data:text/javascript;utf-8,${encodeURIComponent(content)}`;
    }
    if (src) {
        script.src = src;
    }
    return script;
}
function useLiveCode({ getModuleUrl }) {
    const iframeRef = useRef(null);
    const [error, setError] = useState();
    const rerender = useState({})[1];
    const appScriptRef = useScript();
    const esShimOptionsScriptRef = useScript();
    const tailwindcssScriptRef = useScript();
    const uid = useId();
    // Let getModuleUrl executed on parent window side since it might involve
    // variables that iframe cannot access.
    useEffect(()=>{
        if (!globalThis.__devjar__) {
            globalThis.__devjar__ = {};
        }
        globalThis.__devjar__[uid] = {
            getModuleUrl
        };
        return ()=>{
            if (globalThis.__devjar__) {
                delete globalThis.__devjar__[uid];
            }
        };
    }, []);
    useEffect(()=>{
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentDocument) return;
        const doc = iframe.contentDocument;
        const body = doc.body;
        const div = document.createElement('div');
        div.id = '__reactRoot';
        const appScriptContent = createMainScript({
            uid
        });
        const scriptOptionsContent = createEsShimOptionsScript();
        const esmShimOptionsScript = createScript(esShimOptionsScriptRef, {
            content: scriptOptionsContent
        });
        const appScript = createScript(appScriptRef, {
            content: appScriptContent,
            type: 'module'
        });
        const tailwindScript = createScript(tailwindcssScriptRef, {
            src: 'https://cdn.tailwindcss.com'
        });
        body.appendChild(div);
        body.appendChild(esmShimOptionsScript);
        body.appendChild(appScript);
        body.appendChild(tailwindScript);
        return ()=>{
            if (!iframe || !iframe.contentDocument) return;
            body.removeChild(div);
            body.removeChild(esmShimOptionsScript);
            body.removeChild(appScript);
            body.removeChild(tailwindScript);
        };
    }, []);
    const load = useCallback(async (files)=>{
        if (!esModuleLexerInit) {
            await init;
            esModuleLexerInit = true;
        }
        if (files) {
            // { 'react', 'react-dom' }
            const overrideExternals = new Set(Object.keys(files).filter((name)=>!isRelative(name) && name !== 'index.js'));
            // Always share react as externals
            overrideExternals.add('react');
            overrideExternals.add('react-dom');
            try {
                /**
         * transformedFiles
         * {
         *  'index.js': '...',
         *  '@mod1': '...',
         *  '@mod2': '...',
         */ const transformedFiles = Object.keys(files).reduce((res, filename)=>{
                    const key = isRelative(filename) ? '@' + filename.slice(2) : filename;
                    if (filename.endsWith('.css')) {
                        res[key] = files[filename];
                    } else {
                        res[key] = transformCode(files[filename], getModuleUrl, overrideExternals);
                    }
                    return res;
                }, {});
                const iframe = iframeRef.current;
                const script = appScriptRef.current;
                if (iframe) {
                    const render = iframe.contentWindow.__render__;
                    if (render) {
                        render(transformedFiles);
                    } else {
                        // if render is not loaded yet, wait until it's loaded
                        script.onload = ()=>{
                            iframe.contentWindow.__render__(transformedFiles);
                        };
                    }
                }
                setError(undefined);
            } catch (e) {
                console.error(e);
                setError(e);
            }
        }
        rerender({});
    }, []);
    return {
        ref: iframeRef,
        error,
        load
    };
}

const defaultOnError = typeof window !== 'undefined' ? console.error : ()=>{};
function DevJar({ files, getModuleUrl, onError = defaultOnError, ...props }) {
    const onErrorRef = useRef(onError);
    const { ref, error, load } = useLiveCode({
        getModuleUrl
    });
    useEffect(()=>{
        onErrorRef.current(error);
    }, [
        error
    ]);
    // load code files and execute them as live code
    useEffect(()=>{
        load(files);
    }, [
        files
    ]);
    // Attach the ref to an iframe element for runtime of code execution
    return React.createElement('iframe', {
        ...props,
        ref
    });
}

export { DevJar, useLiveCode };
