# bento/slides — Highcharts edition

本 Fork 的幻灯片图表**全部使用 Highcharts 13.1.1**，不提供引擎切换。
Highcharts Core、highcharts-more、xrange、exporting 和 accessibility 模块直接打包进 HTML，
不依赖 CDN；柱状图、条形图、折线图、面积图、饼图、散点图、瀑布图、箱线图、区间图可从面板选择。
代码适配层仍为 MIT；Highcharts 受 Highsoft 的许可约束，使用公司已有商业许可部署。

## 部署和升级

按照 [内网服务部署说明](../server/import/README.md) 部署。已部署的服务器：

```powershell
Set-Location D:\bento
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\server\import\Setup.ps1
# 停止并重新启动你现有的 Node 进程或计划任务，使转换服务使用新构建的外壳。
```

无需另外安装 Highcharts；`npm ci` 按锁文件安装版本，`build:single` 会把它包含在 HTML 中。
应用身份使用 `bento-slides-highcharts`，不接受上游普通版的签名更新包，避免更新后失去 Highcharts；
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
- 饼图要求两列（名称、数值）。箱线图和区间图的多维点使用原生 JSON 编辑。
- CSV 应用后解除原来的表格联动，避免表格更新覆盖 CSV。图表的其他配置尽量保留。
- 原始 CSV 文件不随文档保存，解析后的数据随单个 HTML 保存，接收方无需 CSV 文件。

## 显示和导出

编辑画布、缩略图、打印、图片导出用 Highcharts SVG 快照。
演示模式使用交互实例，支持 tooltip、图例和拖动选择缩放区域；离开页面即销毁实例。
本版没有实现跨页图表数据的 Morph 插值动画。

HTML 保存保留完整原生配置和数据。PDF/幻灯片图片保留图表外观。
**原生 Highcharts 图表导出到 PPTX 时目前转为可编辑数据表**，包含完整点 JSON 并在报告中说明；
不会把无法正确表达的图表伪装成 PowerPoint 原生图表。PPT 原生图表的导入是另一项功能，尚未添加。

## 验证

```sh
node --test slides/tests/highcharts-data.test.mjs
npm run build:single --prefix slides
# 浏览器验收由 .github/workflows/ci-highcharts.yml 在 Windows/Linux 执行。
```
