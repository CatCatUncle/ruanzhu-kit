<div align="center">

# ruanzhu-kit

**中国软著登记材料生成器 —— 源码进去，页数一页不差的 PDF 出来**

[![GitHub stars](https://img.shields.io/github/stars/CatCatUncle/ruanzhu-kit?style=social)](https://github.com/CatCatUncle/ruanzhu-kit/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](package.json)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![Claude Skill](https://img.shields.io/badge/Claude-Skill-D97757)](SKILL.md)

一条命令出齐 **程序鉴别材料 PDF + 说明书 PDF + 在线表单填写清单**，<br>
不装 Word、不拼页码、不怕页数漂移。

[三分钟跑通](#-三分钟跑通) · [分页原理](#-分页是怎么算的) · [当 AI 技能用](#-当-ai-技能用) · [避坑清单](#️-别踩的坑) · [企业 AI 落地合作](#-关于作者--合作)

<sub>🏢 企业 AI 落地 / FDE / Agent 项目合作 → <a href="mailto:contact@aijentra.com">contact@aijentra.com</a></sub>

</div>

> Generates a complete Chinese software-copyright (软著) registration package from a
> source tree: a page-exact source-code PDF, a manual PDF, and a copy-paste checklist
> for the online form. Plain Node, zero dependencies. Works as a Claude Code / Agent SDK skill.

> [!TIP]
> 如果它帮你省下了一次「页数不对、整份重做」，点一下右上角的 ⭐ Star——
> 让下一个被软著折腾的开发者也能搜到它。

```console
$ ruanzhu source
已生成 ruanzhu/out/①程序鉴别材料_源程序前30页后30页_示例项目.pdf

核验
  ✓ 页数                 实际 62 页，期望 62 页
  ✓ 封面                 示例项目管理系统V1.0源程序软件名称：示例项目管理系统V1.0版本号：V1.0
  ✓ 说明页在第 32 页     说明本软件源程序共103145行，按每页50行排版，共2132页。依据《计算机软件著作权登记办法》第
  ✓ 末页非空             region.setCenter(cp); } } }
```

10 万行代码、2132 页排版，交上去的是 62 页：封面 + 前 30 页 + 说明页 + 后 30 页。

## 💡 为什么要有它

软著材料最麻烦的地方不是写，是**页数**。源程序超过 60 页只能交前连续 30 页 + 后连续 30 页，
而 Word 排版导出的 PDF 页数会随版本、字体、打印机驱动漂——同一份稿子在两台机器上能差出十几页，
一漂整份材料重做。这个工具在渲染之前就把每页装哪些行算死，出完再回读 PDF 数一遍页码。

| | 手工 Word 排版 | ruanzhu-kit |
|---|---|---|
| 页数 | 随字体、版本、打印驱动漂移 | 渲染前算死，出完回读 PDF 核验 |
| 超长代码行 | 折行把页面撑破，一页变两页 | 按折行后的行高单位计算 |
| 前 30 + 后 30 页 | 手动截取、手动插说明页 | 自动截取，自动写说明页（略去多少行） |
| 混进依赖/构建产物 | 常见，行数虚高被驳回 | `count` 一步把可疑文件列在最前面 |
| 表单「主要功能」字数 | 自己数 | 逐字段算字数，带校验 |
| 依赖 | Word / WPS | Node 18+ 和一个 Chrome，**零 npm 依赖** |
| AI 代办 | — | 自带 `SKILL.md`，说一句话让 agent 跑完 |

## 🚀 三分钟跑通

需要 Node 18+ 和 Chrome / Chromium / Edge 任一（`CHROME_PATH` 可指定路径）。

```bash
cd 你的项目
npx github:CatCatUncle/ruanzhu-kit init   # 生成 ruanzhu.config.json 和说明书骨架
```

嫌 `npx` 长就 clone 下来，后面用 `node 路径/bin/ruanzhu.mjs`，或者 `npm link` 之后直接叫 `ruanzhu`：

```bash
git clone https://github.com/CatCatUncle/ruanzhu-kit.git && cd ruanzhu-kit && npm link
```

打开 `ruanzhu.config.json`，把软件全称、著作权人、开发完成日期填准，然后：

```bash
ruanzhu count      # 先看清点到哪些文件、多少行、排版几页
ruanzhu all --doc  # 两份 PDF + 表单清单 + 可编辑的 .doc 留存件
```

`count` 这一步别跳。它会把收进材料的文件按行数列出来，`node_modules` 之外的脏东西
（构建产物、评测数据、运行期生成的文件）基本都在前十行里现形——行数虚高是驳回的高频原因。
看到不该进的，加进配置的 `exclude` / `excludeFiles` 再跑一次。

## 📦 它出的东西

| 文件 | 传到哪 |
|---|---|
| `①程序鉴别材料_源程序前30页后30页_<软件名>.pdf` | 「程序鉴别材料」栏 |
| `②文档鉴别材料_说明书_<软件名>.pdf` | 「文档鉴别材料」栏 |
| `表单填写清单.md` | 在线表单逐字段复制，带字数校验 |
| `<软件名>源程序.doc` / `<软件名>说明书.doc` | `--doc` 产出，留存和改字用 |

营业执照、权属证明这些「其他证明文件」得你自己准备。

## ⌨️ 命令

| 命令 | 作用 |
|---|---|
| `ruanzhu init` | 生成配置和说明书骨架（11 章固定结构） |
| `ruanzhu count` | 只统计，不出文件。核对文件清单用 |
| `ruanzhu source` | 出程序鉴别材料 PDF，并回读核验页数 |
| `ruanzhu manual` | 把 `说明书.md` 渲成文档鉴别材料 PDF |
| `ruanzhu form` | 出表单填写清单，逐项算字数 |
| `ruanzhu all` | 以上三样一起出，最后打一份自检清单 |

选项：`--doc` 同时出 Word 留存件，`--lines-per-page 60` 排密一点（默认 50，上限 66），
`--out <dir>` 换输出目录。

## 🧮 分页是怎么算的

一行 300 字符的代码在 A4 上会折成 4 行。按「行数」切页，超长行必然把页面撑破；
所以这里算的是**折行之后占几个行高单位**：

```
A4 纵向 210mm，左右各 2cm 边距  → 正文宽 481pt
Courier New 9pt，字符宽 0.6em   → 每行 89 个字符（中文算 2 个）
正文高 728pt ÷ 行高 11pt        → 每页最多 66 行，默认排 50 行
```

每一行先算出占几个单位，累加到 50 就换页，分页点用 `page-break-after` 钉死，
再交给 Chrome 无头模式渲染。页数在生成之前就是确定的。

超过 60 页的项目取**整份源程序的前 30 页和最后 30 页**，中间插一页说明页写清略去多少行——
注意不是「把源码对半分再各凑 30 页」，那样代码量一大每页会被撑到几百行。
成品是 62 页：封面 1 + 前 30 + 说明页 1 + 后 30。

核心实现在 [`lib/paginate.mjs`](lib/paginate.mjs)，七十来行，可以单独拿走用。

## 🤖 当 AI 技能用

仓库根目录的 [`SKILL.md`](SKILL.md) 是给 AI agent 读的版本，用的是通用技能包格式
（Claude Code / Claude Agent SDK 都认）。clone 到技能目录即可：

```bash
git clone https://github.com/CatCatUncle/ruanzhu-kit.git ~/.claude/skills/ruanzhu-kit
```

也可以放进 [OpenWorkBuddy](https://github.com/CatCatUncle/openworkbuddy)（一个跑在自己电脑上的
AI 办公助理）的 `skills/` 目录，让它来跑：

```bash
git clone https://github.com/CatCatUncle/ruanzhu-kit.git <OpenWorkBuddy 目录>/skills/ruanzhu-kit
```

装完直接说「帮我准备这个项目的软著材料」，它会自己清点源码、出两份 PDF、核页数、算表单字数。
不用 agent，直接敲命令行产出的材料完全一样。

## ⚠️ 别踩的坑

| 坑 | 后果 |
|---|---|
| 用 Word 排版导 PDF | 页数漂移，整份重做 |
| 统计行数时混入依赖和构建产物 | 行数虚高，驳回 |
| 著作权人写简称 | 驳回。必须与营业执照/身份证一字不差 |
| 「开发该软件的操作系统」填成运行平台 | 逻辑矛盾。前者是你写代码用的系统 |
| 「软件的主要功能」少于 500 字 | 驳回。工具会替你数 |
| 公司申请缺权属证明 | 驳回。备《职务开发声明》或《著作权转让合同》 |

字段逐项怎么措辞见 [`docs/form-fields.md`](docs/form-fields.md)，
大型项目的配置怎么写见 [`examples/large-project/`](examples/large-project/)。

## 📌 说明

这是个排版和清点工具，不是法律意见。材料能不能过审取决于你项目本身和审查员，
提交前请自己核对一遍著作权人、源程序量和证明文件。规则以
[中国版权保护中心](https://register.ccopyright.com.cn/)公布的为准。

## 🛠️ 开发

```bash
node test/run.mjs   # 17 项自测，最后两项会真的出一份 PDF 再回读页数
```

欢迎提 Issue 和 PR：遇到被驳回的新原因、表单字段有变化、某种语言的源码统计不准，都可以直接开 Issue 说。

## ⭐ Star History

如果这个项目对你有用，一个 Star 就是最好的支持。

[![Star History Chart](https://api.star-history.com/svg?repos=CatCatUncle/ruanzhu-kit&type=Date)](https://star-history.com/#CatCatUncle/ruanzhu-kit&Date)

## 👋 关于作者 · 合作

前大厂 Agent 工程师，有丰富的 Agent 落地实践经验。

- ✔️ 服务过跨境电商、制造业、AI 初创、私募金融机构、消费品巨头、国央企等客户的 AI 解决方案
- ✔️ 企业 AI 内训 ｜ 企业私有化部署 ｜ 行业智能体 ｜ AI 数字化全案 ｜ AI 搜索优化 ｜ Agent 项目落地

常驻深圳，欢迎前来交流和考察。

**FDE（驻场工程）、Agent 项目落地及其他企业 AI 业务合作，请直接邮件联系：[contact@aijentra.com](mailto:contact@aijentra.com)**

## 📄 License

[MIT](LICENSE)
