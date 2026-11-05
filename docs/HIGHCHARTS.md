# bento/slides — Highcharts edition

本 Fork 的幻灯片图表**全部使用 Highcharts 13.1.1**，不提供引擎切换。
仅将 Highcharts Core 打包进 HTML，不依赖 CDN。未打包 highcharts-more、xrange、exporting、accessibility 或 Highstock。
面板保留柱状图、条形图、折线图、面积图、饼图和散点图；不再提供瀑布图、箱线图或区间图。
代码适配层仍为 MIT；Highcharts 受 Highsoft 的许可约束，使用公司已有商业许可部署。

## 部署和升级

按照 [内网服务部署说明](../server/import/README.md) 部署。已部署的服务器：

```powershell
Set-Location D:\bento
git switch main
git pull --ff-only origin main
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\server\import\Setup.ps1
# 停止并重新启动你现有的 Node 进程或计划任务，使转换服务使用新构建的外壳。
```

无需另外安装 Highcharts；`npm ci` 按锁文件安装版本，`build:single` 会把它包含在 HTML 中。
本版保持文档存储身份不变，但关闭了上游更新检查，避免更新后失去 Highcharts；
升级此版本通过更新 Fork 源码并重新构建完成。没有创建签名密钥或发布新的在线更新通道。

## 编辑图表

点击工具栏的“图表”，右侧属性面板提供类型、图例、标题和系列名称/颜色。
选择类型预设会替换当前配置；不想替换数据和样式时，直接修改下方 Highcharts JSON。
配置示例：

```json
{
  "chart": { "type": "line" },
  "title": { "text": "Tumor size change" },
  "xAxis": { "title": { "text": "Week" } },
  "yAxis": { "title": { "text": "Change from baseline (%)" } },
  "tooltip": { "pointFormat": "{series.name}: {point.y}%" },
  "series": [
    { "name": "Subject 01", "data": [[0,0],[6,-25],[12,-38]] }
  ]
}
```

使用 Highcharts 的 `colors`、`xAxis.categories`、`series[].yAxis`、`dataLabels` 等原生字段。
只接受纯 JSON，不能直接粘贴 `Highcharts.chart(...)` 或 JavaScript formatter 函数；
使用 `{point.y}` 等 Highcharts 格式字符串。CSV 和 JSON 都作为数据保存，既不会运行脚本，也不会执行 CSV 公式。
外部数据加载、远程图片、HTML 标签、自定义事件回调、外部导出服务和动态脚本加载被禁用。

## CSV 文件 / 粘贴 CSV

选中图表 → 右侧“导入 CSV”：

1. 选择本地 UTF-8 `.csv`/`.tsv` 文件，或直接粘贴文本。
2. 设置首行是否为表头、首列为分类还是数值 X，以及分隔符（自动/逗号/分号/制表符）。
3. 点击“应用 CSV 数据”。每个数值列成为一个数据系列，表头成为系列名。

分类示例：

```csv
Visit,Arm A,Arm B
Baseline,12,18
Week 6,15,NA
Week 12,20,25
```

数值 X 示例（选择“首列：数值 X”）：

```csv
Week,Subject 01,Subject 02
0,0,0
6,-25,-12
12,-38,-20
```

- 支持 UTF-8 BOM、CRLF、带引号的逗号/换行，以及 `""` 转义。
- 支持负数、小数、科学计数法；带千分位的值需按 CSV 规则加引号，例如 `"1,200"`。
- 空白、NA、N/A、null 为缺失值 `null`；其他非数值数据报错，不会自动变成 0。
- 百分数字符串保留百分数数值：`35%` 导入为 `35`，不是 `0.35`。
- 文件上限 2 MiB、最多 2000 数据行/50 列；总值数量还受文档配置大小限制。
- 饼图要求两列（名称、数值）。JSON 配置也仅支持 Core 自带图表，不加载附加模块。
- CSV 应用后解除原来的表格联动，避免表格更新覆盖 CSV。图表的其他配置尽量保留。
- 原始 CSV 文件不随文档保存，解析后的数据随单个 HTML 保存，接收方无需 CSV 文件。

## 显示和导出

编辑画布、缩略图、打印、图片导出直接使用 Core 渲染的 SVG 快照，不依赖 exporting 模块。
演示模式使用交互实例，支持 tooltip、图例和拖动选择缩放区域；离开页面即销毁实例。
跨页 Morph 支持匹配图表的数据过渡：类型、点数、分类/坐标及系列配置一致时，数值随演示设置的 Morph 时长变化。
可使用相同元素 ID 或 Morph ID 配对；结构或缺失位置改变时直接显示新图表。开启减少动态效果时直接显示最终数据。

HTML 保存保留完整原生配置和数据。PDF/幻灯片图片保留图表外观。
Highcharts 的柱形、条形、折线/样条线、面积、饼图/圆环及散点图可导出为 PowerPoint 原生可编辑图表。
支持分类数据、数值 X 折线、稀疏缺失点和双轴组合（每轴一种图形）；保留基础系列颜色和轴范围。柱形/条形图还保留逐点指定的十六进制实色（#RGB 或 #RRGGBB）；其他逐点颜色配置仍使用数据表回退。
PowerPoint 视觉样式、标签与布局可能不同，未在真实 PowerPoint 桌面程序中人工验收。
堆叠、日期/对数轴、多维特殊图及其他超出子集的配置继续导出为包含完整点 JSON 的可编辑数据表，并在报告说明。PPTX 原生图表导入支持柱形、条形、折线、面积、饼图、圆环和散点图，转换成可编辑 Highcharts。
使用 PPTX 内部缓存数据，不打开外部链接，也不计算嵌入工作簿公式；无缓存、3D、日期轴及不支持的混合图会保留占位框并报告原因。
保留系列名、分类、数值、缺失点、基本系列颜色、堆叠方式和纵轴范围；Office 标签和排版可能不同。
每系列最多 2000 点、最多 50 系列，总配置还受数据预算限制。

PPTX 表格导入为可编辑网格，保留文字、列宽、显式单元格颜色及部分文字格式。
合并单元格展开为网格，独立行高改为等高；Office 表格样式、边框、内边距及各单元格字号可能不同，转换报告会说明。

## 复杂形状导入进展

自定义 DrawingML 几何可导入为可编辑 path，支持 17 类指南公式、直线、二次/三次贝塞尔曲线、椭圆弧和翻转。
多路径对象按绘制顺序保留为一组路径，分别保留填充/描边开关；文字仍是单独的可编辑文字对象。
几何解析代码不打包进单文件编辑器。文档只携带生成的路径、样式和文字，未嵌入源 PPTX 或栅格预览。
本阶段不代表所有 PowerPoint 对象均已保真：路径填充变亮/变暗、复杂阴影、文字几何边界、完整预设目录和 SmartArt 自动布局仍有缺口；无效/超限/不支持的几何通过报告说明并保留矩形回退。

## 验证

```sh
node --test slides/tests/highcharts-data.test.mjs
npm run build:single --prefix slides
# 浏览器验收由 .github/workflows/ci-highcharts.yml 在 Windows/Linux 执行。
```
