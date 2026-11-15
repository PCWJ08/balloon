<div align="center">

# 纸间气球 · Paper Balloon

**一款水墨纸艺风格的切气球小游戏 —— 运笔即切，一刀两断**

[![License: MIT](https://img.shields.io/badge/license-MIT-2e8f7a)](LICENSE)
[![Vanilla JS](https://img.shields.io/badge/vanilla-JavaScript-c08a2a)]()
[![Dependencies](https://img.shields.io/badge/依赖-0-3a5fa8)]()
[![Single File](https://img.shields.io/badge/单文件-~60KB-d9482f)]()

*A minimalist Fruit-Slash game in Chinese ink-and-paper style. One HTML file, zero dependencies.*

[在线试玩](https://你的用户名.github.io/paper-balloon/) · [报告问题](https://github.com/你的用户名/paper-balloon/issues)

![纸间气球 · 标题页](screenshots/title.png)

</div>

---

## 简介

「纸间气球」是一页会玩的宣纸：五色纸鸢自纸上浮起，运笔即切，**切落非保留之色**，留一色于心。避开墨雷、追逐时砂、偶得墨涟缓时——在连斩与心流之间，练一手又轻又准的刀。

整个游戏只有一个 `index.html`：没有框架、没有构建、没有外部资源，图片在启动时以代码「烘焙」，音效用 WebAudio 现场合成。双击即玩，离线可玩。

| 卷首 | 对局 | 终局 |
| --- | --- | --- |
| ![卷首](screenshots/title.png) | ![对局](screenshots/gameplay.png) | ![终局](screenshots/result.png) |

## 三种玩法

| 玩法 | 规则 | 适合 |
| --- | --- | --- |
| **经典** | 廿秒为限，切落非保留之色得分，时尽收场 | 日常手感 |
| **禅意** | 六十息、无墨雷、误切不断分只断连斩 | 静心练连斩 |
| **疾风** | 三息为命：漏网 / 误切 / 墨雷各损一息；长风不断、气球渐快 | 挑战生存 |

## 计分与规则

- **连斩倍率**：连续切中非保留色，5 / 10 / 连时倍率升为 ×2 / ×3 / ×4；心流期间再翻倍
- **一刀多切**：一笔划过 N 只气球，额外 +2×(N−1)
- **保留色**：标「留」字的气球不可切，误切 −1 分并断连斩
- **墨雷**：切中 −3 分，震屏顿帧
- **时砂**：金钟气球，+2 秒（疾风模式改为补一息）
- **墨涟**：墨色水纹气球，切中进入 3 秒慢镜，涟中万象皆缓

## 操作

| 操作 | 方式 |
| --- | --- |
| 切 | 鼠标滑动 / 触屏划动（无需按住） |
| 暂停 | `Esc` 或右上角暂停钮；切走标签页自动暂停 |
| 全屏 | 左上角全屏按钮（不支持全屏的环境自动隐藏） |
| 声音 | 左上角喇叭，静音状态会被记住 |

## 技术实现

- **Canvas 2D** 渲染：气球、切割两半、纸屑、墨环、风痕全部程序化绘制；精灵图在启动时用代码烘焙，无任何图片资源
- **WebAudio** 合成音效：切纸、木鱼、钟鸣、风声环境音均为振荡器与噪声实时合成，无音频文件
- **单文件 · 零依赖**：全部逻辑、样式、资源在一个 HTML 内（约 60KB），双击即玩、离线可玩
- **细节**：devicePixelRatio 适配、`prefers-reduced-motion` 降级、页面隐藏自动暂停、窗口失焦保护、逐帧冻结与震屏反馈

## 本地运行

无需安装任何东西：

```bash
# 方式一：直接双击 index.html

# 方式二：起一个本地服务器（任选其一）
python -m http.server 8080
npx serve .
```

然后访问 `http://localhost:8080`。

## 目录结构

```
.
├── index.html          # 游戏本体（全部逻辑、样式、资源）
├── screenshots/        # README 展示图
│   ├── title.png
│   ├── gameplay.png
│   └── result.png
├── LICENSE             # MIT
└── README.md
```

## 开源许可

[MIT](LICENSE) © 2026
