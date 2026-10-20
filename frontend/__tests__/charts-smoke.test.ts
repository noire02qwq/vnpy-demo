/**
 * 组件 smoke:仅断言双平台 LightChart 与 ThreeLineChart 模块可导入、导出非空。
 * 不做 canvas 渲染测试;第三方重依赖(lightweight-charts ESM、react-native-webview
 * 原生模块)在 jest 环境以轻量 mock 顶替,验证的是本仓库代码的模块可导入性。
 */
jest.mock("lightweight-charts", () => ({
  createChart: jest.fn(),
  createSeriesMarkers: jest.fn(),
  CandlestickSeries: { type: "Candlestick" },
  LineSeries: { type: "Line" },
  HistogramSeries: { type: "Histogram" },
  ColorType: { Solid: "solid" },
}), { virtual: true });
jest.mock("react-native-webview", () => ({ WebView: () => null }));

import { LightChart } from "../src/charts/LightChart.web";
import { LightChart as LightChartNative } from "../src/charts/LightChart.native";
import { ThreeLineChart } from "../src/charts/ThreeLineChart";

describe("charts smoke", () => {
  it("LightChart web/native 与 ThreeLineChart 模块可导入且导出为函数组件", () => {
    expect(typeof LightChart).toBe("function");
    expect(typeof LightChartNative).toBe("function");
    expect(typeof ThreeLineChart).toBe("function");
  });
});
