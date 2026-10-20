# vn-demo 项目规范

个人研究项目:vnpy 量化交易策略与回测 demo。后端 FastAPI + vnpy 4.5.0(无 GUI 程序化回测),前端 Expo React Native(iOS/Android/Web)+ Electron 桌面壳。作者 noire02qwq。

## 硬性约定

- **Python 3.12 + uv**(对齐 harness-hub 后端);禁止混用 pip 直装,一切经 `uv add` / `uv sync`
- **标识符/代码用英文,注释与文档用中文**;commit message 用中文 conventional commits
- **TDD 铁律**:先写失败测试,再写实现;`pytest` 全绿才允许提交
- **实时提交推送**:每完成一个切片(功能+测试全绿+文档更新)即 commit + push origin
- 大改动拉 `feat/*` 分支,自测全绿后合回 main;小步改动直接 main
- commit footer 统一追加:`Co-Authored-By: Claude Code <noreply@anthropic.com>`
- 本仓库身份(仓库级):`noire02qwq <46341642+noire02qwq@users.noreply.github.com>`,远程走 SSH `git@github.com:noire02qwq/vnpy-demo.git`;**不要动父目录 agent-studio 仓库**

## 目录结构规范

```
vn-demo/
├── CLAUDE.md            # 本规范
├── README.md            # 项目说明与快速开始
├── task_plan.md         # planning-with-files 阶段计划(实时更新)
├── findings.md          # 研究发现(实时更新)
├── progress.md          # 会话进度日志(实时更新)
├── docs/
│   ├── research/        # 深度研究(code/web findings + 汇总报告)
│   └── superpowers/
│       ├── specs/       # 设计 spec(YYYY-MM-DD-<topic>-design.md)
│       └── plans/       # 实施计划(writing-plans 产出)
├── backend/             # FastAPI + vnpy(uv 管理)
│   ├── pyproject.toml   # deps + dev deps,requires-python >=3.12
│   ├── .python-version  # 3.12
│   ├── app/
│   │   ├── api/         # 路由:data.py backtests.py meta.py
│   │   ├── core/        # config.py errors.py(统一错误模型)
│   │   ├── data/        # yahoo.py validate.py bars.py cache.py
│   │   ├── engine/      # runner.py curves.py
│   │   ├── strategies/  # signals.py sizing.py cross.py tpsl.py turtle.py dca.py
│   │   ├── metrics/     # risk.py benchmark.py
│   │   ├── db/          # models.py session.py
│   │   └── main.py
│   └── tests/           # 与 app/ 镜像 + fixtures/(合成K线生成器)
├── frontend/            # Expo RN(启用 web)
│   ├── app/             # expo-router 页面:index(配置) result/[id] history
│   ├── src/
│   │   ├── api/         # 类型化客户端(openapi-typescript 生成 schema.ts)
│   │   ├── components/  # 通用 UI
│   │   └── charts/      # LightweightCharts 封装(web 直用,native 走 WebView)
│   └── __tests__/       # jest + @testing-library/react-native
├── desktop/             # Electron 壳(加载 web build 或 dev server)
└── docker/
    ├── backend.Dockerfile
    ├── frontend.Dockerfile
    ├── compose.yaml
    └── README.md
```

## 常用命令

```bash
# 后端(在 backend/)
uv sync                          # 安装依赖(含 vnpy/ta-lib)
uv run pytest                    # 全量测试
uv run pytest tests/strategies -k kdj -x   # 定向
uv run ruff check app tests      # lint(line-length 100)
uv run uvicorn app.main:app --reload       # 本地起服务 :8000

# 前端(在 frontend/)
npx expo start                   # 开发(iOS/Android/Web)
npx expo export -p web           # web 构建产物 dist/
npm test                         # jest
npm run desktop                  # Electron 壳加载 dist/

# Docker(在 docker/)
docker compose build backend / frontend
docker compose up backend frontend
```

## 代码规范

- Python:`ruff`(line-length 100, target py312),公共函数必须 type hints,docstring 中文一句话;禁 `# type: ignore` 除非有注释解释
- 策略代码即标准 vnpy `CtaTemplate` 子类,可脱离本服务独立回测
- TypeScript:`strict: true`;API 类型一律从 openapi schema 生成,禁止手写接口定义
- 配置一律 pydantic-settings / expo 常量文件,禁止散落魔法数

## 测试规范

- 每个公开函数/策略形态至少:正常路径 + 边界(股数 floor、现金不足、暖机不足)+ 异常路径
- 资金守恒断言贯穿策略测试:任意交易日 `cash + pos×close == equity`
- 数据层测试 mock yfinance,不真实联网;端到端 demo 手动验证
- 测试夹具:合成 K 线生成器(确定性构造金叉/死叉/突破序列),放 `tests/fixtures/`

## 文档规范

- task_plan.md:阶段状态与决策表实时更新;findings.md:任何新发现立即落盘;progress.md:每会话追加
- **README.md:项目介绍与「当前状态」里程碑表,每个里程碑(或每完成一个任务切片)完成即更新,实时推送**
- commit 前置检查:相关文档已同步 → 测试全绿 → 提交推送
