import React from 'react';
import { t } from '../i18n';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches errors thrown during rendering — including failed dynamic imports
 * (`React.lazy` chunks that 404 or time out). Instead of letting the whole app
 * crash, it shows an inline "something went wrong, retry" screen.
 *
 * Wrapping every `<Suspense>` boundary with this gives each route its own
 * fault isolation: a flaky network on one screen won't take down the rest.
 */
export class ErrorBoundary extends (React.Component as any) {
  declare props: Props;
  declare state: State;
  declare setState: (s: Partial<State>) => void;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen bg-slate-50 flex items-center justify-center p-4"
          dir="auto"
        >
          <div className="text-center space-y-4 max-w-sm">
            {/* icon */}
            <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>

            <h2 className="text-lg font-semibold text-slate-800">
              {t('حدث خطأ')}
            </h2>

            <p className="text-sm text-slate-500">
              {t('حدث خطأ أثناء تحميل الصفحة. تأكد من اتصالك بالإنترنت وأعد المحاولة.')}
            </p>

            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                         bg-indigo-600 text-white text-sm font-medium
                         hover:bg-indigo-700 active:bg-indigo-800
                         transition-colors focus:outline-none focus:ring-2
                         focus:ring-indigo-500 focus:ring-offset-2"
            >
              {/* refresh icon */}
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h5M20 20v-5h-5M20.49 9A9 9 0 105.64 5.64L4 4m15.36 15.36L20 20"
                />
              </svg>
              {t('أعد المحاولة')}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
