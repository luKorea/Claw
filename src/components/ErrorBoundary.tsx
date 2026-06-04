import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangleIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 全局 ErrorBoundary：捕获渲染错误并显示兜底 UI，避免整个应用白屏。
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  override render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <AlertTriangleIcon className="size-12 text-destructive" />
          <div>
            <h2 className="text-lg font-semibold">出错了</h2>
            <pre className="mt-2 max-w-md overflow-auto rounded border bg-muted/30 p-3 text-left text-xs">
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
          </div>
          <Button onClick={this.reset}>重试</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
