/** 桌面壳导航状态机:侧栏 tab + 结果页来源回退(纯逻辑,jest 直测) */
export type DesktopRoute =
  | { name: "config" }
  | { name: "history" }
  | { name: "result"; runId: string };

export interface NavState {
  route: DesktopRoute;
  /** result 返回时回退到的 tab */
  returnTo: "config" | "history";
}

export type NavAction =
  | { type: "selectTab"; tab: "config" | "history" }
  | { type: "openRun"; runId: string; from: "config" | "history" }
  | { type: "back" };

export const initialState: NavState = {
  route: { name: "config" },
  returnTo: "config",
};

export function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case "selectTab":
      return { route: { name: action.tab }, returnTo: action.tab };
    case "openRun":
      return {
        route: { name: "result", runId: action.runId },
        returnTo: action.from,
      };
    case "back":
      return { route: { name: state.returnTo }, returnTo: state.returnTo };
  }
}
