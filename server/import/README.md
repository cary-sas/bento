# bento/import — Windows Server / Linux 内网导入服务

将 `.pptx` 上传到自己的服务器，后台生成 `.bento.html` 和 JSON 转换报告。
默认上传 500 MiB、解压总量 1500 MiB、单进程转换，最多保留 4 个任务，结束后 60 分钟清理。
这是内网转换工具，不是多租户文件平台；共享密码用户属于同一个信任组。

## Windows Server 部署

支持 Windows Server 2019/2022/2025，使用 Git、Windows PowerShell 5.1 或 PowerShell 7。运行时需要 **Node.js 24 或更新版本**；
**无需预先安装 Node.js**，Setup.ps1 检测不到合适版本时，会从 nodejs.org 下载便携版 Node.js 24，
按官方 SHASUMS256.txt 校验 SHA-256 后解压到 `server/import/runtime/node`。不修改系统 PATH、不需要管理员权限、不重启服务器。
便携运行时仍受单位软件安装策略约束。
不需要 Docker、Microsoft Office、Python 或 WSL。

```powershell
git clone https://github.com/cary-sas/bento.git D:\bento
Set-Location D:\bento
git switch feat/windows-import-server
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\server\import\Setup.ps1
Copy-Item .\server\import\config.example.ps1 .\server\import\config.local.ps1
notepad .\server\import\config.local.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\server\import\Start.ps1
```

默认打开 `http://127.0.0.1:3080`。首次 npm 安装需要联网；安装并构建完成后，运行转换无需联网。
离线部署可以在同架构、同 Node 主版本的 Windows 机器完成安装和构建，再复制目录；
不要从 Linux 复制 `node_modules`，其中的 esbuild 等二进制有平台区别。

### 让其他内网电脑访问

在 `config.local.ps1` 设置：

```powershell
$env:BENTO_HOST = '0.0.0.0'
$env:BENTO_TOKEN = '替换成至少16字符的随机访问密码'
```

重启程序，在服务器防火墙中仅允许所需内网网段访问 TCP 3080。
客户端访问 `http://服务器内网IP:3080` 并输入访问密码。HTTP 不加密传输，涉及保密资料应使用下述 HTTPS 方式。
服务端不向第三方上传文件，也不会自动下载程序外壳。下载后的标准编辑器有独立的更新和协作功能；
如需阻止其联网，请在编辑器中启用 Offline 模式，或由网络策略限制外联。

### IIS + 内网 HTTPS（可选）

Node 保持 `127.0.0.1:3080`，IIS 站点配置内网 DNS 和已被客户端信任的 HTTPS 证书。
安装 URL Rewrite 和 ARR 并启用代理，将站点所有路径转发到 `http://127.0.0.1:3080/{R:1}`。
**保留原始 Host 请求头**，否则浏览器请求的 Origin 和 Host 不一致会被拒绝。
IIS 的 `requestFiltering/requestLimits/maxAllowedContentLength` 要允许上传量（500 MiB = 524288000 字节）；
若再有上游代理，也需检查它的请求大小与上传超时。转换在后台运行，上传响应不等待转换结束。
设置 `BENTO_SECURE_COOKIES=1`，并建议同时启用 `BENTO_TOKEN`。本服务原生以根路径 `/` 部署，不支持子路径挂载。
不要把仓库目录或临时文件目录设为 IIS 静态文件根目录，只代理本服务提供的路由。

### 开机运行，不依赖交互登录

提供的是 Windows **计划任务**，不是直接向 SCM 注册的 Windows 服务。不要用 `sc.exe create` 直接启动 Node。
创建专用普通账号，给它仓库读取权限、数据目录修改权限、Node 执行权限和“作为批处理作业登录”权限。
在管理员 PowerShell 中运行：

```powershell
.\server\import\Install-StartupTask.ps1
Start-ScheduledTask -TaskName 'bento-import'
Get-ScheduledTaskInfo -TaskName 'bento-import'
```

安装时会弹出账号凭据窗口，密码交给 Windows 任务计划程序保存，不写入仓库。
使用便携版时，Start.ps1 自动找到项目中的 Node，该账号需要此目录的读取和执行权限。
使用系统 Node 时，确保该账号的 PATH 能找到它。
日志在 `server/import/data/logs/`；请按单位日志保留策略轮转。
修改配置后重启任务；升级前停止任务，升级后重新运行 Setup.ps1 构建，再启动任务。

