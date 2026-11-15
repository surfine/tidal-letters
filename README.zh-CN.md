# 潮汐信笺（Tidal Letters）

一个在浏览器里运行的阅读器：读取个人博客发布的 JSON 内容包，按文章、笔记、
标签、归档、线索浏览并搜索，并把已下载的内容包缓存在本机；也可由宿主页面
嵌进窗口。

## 截图

在 AI System 6 桌面里实际运行时截取，左为 Classic，右为 Liquid Glass。

<p><img src="screenshots/aaronBlog-classic.png" width="49%" alt="潮汐信笺 · Classic"> <img src="screenshots/aaronBlog-liquid-glass.png" width="49%" alt="潮汐信笺 · Liquid Glass"></p>

## 运行示范

```bash
npm start
```

然后打开 `http://localhost:8080/reader/`。

单独打开（没有宿主桌面）时，`demo/` 目录会应答 `/api/aaron-blog/…`。
`demo/` 里的文章是虚构样本，写的是阅读器本身，或潮汐与书信的中性填充，
不是真实博客。

## 真实部署

不使用 `demo/` 时，宿主需要提供同源接口：

| 路由 | 内容 |
| --- | --- |
| `GET /api/aaron-blog/manifest` | 内容包清单（`contentHash`，可选 `rag`） |
| `GET /api/aaron-blog/index` | 文章、笔记、标签、线索、精选与长文索引 |
| `GET /api/aaron-blog/search` | 搜索条目（`{ entries }`） |
| `GET /api/aaron-blog/long` | 长文 HTML 包（`{ posts }`） |
| `GET /api/aaron-blog/chunk/<YYYY>` | 按年的文章 HTML（`{ posts }`） |
| `GET /api/aaron-blog/rag` | 可选的 RAG 包（由清单命名） |
| `GET /api/aaron-blog/retrieve` | 可选的检索接口（基于上述 RAG） |

没有这些接口（也没有 `demo/` 或浏览器里先前缓存的内容包）时，列表会停在
「载入中」的空状态。

单独打开时，进度（上次分区、选中篇目、已下载的内容包）留在浏览器里。

## 构建

```bash
npm run build
```

把宿主页面要嵌入的文件复制到 `dist/`（不含 `demo/`）。没有依赖，有 Node 就行。

## 目录

| 路径 | 内容 |
| --- | --- |
| `reader/` | 页面、阅读器模块、样式表、中英文字符串表 |
| `shared/` | 基础样式，以及对接 bridge 的运行时 |
| `demo/` | 供 `npm start` 单独打开时使用的虚构示范内容包 |
| `ais6-bridge.js`、`kit.css`、`app.manifest.json` | 让宿主页面把阅读器嵌进框架、代管进度并画出菜单；单独打开时，同样的调用退回本地存储 |
| `tools/build.mjs` | 把嵌入用的文件复制到 `dist/` |

## 许可

MIT。见 [LICENSE](LICENSE)。

English: [README.md](README.md).
