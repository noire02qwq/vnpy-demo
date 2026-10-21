// Release 打包专用 metro 配置:在通用配置(uniwind + 去重 + transform 包装)之上
// 将 minifier 替换为直通实现(禁压缩),供 Xcode「Bundle React Native」阶段经
// BUNDLE_CONFIG=metro.release.config.js 注入(见 project.pbxproj 的 bundle 阶段脚本)。
const base = require("./metro.config.js");

module.exports = {
  ...base,
  transformer: {
    ...(base.transformer ?? {}),
    minifierPath: require.resolve("./noop-minifier.js"),
    minifierConfig: {},
  },
};
