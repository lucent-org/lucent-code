interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let api: VsCodeApi | undefined;

export function getVsCodeApi(): VsCodeApi {
  if (!api) {
    if (typeof acquireVsCodeApi === 'function') {
      api = acquireVsCodeApi();
    } else {
      // Dev fallback for standalone browser testing
      api = {
        postMessage: (msg: unknown) => console.log('[vscode-mock] postMessage:', msg),
        getState: () => undefined,
        setState: () => {},
      };
    }
  }
  return api;
}
