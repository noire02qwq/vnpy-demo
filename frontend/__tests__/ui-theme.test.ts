/** token 常量契约:mono 字体按平台映射、cn 拼接语义(纯函数,零 mock) */
import { monoFontFor } from "../src/ui/theme";
import { cn } from "../src/ui/cn";

describe("monoFontFor", () => {
  it("android 用 monospace 家族", () => {
    expect(monoFontFor("android")).toBe("monospace");
  });

  it("ios/macos 用 Menlo", () => {
    expect(monoFontFor("ios")).toBe("Menlo");
    expect(monoFontFor("macos")).toBe("Menlo");
  });

  it("web 用等宽字体栈", () => {
    expect(monoFontFor("web")).toContain("monospace");
  });
});

describe("cn", () => {
  it("拼接多个 class", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("过滤假值", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });
});
