---
title: 'Three.js 天空盒 (Skybox) 入门:从零搭一个可交互的 3D 场景'
description: '用 Three.js + OrbitControls + CubeTextureLoader 做一个能鼠标拖拽环顾、滚轮缩放的天空盒演示,涵盖 Scene、Camera、Renderer、PBR 材质、光照与动画循环。'
pubDate: 'Jul 15 2026'
heroImage: '/blog-placeholder-3.jpg'
tags: ['Three.js', 'WebGL', '前端', '3D']
---

> **在线 Demo**:[天空盒演示](/html/skybox.html) · 鼠标拖拽环顾四周,滚轮缩放,右侧 GUI 面板可调参。

天空盒 (Skybox) 是 3D 场景里最常见的"环境感"技巧——把六张图拼成一个立方体贴在场景背景上,玩家走到哪都能看到"远处的天和地"。本文从零拆解一个可交互的天空盒 Demo,逐块讲清楚每个 API 在干什么。

## 1. 准备工作:用 importmap 引入 Three.js

浏览器原生 ES Module 只能写绝对 URL 或相对路径,不认识裸模块名 `'three'`。`<script type="importmap">` 就是给浏览器一张"裸名 → URL"的查找表,放在所有 `<script type="module">` 之前:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  }
}
</script>
```

之后就能直接 `import * as THREE from 'three'`。

## 2. 场景 Scene:3D 物体的容器

场景是所有 mesh / light / camera 的"舞台"。没有它,任何物体都无处安放。

```js
const scene = new THREE.Scene();
```

## 3. 相机 PerspectiveCamera

`PerspectiveCamera` 模拟人眼透视:近大远小。四个参数决定视野:

```js
const camera = new THREE.PerspectiveCamera(
  75,                                     // ① fov (视野角度,度)
  window.innerWidth / window.innerHeight, // ② aspect (宽高比,算错会压扁/拉伸)
  0.1,                                    // ③ near (近裁切面,小于此距离不渲染)
  1000                                    // ④ far  (远裁切面,大于此距离不渲染)
);
camera.position.set(0, 2, 0);             // 初始位置:原点附近,抬高一点
```

- `fov = 75°` 是接近人眼的舒适区;30° 像望远镜,100° 是广角
- `aspect` 必须用 `innerWidth/innerHeight`,保证画布多大相机就多大

## 4. 渲染器 WebGLRenderer

渲染器把 `scene + camera` 计算出的画面用 WebGL 画到 `<canvas>` 上:

```js
const renderer = new THREE.WebGLRenderer({ antialias: true }); // 抗锯齿
renderer.setSize(window.innerWidth, window.innerHeight);       // 画布铺满视口
renderer.setPixelRatio(window.devicePixelRatio);               // 适配 Retina
renderer.outputColorSpace = THREE.SRGBColorSpace;             // 颜色匹配显示器
document.body.appendChild(renderer.domElement);
```

- `antialias: true` 平滑物体边缘,代价是多采样缓冲、GPU 开销略增
- `setPixelRatio` 不设的话,Retina 屏画面发虚(1 物理像素被强行拉成 2×2)
- 不设 `SRGBColorSpace` 的话贴图会偏暗偏灰

## 5. OrbitControls:鼠标拖拽相机

```js
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;        // 阻尼:松开后滑一段距离才停
controls.dampingFactor = 0.08;        // 0~1,越大越"涩"
controls.target.set(0, 2, 0);         // 相机围绕旋转的目标点
controls.minDistance = 0.5;           // 防止缩进物体内
controls.maxDistance = 50;            // 防止飞出场景
controls.maxPolarAngle = Math.PI * 0.9; // 接近水平,防止穿到地面以下
```

注意第二个参数必须是 `renderer.domElement`,不能是 `document.body`,否则鼠标点到 GUI 面板上也会触发相机旋转。

## 6. 加载 6 面立方体贴图 (Skybox 核心)

`CubeTextureLoader` 专门加载立方体贴图,需要 6 张图按固定顺序:

```js
const skyboxUrls = [
  '/img/pp001_skybox/right.jpg',   // ① px (+X, 右)
  '/img/pp001_skybox/left.jpg',    // ② nx (-X, 左)
  '/img/pp001_skybox/top.jpg',     // ③ py (+Y, 上)
  '/img/pp001_skybox/bottom.jpg',  // ④ ny (-Y, 下)
  '/img/pp001_skybox/front.jpg',   // ⑤ pz (+Z, 前)
  '/img/pp001_skybox/back.jpg',    // ⑥ nz (-Z, 后)
];

