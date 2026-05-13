---
title: '前端概念学习'
description: '前端概念SSG 学习'
pubDate: 2026-05-13T10:54:05.569Z
heroImage: '/blog-placehoder-7.jpg'
---


## Preact 客户端水合

* 接触了一个完全不了解的概念

问AI解释如下

````md
**Preact 客户端水合 (Hydration)**，简单说：就是**把服务端渲染好的静态 HTML，在浏览器里“激活”成可点击、可交互的 Preact 应用**的过程。

### 一、核心原理（SSR + Hydration）
1. **服务端渲染 (SSR)**
   - 服务器运行 Preact 代码，把组件渲染成**纯静态 HTML 字符串**
   - 直接返回给浏览器 → 用户**马上看到页面内容**（首屏快、SEO 友好）
   - 但此时页面是“死”的：按钮点不动、没有交互

2. **客户端水合 (Hydrate)**
   - 浏览器加载 Preact 的 JS 代码
   - 调用 `hydrate`（而非普通 `render`）
   - Preact 做三件事：
     1. **复用已有的 DOM**（不重新生成、不闪屏）
     2. **对比虚拟 DOM 与真实 DOM**（结构必须一致）
     3. **绑定事件、挂载状态、启动响应式逻辑** → 页面“活”了

### 二、Preact 水合代码示例
```jsx
// 服务端（Node）
import { renderToString } from 'preact-render-to-string'
const html = renderToString(<Counter initial={0} />)
// 返回给浏览器：<div><button>0</button></div>

// 客户端（浏览器）
import { hydrate } from 'preact'
function Counter({ initial = 0 }) {
  const [count, setCount] = useState(initial)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
// 水合：激活已存在的 HTML
hydrate(<Counter initial={0} />, document.getElementById('app'))
```

### 三、Preact 水合特点
- **轻量高效**：体积远小于 React，水合更快
- **两种水合模式**
  - **标准水合 (`hydrate`)**：严格匹配 DOM，不修改结构， mismatches 会警告
  - **变异水合 (`render` 第三个参数)**：允许 diff 并修复 DOM 差异
- **支持部分水合 / Islands 架构**
  - 只水合**需要交互的组件**（岛屿）
  - 静态 HTML 不加载 JS → 极大提升性能

### 四、常见问题：水合不匹配 (Hydration Mismatch)
- **原因**：服务端 HTML ≠ 客户端虚拟 DOM
  - 文本内容不一样
  - 节点数量/顺序不一样
  - 客户端用了 `window`/`document`（服务端没有）
- **后果**：警告、甚至重新渲染（白闪）

一句话记：
**水合 = 复用 DOM + 绑定事件 + 激活状态**。
````

> 其中 Preact 应用 = 用 Preact 框架写的前端网页 / 小程序 / H5 应用。


---


### 关于 水合 Hydration

````md
# 彻底讲懂：前端「水合 Hydration」，通俗+原理+Preact专属
## 一、先打个最形象的比方
把网页比作**机器人**：
1. **服务端渲染SSR**：
工厂先把机器人**外壳、零件、外形全部组装好**，摆在你面前，**能看、不能动、不能响应指令**。
2. **水合Hydration**：
给机器人**装入大脑、接上电路、绑定控制系统**，**外形不动、不重新造外壳**，直接让它**能走路、能听话、能交互**。

> 水合核心：**不重新创建DOM，只给已有HTML“注入JS逻辑、绑定事件、激活状态”**。

---

## 二、为什么会有水合？不用不行吗？
### 传统纯客户端渲染（无SSR、无水合）
流程：
1. 浏览器请求页面 → 返回一个空 HTML
2. 下载庞大 JS
3. JS 全部下载完，**从头创建所有DOM**，渲染页面

缺点：
- 白屏时间长
- SEO 爬虫看不到内容
- 低端手机卡顿

### 有SSR+水合的流程
1. 服务器提前运行Preact/React，**直接生成完整静态HTML**发给浏览器
2. 浏览器**立刻渲染出完整页面**，用户马上看到内容
3. 后台悄悄下载JS，JS就绪后**执行水合**
4. 页面还是原来的HTML结构，只是**被激活成可交互**

---

## 三、水合到底干了哪3件核心事？
记住这三步，就懂水合全部本质：
1. **复用现有DOM**
不去删除页面已有的HTML标签，不重新生成，直接沿用浏览器已经渲染好的DOM树。
2. **虚拟DOM和真实DOM做比对**
Preact 拿自己组件的虚拟DOM，和页面上已经存在的真实HTML一一匹配，确认结构一致。
3. **挂载逻辑**
给按钮绑定点击事件、给组件挂上状态（useState）、生命周期、响应式更新逻辑，**让静态页面变成动态App**。

---

## 四、水合 和 普通渲染 的区别
### 1. 普通渲染 render
`render(组件, 容器)`
- 清空容器里所有HTML
- 从头创建新DOM插入
- 会闪屏、重新刷新页面结构

### 2. 水合渲染 hydrate
`hydrate(组件, 容器)`
- **不清空、不重建DOM**
- 只做**关联、绑定事件、注入状态**
- 页面无刷新、无白屏、无缝激活

---

## 五、举极简例子，秒懂
### 服务端输出的静态HTML（已经在页面上了）
```html
<div id="app">
  <button>计数：0</button>
</div>
```
此时：按钮**看得见，但点了没反应**。

### 客户端执行水合
```jsx
import { hydrate, useState } from 'preact'

function App() {
  const [n, setN] = useState(0)
  return <button onClick={()=>setN(n+1)}>计数：{n}</button>
}

// 水合：关联已有HTML，绑定点击事件+状态
hydrate(<App/>, document.getElementById('app'))
```

执行后：
HTML**没变**，还是那个`<button>`，
但**已经被Preact接管**，可以点击、可以改数字，这就是**水合完成**。

---

## 六、水合报错：水合不匹配 Hydration Mismatch
最常见坑：
> 服务端生成的HTML 和 客户端组件渲染出来的结构**不一样**

触发原因：
1. 服务端没有`window/document`，代码里直接用了
2. 三元判断、随机数，服务端和客户端渲染文本不一样
3. 标签层数、属性不一致

后果：
框架匹配不上DOM，只能**强制重新渲染**，页面闪一下，甚至报错。

---

## 七、Preact 水合的特色
1. 比 React 更轻、水合速度更快
2. 支持**孤岛水合（Islands）**：
只水合页面里需要交互的小块组件，大片静态内容不加载JS、不水合，极致性能。
3. 可以强制降级：用`render`代替`hydrate`自动修复DOM不一致。

---

## 八、一句话终极总结
**水合：先由服务器吐出完整静态HTML让用户立刻看到页面，再由前端JS在不重建页面结构的前提下，给现有HTML绑定事件、挂上状态、接管页面，从“静态死页面”变成“可交互的Preact应用”的过程。**
````