/** Standards compatibility for the isolated DSH document on AcceptCat's Chromium 108.
 * No Electron, filesystem, credentials, IPC or Node objects are exposed to this world.
 */
declare const AC_DSH_POLYFILLS: string;
export const dshBrowserCompatibility = AC_DSH_POLYFILLS + `;(() => {
  if (!AbortSignal.any) Object.defineProperty(AbortSignal, 'any', {
    configurable: true, writable: true, value: function (input) {
      const signals = Array.from(input);
      if (signals.some(signal => !(signal instanceof AbortSignal))) throw new TypeError('Expected AbortSignal');
      const controller = new AbortController();
      const listeners = new Map();
      const abort = signal => {
        controller.abort(signal.reason);
        for (const [source, listener] of listeners) source.removeEventListener('abort', listener);
        listeners.clear();
      };
      for (const signal of new Set(signals)) {
        if (signal.aborted) { abort(signal); break; }
        const listener = () => abort(signal);
        listeners.set(signal, listener);
        signal.addEventListener('abort', listener, { once: true });
      }
      return controller.signal;
    }
  });
})();`;
