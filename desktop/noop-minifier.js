/**
 * 直通 minifier:Release 桌面包不压缩。
 * 原因:minifier 会破坏 uniwind 虚拟 CSS 模块的序列化代码(运行时
 * 「Cannot read property 'select' of undefined」闪退);hermesc 同理已关。
 * 代价:main.jsbundle 体积变大(demo 项目可接受,见 desktop/README.md)。
 */
module.exports.minify = ({ code, map }) => ({ code, map });
