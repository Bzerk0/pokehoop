import { Component, type ReactNode } from "react";

/** If a page crashes, say so (with a way out) instead of leaving a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-[720px] p-4">
        <div className="px-box flex flex-col gap-3 p-4 text-[24px]">
          <span className="font-head text-[16px] text-red">SOMETHING BROKE</span>
          <span>This screen hit an error. Your teams are saved; try again or head back to the title.</span>
          <code className="text-[18px] text-cloud">{this.state.error.message}</code>
          <span className="flex gap-2">
            <button className="px-btn" onClick={() => location.reload()}>RELOAD</button>
            <button className="px-btn" onClick={() => location.assign("/")}>TITLE</button>
          </span>
        </div>
      </div>
    );
  }
}
