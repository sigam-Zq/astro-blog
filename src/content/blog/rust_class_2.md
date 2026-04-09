---
title: 'Rust基本语法 part2'
description: 'Rust基本语法闭包'
pubDate: '2026-04-08'
---

# Rust闭包语法详解：从`|| {}`到函数式编程

在Rust中，闭包（closure）是一种强大的功能，它允许你创建内联的匿名函数，并能够捕获其定义环境中的变量。本文将深入探讨Rust闭包的语法和使用，特别是两种看似相似但本质相同的写法。

## 基本语法：两种形式的闭包

在Rust中，以下两种闭包写法是完全等价的：

```rust
// 简洁形式 - 单行闭包
let closure1 = || Imp1::cosine(&a, &b);

// 块形式 - 多行闭包  
let closure2 = || {
    Imp1::cosine(&a, &b)
};
```

### 语法解析

1. **`||`** - 闭包参数列表的开始
   - 空`||`表示无参数闭包
   - 有参数时如`|x, y|`表示接受两个参数

2. **表达式体** - 闭包的执行体
   - 简洁形式：直接跟表达式，以分号结束
   - 块形式：用花括号`{}`包裹代码块

3. **返回值** - 隐式或显式返回
   - 简洁形式：整个表达式的结果就是返回值
   - 块形式：最后一条表达式的结果自动返回（无分号）

## 为什么两种形式都有效？

### Rust的表达式特性
Rust是一门基于表达式的语言，这意味着几乎所有的代码都会产生一个值。这与C/C++等语句式语言不同。

```rust
// 这些都是表达式，都有值
5 + 3           // 值为8
if x > 0 { 1 }  // 值为1或()
{ 2 + 2 }       // 值为4
```

### 闭包作为表达式
闭包本身也是一个表达式，它的值是实现了`Fn`、`FnMut`或`FnOnce` trait的闭包类型。

```rust
// 简洁形式：单个表达式
let add = |x, y| x + y;

// 块形式：代码块表达式
let add = |x, y| {
    x + y  // 无分号，所以是返回值
};
```

## 捕获环境变量

闭包最强大的特性之一是能够捕获其定义环境中的变量。在上述例子中：

```rust
let a = vec![1.0, 2.0, 3.0];
let b = vec![4.0, 5.0, 6.0];

// 闭包捕获了a和b的引用
let closure = || Imp1::cosine(&a, &b);
```

### 捕获方式
Rust闭包有三种捕获方式，对应三种trait：

| Trait | 捕获方式 | 调用次数 | 示例 |
|-------|---------|---------|------|
| `Fn` | 不可变借用 | 多次 | `|| a.len()` |
| `FnMut` | 可变借用 | 多次 | `|| { a.push(1.0); }` |
| `FnOnce` | 获取所有权 | 一次 | `|| { drop(a); }` |

## 在实际代码中的应用

### 性能测试场景
考虑一个性能测试函数：

```rust
fn measure_perf<F, R>(name: &str, f: F, iterations: usize) -> (R, Duration, f64, f32)
where
    F: Fn() -> R,
    R: Clone,
{
    let start = Instant::now();
    let result = f();  // 执行闭包
    let duration = start.elapsed();
    // ... 计算统计数据
    (result, duration, avg, std_dev)
}
```

### 使用闭包的两种方式

```rust
// 方式1：简洁形式（推荐用于简单操作）
let (result1, time1, avg1, std1) = measure_perf(
    "cosine简洁式", 
    || Imp1::cosine(&a, &b),  // 单行闭包
    1000
);

// 方式2：块形式（适合复杂逻辑）
let (result2, time2, avg2, std2) = measure_perf(
    "cosine块形式", 
    || {  // 多行闭包
        // 这里可以添加额外的逻辑
        println!("开始计算cosine距离...");
        let result = Imp1::cosine(&a, &b);
        println!("计算完成");
        result  // 显式返回
    }, 
    1000
);
```

## 闭包的类型推断

Rust闭包的类型是匿名且唯一的，编译器会为每个闭包生成一个唯一的类型：

```rust
let closure1 = || Imp1::cosine(&a, &b);
let closure2 = || { Imp1::cosine(&a, &b) };

// closure1和closure2的类型是不同的！
// 但都实现了 Fn() -> f32
```

### 函数指针 vs 闭包
```rust
// 函数指针 - 类型是 fn() -> f32
fn cosine_func() -> f32 { Imp1::cosine(&a, &b) }
let func_ptr: fn() -> f32 = cosine_func;

// 闭包 - 匿名类型
let closure = || Imp1::cosine(&a, &b);
// closure的类型无法显式写出，是唯一的
```

## 何时使用哪种形式？

### 简洁形式 `|| expression`
- **适用场景**：简单的单行操作
- **优势**：代码紧凑，可读性高
- **示例**：
  ```rust
  || x + y
  || user.is_active()
  || items.iter().sum::<i32>()
  ```

### 块形式 `|| { ... }`
- **适用场景**：多行逻辑，需要中间步骤
- **优势**：可包含多条语句，逻辑清晰
- **示例**：
  ```rust
  || {
      let start = Instant::now();
      let result = compute_value();
      let duration = start.elapsed();
      println!("耗时: {:?}", duration);
      result
  }
  ```

## 高级特性

### move关键字
```rust
let data = vec![1, 2, 3];

// 捕获引用
let closure_ref = || println!("长度: {}", data.len());

// 获取所有权
let closure_owned = move || println!("数据: {:?}", data);

// 之后不能再使用data，所有权被移动了
// println!("{:?}", data); // 错误！
```

### 闭包作为参数和返回值
```rust
// 闭包作为参数
fn apply_twice<F>(mut f: F) where F: FnMut() {
    f();
    f();
}

// 闭包作为返回值（需要使用Box）
fn make_adder(x: i32) -> Box<dyn Fn(i32) -> i32> {
    Box::new(move |y| x + y)
}
```

## 最佳实践

1. **优先使用简洁形式**，除非需要多行逻辑
2. **明确捕获意图**，必要时使用`move`关键字
3. **注意生命周期**，闭包不能比它捕获的变量活得更久
4. **合理使用类型注解**，在复杂场景下提高可读性

## 总结

Rust的闭包语法`|| expression`和`|| { expression }`是同一功能的两种表现形式，体现了Rust语言的表达一致性原则。简洁形式适合简单的单行操作，块形式适合复杂的多行逻辑。理解闭包不仅有助于编写更灵活的代码，也是掌握Rust函数式编程特性的关键。

无论是性能测量、回调处理，还是异步编程，闭包都是Rust程序员工具箱中不可或缺的利器。通过合理使用闭包，可以编写出既安全又高效的Rust代码。