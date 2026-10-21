/**
 * uniwind transformer 包装:修复 Release 打包时的
 * 「Unexpected module with full source map found」(uniwind 注入的 map 形态与
 * RN 0.83 metro 序列化器期望的 VLQ 数组不兼容)。
 * 本项目 Release 不消费 sourcemap,故将非数组的 full map 置空即可。
 */
const path = require("node:path");
const uniwindPkgDir = path.dirname(require.resolve("uniwind/package.json"));
const uniwind = require(path.join(uniwindPkgDir, "dist", "metro", "transformer.cjs"));

module.exports.transform = async function transform(config, projectRoot, filePath, data, options) {
  const result = await uniwind.transform(config, projectRoot, filePath, data, options);
  for (const out of result?.output ?? []) {
    const map = out?.data?.map;
    if (map != null && !Array.isArray(map)) {
      out.data.map = undefined;
    }
  }
  return result;
};
