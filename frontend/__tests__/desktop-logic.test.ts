/** desktop 壳纯逻辑:导航状态机 + 后端健康探测(fetch mock) */
import { navReducer, initialState } from "../../desktop/src/navigation";
import { probeBackend } from "../../desktop/src/health";

describe("navReducer", () => {
  it("初始为 config", () => {
    expect(initialState.route.name).toBe("config");
  });

  it("selectTab 切换 history", () => {
    expect(
      navReducer(initialState, { type: "selectTab", tab: "history" }).route,
    ).toEqual({ name: "history" });
  });

  it("openRun 进 result 并记住来源", () => {
    const s = navReducer(initialState, {
      type: "openRun",
      runId: "r1",
      from: "history",
    });
    expect(s.route).toEqual({ name: "result", runId: "r1" });
    expect(s.returnTo).toBe("history");
  });

  it("back 回到来源 tab", () => {
    const s = navReducer(initialState, {
      type: "openRun",
      runId: "r1",
      from: "config",
    });
    expect(navReducer(s, { type: "back" }).route).toEqual({ name: "config" });
  });

  it("result 态下可直切 tab(selectTab 覆盖)", () => {
    const s = navReducer(initialState, {
      type: "openRun",
      runId: "r1",
      from: "config",
    });
    expect(
      navReducer(s, { type: "selectTab", tab: "history" }).route,
    ).toEqual({ name: "history" });
  });
});

describe("probeBackend", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("healthz ok → true", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    await expect(probeBackend("http://localhost:8000")).resolves.toBe(true);
  });

  it("非 2xx → false", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: false } as Response);
    await expect(probeBackend("http://localhost:8000")).resolves.toBe(false);
  });

  it("网络异常 → false", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("down"));
    await expect(probeBackend("http://localhost:8000")).resolves.toBe(false);
  });
});