```powershell
Stop-ScheduledTask -TaskName 'bento-import'
Start-ScheduledTask -TaskName 'bento-import'
# 如需移除：Unregister-ScheduledTask -TaskName 'bento-import' -Confirm:$false
```

## Linux

```sh
cd slides
npm ci
npm run build:single
cd ..
BENTO_HOST=0.0.0.0 BENTO_TOKEN='replace-with-a-long-random-password' node server/import/server.mjs
```

可使用系统已有的进程管理器运行。Windows 和 Linux 调用同一转换器，保留原有浏览器转换功能。

## 配置

| 环境变量 | 默认值 | 含义 |
|---|---|---|
| `BENTO_HOST` | `127.0.0.1` | 监听地址；非回环地址必须配置访问密码 |
| `BENTO_PORT` | `3080` | 监听端口 |
| `BENTO_TOKEN` | 空 | 至少 16 字符的共享访问密码；登录后使用 8 小时 HttpOnly 会话 |
| `BENTO_SECURE_COOKIES` | `0` | HTTPS 访问时设为 `1` |
| `BENTO_MAX_INPUT_MB` | `500` | 上传和转换输入上限，MiB，1–4096 |
| `BENTO_MAX_UNPACKED_MB` | `1500` | ZIP 声明的解压总量上限，MiB，1–4096 |
| `BENTO_MAX_JOBS` | `4` | 上传、排队、转换、已完成和失败任务的总数上限 |
| `BENTO_TIMEOUT_SECONDS` | `900` | 单次转换超时 |
| `BENTO_RETENTION_MINUTES` | `60` | 成功或失败后的保留时间 |
| `BENTO_SHELL` | 本地 slides 构建结果 | 本地 HTML 外壳路径 |
| `BENTO_DATA_DIR` | `server/import/data` | 私有上传和结果目录 |

运行单个实例，数据目录不要与其他实例共享。任务和结果可以跨进程重启保留；
未完成的上传/转换重启后标记失败，原始上传被删除，需要重新上传。
同一个标签页会记住当前任务；删除或过期后可转换下一个。不同用户/标签页可排队，服务器一次只转换一个任务。
文件名仅作展示，磁盘路径使用随机任务 ID。下载链接需要同一登录会话（若启用了密码）。
知道任务链接的同组用户可以访问结果，没有任务列表或用户隔离。

## 大文件的实际边界

500 MiB 是**允许尝试转换的上限**，不保证任何 500 MiB 的演示文稿都能成功。
建议从 8 GB 可用内存起评估，按实际文件监控内存和磁盘；4 GB Node 堆上限不是进程总内存限制。
并发保持 1，以免多个解压任务同时耗尽内存。图片 Base64、JSON 和 HTML 会额外占用内存和磁盘。
ZIP64、5000 个 ZIP 条目、压缩比和 ZIP 单条目 256 MiB 的保护继续保留。
文档运行时仍限制 500 页、2000 资源、单资源 32 MiB 编码字符串；服务遇到这些边界会报错，避免静默删页/图片。
其他清洗结果在转换报告的 `gated` 中给出。

原生表格、图表、动画的导入能力没有改变，不支持旧 `.ppt`；请先另存为 `.pptx`。
配置文件、访问密码、真实 PPT、输出 HTML 和日志都不要提交到公共 GitHub。

## 命令行也能调整输入限制

```powershell
node convert/cli.mjs .\deck.pptx --offline --shell .\slides\dist-single\Bento_Slides.bento.html --max-input-mb 500 --max-uncompressed-mb 1500 --report .\report.json
```

浏览器公共转换页面仍使用原来的 100 MiB 默认限制。

## 验证

```sh
node --test server/import/server.test.mjs
node scripts/test-convert.ts
```

`server.test.mjs` 覆盖真实 HTTP 上传/转换/下载、登录、容量、畸形输入、清理、重启和大于 100 MiB 的输入。
GitHub Actions 的 `ci-import-server.yml` 在 Windows 和 Linux 上构建并运行这些检查。
