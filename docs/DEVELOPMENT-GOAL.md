# 持续开发目标：Windows 内网部署的 Highcharts 版 bento/slides

目标：PPTX → 可编辑 HTML → JSON/CSV 编辑与交互 → 可用的 PPTX 导出。
用户授权验证通过后直接合并 PR。此文件是可继续工作的仓库检查点，不是后台定时任务；最新测试状态见各 PR 的 Checks。

## 已完成并合并

- PR #1：Windows/Linux 内网转换服务器，默认 500 MiB 上传，Windows 安装和启动脚本。
- PR #2：slides 统一使用 Highcharts，原生 JSON、本地 CSV 和粘贴文本，离线保存与交互。
- PR #3：Windows 构建入口校验修复，共享整套 CI 通过。
- PR #4：PPTX 原生图表和表格导入，缺失值、分类和可编辑数据保留；Windows/Linux 浏览器验收通过。
- PR #5：7 类 Highcharts 原生 PPTX 导出，数值 X 折线、缺失值和双轴组合；Windows/Linux 往返及离线浏览器验收通过。
- PR #6：跨页图表数据 Morph、相同 Morph ID 配对、结构不匹配时直接显示新图；Windows/Linux 实际几何变化及减少动态效果验收通过。

- PR #7：真实服务端图表上传、下载及离线打开验收，修复 CI 测试入口登记。
- PR #8：仅打包 Highcharts Core，六类基础图表，直接 SVG 快照和离线栅格化验收。

## 开发范围

用户确认不需要原生移动端客户端。仅开发 Windows/Linux 内网导入服务与浏览器中的 HTML 编辑和展示；不为此安装 Swift 或开发 iOS/Android 客户端。原项目移动端 CI 的结果单独记录，不视为图表或导入服务的验收结果。

## 当前精简方案

用户已选择仅保留基础图表：移除 highcharts-more、xrange、exporting、accessibility，只打包 Core。
提供柱形、条形、折线、面积、饼图和散点图；SVG 快照直接读取 Core 渲染结果。

## 持续回归覆盖

- TypeScript、单文件构建、文档块 splice gate、模型与 i18n 一致性。
- 30 个转换测试组，CSV/过渡单元测试，8 项真实 HTTP/CLI 导入测试。
- 真实 101 MiB ZIP 超过旧 100 MiB 限制后转换；鉴权、超时、重启、删除和清理。
- Windows Node 24/26、Linux Node 24 服务器测试；Windows/Linux Node 26 Highcharts 浏览器测试。
- PPTX 图表上传 → 服务端子进程转换 → 文档形状校验 → HTML 下载 → 禁止外部 HTTP 的浏览器打开/渲染。
- PPTX 导入 → 原生图表导出 → 再导入 → HTML 保存及离线重开；中文、负数和缺失值保留。

## 明确的边界与后续候选

- PPTX 图表导入使用内嵌缓存，不计算工作簿公式。3D、日期轴、无缓存及不支持的混合图保留占位框并报告。
- PPTX 导出的堆叠、日期/对数轴、多维特殊图等仍使用完整点 JSON 数据表；后续可逐类扩展原生映射。
- 表格合并单元格展开、独立行高等高化；Office 样式和逐单元格字号不完整还原。
- Morph 仅插值身份稳定且结构匹配的数值；不支持图形类型切换、排序或新增/删除点的插值。
- 尚未在用户实际 Windows Server 或桌面 PowerPoint 中人工验收；自动 Windows runner 不能替代这些实机检查。

## 始终遵守

缺失值不填零；不支持的类型不伪装成另一种图；不使用旧渲染器；不自动更新回 upstream 普通版。
保留 docId、明文文档块、离线单文件及加密/协作约定。仅用合成数据测试，不处理或公开临床业务数据。
不发布签名版本、不操作服务器账号。
