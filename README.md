# 播放策略管理器 (Codec Switch)

一个油猴脚本，按开关勾选允许浏览器播放的视频编码。未勾选的编码会对网站隐藏，迫使站点回退到你想用的编码。

典型用途：让视频站走 AV1 或 AVC，从而稳定触发 NVIDIA RTX 视频超分辨率（RTX VSR）。

## 功能

- 五种编码独立勾选：AVC (H.264)、AV1、HEVC (H.265)、VP9、VP8
- 勾选 = 放行，未勾选 = 对网站隐藏
- 设置持久化保存，刷新后仍生效
- 至少保留一种编码，避免全禁导致视频无法播放
- 只拦截视频编码，音频编码与容器探测一律放行

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 Violentmonkey
2. 新建脚本，粘贴 `播放策略管理器.user.js` 的全部内容并保存
3. 刷新目标网站页面

## 使用

在油猴菜单中选择「播放策略管理器」，或按 `Alt + Shift + C` 打开设置面板。快捷键默认开启，可在面板中关闭或重新开启。

勾选想保留的编码，也可点击「全选」勾选五种编码。点击「确认并刷新网页」保存设置并生效。

## 拦截原理

脚本改写以下四个浏览器接口，让网站误以为某些编码不受支持：

| 接口 | 作用 |
|---|---|
| `HTMLMediaElement.canPlayType` | 站点特性检测的主要入口 |
| `MediaSource.isTypeSupported` | MSE 自适应流的主路径 |
| `navigator.mediaCapabilities.decodingInfo` | 新版播放器会查询 |
| `Element.prototype.setAttribute` | 拦截 `<video>`/`<source>` 直接写 type 属性 |

## 背景：为什么 HEVC 无法触发 RTX VSR

实测与社区反馈一致：RTX VSR 只在 **AVC 或 AV1** 编码下稳定触发，播放 HEVC (H.265) 时无法激活。若希望用 VSR 提升低码率画质，应保留 AVC/AV1 并禁用 HEVC。

## 致谢

本脚本基于 Greasy Fork 用户 **fengchenxiujisd** 的作品《只留AVC-禁止AV1/HEVC/VP9》（脚本 ID 598819）改写。

原脚本将放行范围写死为 AVC，本版本将其扩展为可配置的多选框，并补充了设置持久化与交互面板。感谢原作者的接口拦截思路：

- `canPlayType` / `MediaSource.isTypeSupported` / `mediaCapabilities.decodingInfo` 三处拦截
- 对 `<video>`/`<source>` 的 `setAttribute` 补充拦截（原作者的这一处处理是完整覆盖的关键）

原脚本采用 MIT 许可，本版本沿用。

## 许可

MIT
