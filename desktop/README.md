# desktop — react-native-macos 桌面壳

vn-demo 的原生 macOS 客户端(替代早期 Electron 壳):**react-native-macos 0.83**(Fabric 新架构)+ uniwind(Tailwind v4)琥珀终端 UI。与 `../frontend/` 双壳共享源码——本目录只保留壳(侧栏导航状态机 + 健康探测 + Metro 配置),页面体/组件/图表全部来自 `../frontend/src/`(经 Metro `watchFolders` + uniwind `@source` 引入)。

## 前置

- Xcode(完整版,`xcode-select -s` 指向它)
- CocoaPods:`brew install cocoapods`
- 后端已在 `:8000` 运行(API 地址缺省 `http://localhost:8000`,状态行显示连通状态、可点重试)

## 运行

```bash
cd desktop
npm install          # 依赖(react-native-macos 0.83 / uniwind / react-native-webview)
npm run macos        # 构建 + 启动(首次 pod install 较久)
npm start            # Metro :8081(Debug 构建需它供 JS 包;Release 打静态 bundle 属后续项)
```

## 结构

```
desktop/
├── App.tsx            # 侧栏(回测配置/历史记录)+ 主区共享 screens + 探测注入
├── src/navigation.ts  # 导航状态机(纯逻辑,TDD 于 frontend/__tests__/desktop-logic.test.ts)
├── src/health.ts      # healthz 探测(一次,不轮询)
├── global.css         # 琥珀 token(与 frontend/global.css 同套,@source 扫描 frontend/src)
├── metro.config.js    # watchFolders + nodeModulesPaths + withUniwindConfig
└── macos/             # Xcode 工程(macos-init 生成;Pods/build 已 gitignore)
```

## 已知坑(实测复盘,详见根 findings.md)

- `react-native-macos@0.83.0` peer 钉 `react-native@0.83.10`(模板默认 0.83.0 会 eresolve)
- 模板 `AppDelegate.swift` 的 `let` 属性在 `super.init()` 后赋值会编译失败(本仓库已修)
- 本仓库目录在 FileProvider 同步盘下时,codesign 报「resource fork, Finder information …」:`xattr -cr desktop/macos/Pods` 后将产物放同步盘外(`-derivedDataPath /tmp/vndemo-dd`)即可
- 本机 npm 有 allow-scripts 安全策略,RN CLI 的 `--allow-scripts` 会被拒 → 用模板 tarball 手工组装工程(本仓库工程已是成品,重装时直接 `npm install` 即可)
