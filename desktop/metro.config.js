// 桌面壳 Metro:watchFolders 共享 frontend 源码 + uniwind(Tailwind v4)编译 className
const { getDefaultConfig } = require("@react-native/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const path = require("node:path");

const config = getDefaultConfig(__dirname);

// 共享 frontend/src(组件/图表/screens)与 frontend 的依赖(解析 react-native-webview 等)
const frontendRoot = path.resolve(__dirname, "../frontend");
config.watchFolders = [frontendRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(frontendRoot, "node_modules"),
];

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind.d.ts",
});