new THREE.CubeTextureLoader().load(
  skyboxUrls,
  (cubeTexture) => {
    cubeTexture.colorSpace = THREE.SRGBColorSpace;
    scene.background = cubeTexture; // ← 设为场景背景 = 天空盒效果
  },
  undefined,
  (err) => console.error('加载失败', err)
);
```

**顺序错 = 诡异现象**:左右颠倒、上下颠倒,排查时先检查这个。`CubeTexture` 默认 `NoColorSpace`,手动设 `SRGBColorSpace` 才能让颜色显示正确。

## 7. 加一个物体观察天空盒

把"形状"和"外观"组合成一个 `Mesh` 塞进场景:

```js
const geometry = new THREE.BoxGeometry(1, 1, 1);   // 边长 1 的正方体
const material = new THREE.MeshStandardMaterial({ // PBR 材质,受光照影响
  color: 0x4488ff,
  roughness: 0.4,  // 0=镜面 1=完全粗糙
  metalness: 0.3,  // 0=非金属 1=金属
});
const mesh = new THREE.Mesh(geometry, material);
mesh.position.set(0, 0.5, -3);  // 物体在前方 3 个单位
scene.add(mesh);
```

`MeshStandardMaterial` 是 PBR(基于物理的渲染)材质,必须配合光源才会有立体感。

## 8. 灯光:没有光就看不见

```js
// 环境光:无方向、均匀照亮所有面的"全局底光"
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

// 平行光:模拟太阳光,所有光线平行射出
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(5, 10, 5);     // 从右上前斜射下来
sun.castShadow = true;           // 开启阴影投射
sun.shadow.mapSize.set(2048, 2048); // 阴影分辨率,值越大越清晰
scene.add(sun);
```

`mapSize` 必须是 2 的幂(512/1024/2048/4096),默认 512×512 远距离阴影会糊。

## 9. lil-gui 调参面板

`lil-gui` 是 `dat.gui` 的官方继任者,几行代码就能做出参数面板:

```js
import { GUI } from 'https://unpkg.com/three@0.160.0/examples/jsm/libs/lil-gui.module.min.js';

const gui = new GUI();
const skyParams = { rotationSpeed: 0.0005, autoRotate: true };

const skyFolder = gui.addFolder('天空盒设置');
skyFolder.add(skyParams, 'rotationSpeed', -0.005, 0.005).name('旋转速度');
skyFolder.add(skyParams, 'autoRotate').name('自动旋转');
skyFolder.open();
```

`add(obj, key, min, max)` 自动渲染为滑块,`add(obj, key)` 对应 boolean 自动渲染为复选框,`addColor()` 是颜色选择器。

## 10. 动画循环

```js
function animate() {
  requestAnimationFrame(animate);

  // 天空盒自转(模拟云层流动)
  if (skyParams.autoRotate && scene.background) {
    scene.background.rotation += skyParams.rotationSpeed;
  }

  mesh.rotation.y += 0.01;       // 物体自转
  controls.update();              // 必须每帧调,阻尼才生效
  renderer.render(scene, camera);
}
animate();
```

`requestAnimationFrame` 优于 `setInterval`:跟随显示器刷新率、标签页隐藏时自动暂停、不丢帧。

## 11. 响应窗口大小变化

不处理 resize 会出现拉伸或黑边:

```js
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix(); // 改了 aspect 必须重新计算投影矩阵
  renderer.setSize(window.innerWidth, window.innerHeight);
});
```

## 完整流程回顾

1. **场景/相机/渲染器**:三件套搭舞台
2. **OrbitControls**:让相机能转
3. **CubeTextureLoader**:6 张图拼成立方体贴图 → `scene.background`
4. **几何体 + 材质 + Mesh**:塞进场景的可见物体
5. **灯光**:PBR 材质必须配光
6. **lil-gui**:运行时调参
7. **requestAnimationFrame**:驱动每帧渲染

掌握这套最小循环,后面加物体、加交互、加后期效果都是在这个骨架上"长肉"。

---

**相关链接**

- [Three.js 官方文档](https://threejs.org/docs/)
- [在线 Demo:天空盒演示](/html/skybox.html)