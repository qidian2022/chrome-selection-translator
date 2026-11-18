# 划词译 · AI 中文翻译

在 Chrome 网页选中文字，点击「翻译」即可查看中文译文和下方的生词。也可以围绕选文向 AI 提问，把词条和问答收进本机收藏。支持 OpenAI、DeepSeek 和提供流式 Chat Completions 接口的服务。

## 下载与安装

在本仓库点击 **Code → Download ZIP**，解压下载文件。也可以在 Releases 下载版本安装包。加载时选择直接包含 `manifest.json` 的文件夹；普通用户无需安装 Node.js 或运行命令。

1. 在 Chrome 地址栏输入 `chrome://extensions`。
2. 打开右上角的「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本文件所在的 `chrome-selection-translator` 文件夹。
4. 首次安装会打开设置页。选择 API 服务商，填写对应的密钥和模型，点击「保存并测试」。
5. 刷新要阅读的网页，选中文字，点击小浮条上的「翻译」。

## 选择 API 服务商

在扩展设置的「API 服务商」中选择接口。翻译、生词和 AI 问答共用当前选择。服务商和自定义地址分别保存各自的模型与密钥，升级会沿用原有 OpenAI 配置。

| 服务 | 设置方法 |
| --- | --- |
| OpenAI | 选择「OpenAI」，填入项目密钥。默认模型为 `gpt-6-luna`，使用 Responses 接口。 |
| DeepSeek | 选择「DeepSeek」，填入该平台的密钥。预设模型为 `deepseek-flash`，也可修改。[DeepSeek API 文档](https://api-docs.deepseek.com/) |
| 其他兼容服务 | 选择「自定义」，填写服务商提供的 HTTPS 基础地址或完整的 `/chat/completions` 地址，再填入该服务的模型 ID 和密钥。接口需支持 `stream: true`。 |
| 本机 Ollama | 选择「自定义」，填写 `http://localhost:11434/v1` 和已安装的模型名。免鉴权的本机服务可以留空密钥。[Ollama 接口文档](https://docs.ollama.com/api/openai-compatibility) |

点击「保存并测试」。如 Chrome 弹出域名访问提示，允许访问所选服务。测试会向该接口发送一句示例英文。使用云服务时，费用计入所填密钥的账户。

## 如何申请和配置 OpenAI API

1. 打开 [OpenAI 开发者平台](https://platform.openai.com/)，注册或登录账号，按页面要求完成账号设置。
2. 进入项目，打开 [API keys](https://platform.openai.com/api-keys)，点击 **Create new secret key**，为这个扩展创建专用密钥，例如命名为 `chrome-translator`。个人使用选择自己的项目密钥；若设置受限权限，需允许创建 Responses 请求。
3. 创建后复制密钥，保存在自己的密码管理器中。不要将密钥写进源码、GitHub Issue 或截图。遗失时创建新密钥并替换旧密钥。
4. 打开 [Billing](https://platform.openai.com/settings/organization/billing/overview)，查看 API 可用额度；按账户页面提示添加支付方式、购买额度或领取适用的账户权益。翻译消耗 API 额度，是否有可用额度以开发者平台显示为准。
5. 在 Chrome 扩展管理页找到「划词译」，打开扩展选项，将密钥粘贴到 **API 密钥**。模型默认 `gpt-6-luna`；如账户无权访问，填写账户可用且支持 Responses 文本输出的模型 ID。
6. 点击 **保存并测试**。出现“连接成功”和中文示例译文后，刷新阅读中的网页即可使用。测试本身也会发送一次 API 请求。

在 [Usage](https://platform.openai.com/usage) 查看用量，在 Billing 管理费用。删除密钥可在扩展设置中操作；需要撤销服务端权限时，在开发者平台的 API keys 页面删除对应密钥。

官方说明：[API 密钥与项目身份](https://developers.openai.com/api/docs/guides/api-keys)、[API 入门与额度](https://developers.openai.com/api/docs/quickstart)。

## 常见问题

| 现象 | 处理方法 |
| --- | --- |
| 密钥无效 / 401 | 在 API keys 页面重新创建密钥，粘贴完整内容后保存测试。 |
| 额度不足 | 检查当前项目所属组织的 Billing 与可用额度。 |
| 模型不存在或无权访问 | 在设置中改为账户可用的 Responses 文本模型 ID。 |
| 网络失败 | 检查当前服务的地址、域名访问权限和网络连接。 |
| 选中文字没有浮条 | 刷新网页，确认设置中已开启浮条；Chrome 内部页等限制见下文。 |
| 更新后仍是旧效果 | 在扩展管理页重新加载扩展，再刷新网页。 |

## 使用

- **划词浮条**：拖选文字或双击单词，浮条上可选「翻译」「AI 问答」「生词」，也可点击复制图标复制原文。
- **AI 问答**：点击「AI 问答」先看选文解释，再输入自己的问题。回车发送，Shift + 回车换行。每次追问附上原文和最近六轮已完成的问答。点击回答下方的「收藏问答」保存这一轮；关闭浮窗会结束临时对话。
- **查生词**：点击「翻译」会同时请求译文和生词，词条自动出现在译文下方，最多六个。每条包含中文释义，并在有数据时显示音标、词性和例句。也可点击浮条上的「生词」单独查词。点击「加入生词本」保存词条和选文；再次收录同一词会更新释义和语境。
- **复习收藏**：点击 Chrome 工具栏的插件图标 →「生词本」。在「生词本」和「问答收藏」间切换，可搜索、展开原文、复制、删除或清空当前分类。查看收藏无需 API 密钥。
- **译文小框**：短句宽 240 像素，较长段落宽 320 像素，长译文在框内滚动。复制按钮位于右上角；「…」中可以查看原文、重新翻译或打开设置。
- **跟随滚动**：滚动网页或阅读区域时，浮条和译文框会跟随原文位置移动。原文滚出屏幕后，译文框停留在屏幕边缘，翻译继续进行；框内滚动可阅读较长译文。
- **右键菜单**：选中文字 →「翻译成中文」。
- **快捷键**：选中文字 → `Option/Alt + Shift + T`。可以在 `chrome://extensions/shortcuts` 中修改。
- **工具栏**：点击扩展图标，读取当前选中文字，也可以粘贴文字后翻译、提问或查词。`⌘/Ctrl + Enter` 开始。
- **关闭**：按 Esc、点击关闭按钮或点击浮窗外。关闭浮窗会中止当前请求。
- **重复翻译**：近期完成的译文和生词分别暂存，在同一接口、模型和选文下可直接复用。点击「重新翻译」会跳过缓存重新请求；设置页的「保存并测试」也会直接测试接口。

每次选文最多 12,000 个字符，每条追问最多 2,000 个字符。模型无权访问、余额不足、网络中断和不完整译文都会显示具体提示；不自动重试付费请求。

更新后，在扩展管理页点击「划词译」的重新加载按钮，再刷新阅读中的网页。1.1.0 更新会启用划词浮条，也可在设置中关闭，保存后立即生效。

1.2.0 更新会将旧默认模型切换为 `gpt-6-luna`，API 密钥保留。Luna 使用 `reasoning.effort: none`；用户另行选择的其他模型保持其默认推理设置。

Chrome 内部页面、扩展商店和内置 PDF 阅读器不能注入划词浮条。在能显示扩展右键菜单的页面，可通过右键打开独立翻译窗口；也可将文字粘贴进工具栏弹窗。本地 HTML 需在扩展详情中打开「允许访问文件网址」。图片、扫描 PDF 和以画布绘制的文字需要先识别成文本。

## 数据与权限

- 点击「翻译」时，扩展向当前接口分别发送翻译和查词请求；已有缓存的结果会直接显示。单独点击「生词」只请求词条。AI 问答还发送本次问题和最近六轮对话，每轮回答最多附带前 12,000 个字符。网页标题、网址和未选中的段落不参与请求。
- API 密钥保存在本机扩展存储，未加密，不同步至 Chrome 账户。页面脚本及内容脚本无法读取密钥；设置页可替换或删除密钥。
- 生词与问答在点击收藏后写入本机扩展存储，可在「阅读收藏」中删除。临时对话随浮窗关闭而清除。
- 翻译缓存只保存在内存中。译文和生词列表各最多保留 50 条，5 分钟内可以复用；后台休眠重启、扩展重载或浏览器关闭后清除。更改服务配置也会清空缓存。独立窗口通过 Chrome 会话存储临时接收原文，读取后删除；未读取的条目在下一次独立窗口打开时清理，浏览器重启时清除。
- OpenAI Responses 请求设置 `store: false`。其他服务通过 Chat Completions 接收请求，服务端数据保留依所选服务的设置和条款。
- 网页访问权限用于在页面上显示划词浮条；API 域名权限用于向所选服务发送请求；其他接口在配置时按域名申请访问；`activeTab` / `scripting` 用于工具栏读取当前选区；`contextMenus` 用于右键菜单；`storage` 用于设置、阅读收藏和临时窗口交接。
- 无外部脚本、分析追踪、构建步骤或运行时依赖。

## 开发与检查

要求 Chrome 120+，单元测试使用 Node.js 22+。

```sh
npm test
```

测试使用模拟 API 响应，覆盖流式数据分片、中文 UTF-8、错误提示、取消请求、问答上下文、生词解析及收藏去重。真实账户连接由设置页的「保存并测试」验证。

接口依据：[OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)、[GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)、[Chrome 跨域请求](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)、[Chrome 扩展存储](https://developer.chrome.com/docs/extensions/reference/api/storage)。

问答和生词的交互参考了 [AI Text Selection Toolbox](https://github.com/hengheng2004/AI-Text-Selection-Toolbox)。

## 开源许可

采用 [MIT License](LICENSE)，允许使用、修改和分发，分发时保留版权与许可声明。
