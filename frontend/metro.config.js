// Metro 配置:接入 uniwind(Tailwind v4 for RN);cssEntryFile 为 token 样式入口
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind.d.ts",
});
