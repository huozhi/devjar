import * as React from 'react';
import React__default from 'react';

declare function DevJar({ files, getModuleUrl, onError, ...props }: {
    files: any;
    getModuleUrl?: (name: string) => string;
    onError?: (...data: any[]) => void;
}): React__default.DetailedReactHTMLElement<React__default.HTMLAttributes<any>, any>;

declare global {
    interface Window {
        esmsInitOptions: {
            shimMode: boolean;
            mapOverrides: boolean;
        };
    }
    function importShim(url: string): Promise<any>;
}

declare function useLiveCode({ getModuleUrl }: {
    getModuleUrl?: (name: string) => string;
}): {
    ref: React.RefObject<any>;
    error: undefined;
    load: (files: any) => Promise<void>;
};

export { DevJar, useLiveCode };
