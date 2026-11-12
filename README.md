# 划词译 · OpenAI 中文翻译

在 Chrome 网页选中文字，点击旁边浮条上的「翻译」，在当前页面查看中文译文。使用自己的 OpenAI API 密钥，默认模型为 `gpt-6-luna`，支持在设置中修改。Luna 请求关闭推理，译文边生成边显示。

## 下载与安装

在本仓库点击 **Code → Download ZIP**，解压下载文件。也可以在 Releases 下载版本安装包。加载时选择直接包含 `manifest.json` 的文件夹；普通用户无需安装 Node.js 或运行命令。



1. 在 Chrome 地址栏输入 `chrome://extensions`。
2. 打开右上角的「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本文件所在的 `chrome-selection-translator` 文件夹。
4. 首次安装会打开设置页。填写 OpenAI API 密钥，点击「保存并测试」。
5. 刷新要阅读的网页，选中文字，点击小浮条上的「翻译」。

密钥在 [OpenAI API 控制台](https://platform.openai.com/api-keys) 创建。请求使用你的 OpenAI API 账户额度。测试会翻译一句示例英文。

## 如何申请和配置 OpenAI API

1. 打开 [OpenAI 开发者平台](https://platform.openai.com/)，注册或登录账号，按页面要求完成账号设置。
2. 进入项目，打开 [API keys](https://platform.openai.com/api-keys)，点击 **Create new secret key**，为这个扩展创建专用密钥，例如命名为 `chrome-translator`。个人使用选择自己的项目密钥；若设置受限权限，需允许创建 Responses 请求。
3. 创建后复制密钥，保存在自己的密码管理器中。不要将密钥写进源码、GitHub Issue 或截图。遗失时创建新密钥并替换旧密钥。
4. 打开 [Billing](https://platform.openai.com/settings/organization/billing/overview)，查看 API 可用额度；按账户页面提示添加支付方式、购买额度或领取适用的账户权益。翻译消耗 API 额度，是否有可用额度以开发者平台显示为准。
5. 在 Chrome 扩展管理页找到「划词译」，打开扩展选项，将密钥粘贴到 **OpenAI API 密钥**。模型默认 `gpt-6-luna`；如账户无权访问，填写账户可用且支持 Responses 文本输出的模型 ID。
6. 点击 **保存并测试**。出现“连接成功”和中文示例译文后，刷新阅读中的网页即可使用。测试本身也会发送一次 API 请求。

在 [Usage](https://platform.openai.com/usage) 查看用量，在 Billing 管理费用。删除密钥可在扩展设置中操作；需要撤销服务端权限时，在开发者平台的 API keys 页面删除对应密钥。

官方说明：[API 密钥与项目身份](https://developers.openai.com/api/docs/guides/api-keys)、[API 入门与额度](https://developers.openai.com/api/docs/quickstart)。

## 常见问题

| 现象 | 处理方法 |
| --- | --- |
| 密钥无效 / 401 | 在 API keys 页面重新创建密钥，粘贴完整内容后保存测试。 |
| 额度不足 | 检查当前项目所属组织的 Billing 与可用额度。 |
| 模型不存在或无权访问 | 在设置中改为账户可用的 Responses 文本模型 ID。 |
| 网络失败 | 检查当前网络是否能连接 `api.openai.com`。 |
| 选中文字没有浮条 | 刷新网页，确认设置中已开启浮条；Chrome 内部页等限制见下文。 |
| 更新后仍是旧效果 | 在扩展管理页重新加载扩展，再刷新网页。 |

## 使用

- **划词浮条**：拖选文字或双击单词后，选区旁自动出现「翻译 / 复制」小浮条。点击「翻译」后在紧凑的小框中查看中文。
- **译文小框**：短句宽 240 像素，较长段落宽 320 像素，长译文在框内滚动。复制按钮位于右上角；「…」中可以查看原文、重新翻译或打开设置。
- **跟随滚动**：滚动网页或阅读区域时，浮条和译文框会跟随原文位置移动。原文滚出屏幕后，译文框停留在屏幕边缘，翻译继续进行；框内滚动可阅读较长译文。
- **右键菜单**：选中文字 →「翻译成中文」。
- **快捷键**：选中文字 → `Option/Alt + Shift + T`。可以在 `chrome://extensions/shortcuts` 中修改。
- **工具栏**：点击扩展图标，读取当前选中文字，也可以粘贴文字后翻译。`⌘/Ctrl + Enter` 开始。
- **关闭**：按 Esc、点击关闭按钮或点击浮窗外。关闭浮窗会中止当前请求。
- **重复翻译**：近期完成的译文会在内存中暂存，相同模型、相同原文可直接显示。点击「重新翻译」会跳过缓存重新请求；设置页的「保存并测试」也会直接测试接口。

一次最多翻译 12,000 个字符。模型无权访问、余额不足、网络中断和不完整译文都会显示具体提示；不自动重试付费请求。

更新后，在扩展管理页点击「划词译」的重新加载按钮，再刷新阅读中的网页。1.1.0 更新会启用划词浮条，也可在设置中关闭，保存后立即生效。

1.2.0 更新会将旧默认模型切换为 `gpt-6-luna`，API 密钥保留。Luna 使用 `reasoning.effort: none`；用户另行选择的其他模型保持其默认推理设置。

Chrome 内部页面、扩展商店和内置 PDF 阅读器不能注入划词浮条。在能显示扩展右键菜单的页面，可通过右键打开独立翻译窗口；也可将文字粘贴进工具栏弹窗。本地 HTML 需在扩展详情中打开「允许访问文件网址」。图片、扫描 PDF 和以画布绘制的文字需要先识别成文本。

## 数据与权限

- 点击翻译后，仅所选文字连同固定翻译指令发送至 `https://api.openai.com/v1/responses`。不发送页面网址、标题、周围段落或整页内容。
- API 密钥保存在本机扩展存储，未加密，不同步至 Chrome 账户。页面脚本及内容脚本无法读取密钥；设置页可替换或删除密钥。
- 不将翻译历史写入磁盘。内存缓存最多保留 50 条已完成译文，5 分钟内可以复用；后台休眠重启、扩展重载或浏览器关闭后清除。更改模型或密钥也会清空缓存。独立窗口通过 Chrome 会话存储临时接收原文，读取后删除；未读取的条目在下一次独立窗口打开时清理，浏览器重启时清除。
- Responses 请求设置 `store: false`，关闭响应对象的存储。OpenAI 的服务端数据处理政策由你的 API 账户适用条款决定。
- 网页访问权限用于在页面上显示划词浮条；OpenAI 域名权限用于发送翻译请求；`activeTab` / `scripting` 用于工具栏读取当前选区；`contextMenus` 用于右键菜单；`storage` 用于设置和临时窗口交接。
- 无外部脚本、分析追踪、构建步骤或运行时依赖。

## 开发与检查

要求 Chrome 120+，单元测试使用 Node.js 22+。

```sh
npm test
```

测试使用模拟 API 响应，覆盖流式数据分片、中文 UTF-8、错误提示、取消请求和不完整译文。真实账户连接由设置页的「保存并测试」验证。

接口依据：[OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)、[GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)、[Chrome 跨域请求](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)、[Chrome 扩展存储](https://developer.chrome.com/docs/extensions/reference/api/storage)。

## 开源许可

采用 [MIT License](LICENSE)，允许使用、修改和分发，分发时保留版权与许可声明。
