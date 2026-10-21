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
// 双壳共源去重:frontend 与 desktop 各有 node_modules,react/react-native 必须锚定
// desktop 副本(19.2.0 对齐 react-native-macos 0.83)。extraNodeModules 只是回退
// (frontend/src 沿目录树仍会命中 frontend/node_modules/react@19.3 → 双 React 副本
// → Invalid hook call),必须用 resolveRequest 硬拦截;uniwind 的 resolver 会链到它。
const fs = require("node:fs");
const desktopReactDir = path.resolve(__dirname, "node_modules/react");
const desktopRNDir = path.resolve(__dirname, "node_modules/react-native");
// 包内子路径 → 真实文件(补扩展名/目录 index)
function resolveLocalFile(dir, sub) {
  const candidates = [
    sub,
    `${sub}.js`,
    `${sub}.json`,
    path.join(sub, "index.js"),
  ];
  for (const c of candidates) {
    const p = path.join(dir, c);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return p;
    }
  }
  return null;
}
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // 裸名与深路径(react-native/Libraries/…、react/jsx-runtime 等)一律锚定
  // desktop 副本,防 frontend/node_modules 的 react@19.3 / react-native@0.88 混入
  // (extraNodeModules 只是回退,挡不住 frontend/src 沿目录树的常规解析)
  const redirect = (dir) => {
    const sub = moduleName.startsWith("react-native/")
      ? moduleName.slice("react-native/".length)
      : moduleName.startsWith("react/")
        ? moduleName.slice("react/".length)
        : "index.js";
    const filePath = resolveLocalFile(dir, sub);
    return filePath ? { filePath, type: "sourceFile" } : undefined;
  };
  if (moduleName === "react" || moduleName.startsWith("react/")) {
    const r = redirect(desktopReactDir);
    if (r) {
      return r;
    }
  }
  if (moduleName === "react-native" || moduleName.startsWith("react-native/")) {
    const r = redirect(desktopRNDir);
    if (r) {
      return r;
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

// withUniwindConfig 会覆盖 transformerPath,故在其之后再包一层修 full-source-map 兼容
const withUniwind = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind.d.ts",
});

module.exports = {
  ...withUniwind,
  transformerPath: require.resolve("./metro.transform.js"),
};
