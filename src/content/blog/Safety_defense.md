---
title: '关于安全的知识点'
description: '关于xss防御和sql注入过滤器的处理-原理+java向'
pubDate: 2026-04-14T11:44:05.569Z
heroImage: '/blog-placehoder-7.jpg'
---


## xss 攻击原理

攻击者在网页中注入恶意脚本，使其在用户浏览器中自动执行，从而窃取信息或伪造操作
### 三种常见 XSS

① 存储型 XSS（最危险）

恶意代码存入数据库，所有访问页面的人都会中招。例：评论区、留言板、个人简介。
② 反射型 XSS

恶意代码放在URL 参数里，诱骗用户点链接才触发。例：?keyword=<script>xxx</script>
③ DOM 型 XSS

漏洞在前端 JS，数据不经过后端，直接从 URL 读到页面 DOM。例：前端直接用 location.search 拼到 HTML 里


### java xss 防护方法

>   思路 通过关键字识别和替换来
```java
package org.jeecg.common.util;

import org.springframework.web.util.HtmlUtils;

import java.util.regex.Pattern;

/**
 * XSS 攻击防护工具类
 * @author: jeecg-boot
 */
public class XssUtils {

    private static Pattern[] patterns = new Pattern[]{
        //Script fragments
        Pattern.compile("<script>(.*?)</script>", Pattern.CASE_INSENSITIVE),
        //src='...'
        Pattern.compile("src[\r\n]*=[\r\n]*\\\'(.*?)\\\'", Pattern.CASE_INSENSITIVE | Pattern.MULTILINE | Pattern.DOTALL),
        Pattern.compile("src[\r\n]*=[\r\n]*\\\"(.*?)\\\"", Pattern.CASE_INSENSITIVE | Pattern.MULTILINE | Pattern.DOTALL),
        //script tags
        Pattern.compile("</script>", Pattern.CASE_INSENSITIVE),
        Pattern.compile("<script(.*?)>", Pattern.CASE_INSENSITIVE | Pattern.MULTILINE | Pattern.DOTALL),
        //eval(...)
        Pattern.compile("eval\\((.*?)\\)", Pattern.CASE_INSENSITIVE | Pattern.MULTILINE | Pattern.DOTALL),
        //expression(...)
        Pattern.compile("e­xpression\\((.*?)\\)", Pattern.CASE_INSENSITIVE | Pattern.MULTILINE | Pattern.DOTALL),
        //javascript:...
        Pattern.compile("javascript:", Pattern.CASE_INSENSITIVE),
        //vbscript:...
        Pattern.compile("vbscript:", Pattern.CASE_INSENSITIVE),
        //onload(...)=...
        Pattern.compile("onload(.*?)=", Pattern.CASE_INSENSITIVE | Pattern.MULTILINE | Pattern.DOTALL),
    };

    /**
     * 清理 XSS 攻击内容并进行 HTML 转义
     */
    public static String scriptXss(String value) {
        if (value != null) {
            // 注意：replaceAll(" ", "") 可能会破坏某些合法内容，这里保留原有逻辑但需谨慎使用
            // value = value.replaceAll(" ", ""); 
            for(Pattern scriptPattern: patterns){
                value = scriptPattern.matcher(value).replaceAll("");
            }
            return HtmlUtils.htmlEscape(value);
        }
        return null;
    }
}

```


## sql注入


### sql注入原理

### sql 注入防护方法java

```java
package org.jeecg.common.util;

import cn.hutool.core.util.ReUtil;
import lombok.extern.slf4j.Slf4j;
import org.jeecg.common.constant.CommonConstant;
import org.jeecg.common.constant.SymbolConstant;
import org.jeecg.common.exception.JeecgSqlInjectionException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * sql注入处理工具类
 * 
 * @author zhoujf
 */
@Slf4j
public class SqlInjectionUtil {

	/**
	 * sql注入黑名单数据库名
	 */
	public final static String XSS_STR_TABLE = "peformance_schema|information_schema";

	/**
	 * 默认—sql注入关键词
	 */
	private final static String XSS_STR = "and |exec |peformance_schema|information_schema|extractvalue|updatexml|geohash|gtid_subset|gtid_subtract|insert |select |delete |update |drop |count |chr |mid |master |truncate |char |declare |;|or |+|--";
	/**
	 * online报表专用—sql注入关键词
	 */
	private static String specialReportXssStr = "exec |peformance_schema|information_schema|extractvalue|updatexml|geohash|gtid_subset|gtid_subtract|insert |alter |delete |grant |update |drop |master |truncate |declare |--";
	/**
	 * 字典专用—sql注入关键词
	 */
	private static String specialDictSqlXssStr = "exec |peformance_schema|information_schema|extractvalue|updatexml|geohash|gtid_subset|gtid_subtract|insert |select |delete |update |drop |count |chr |mid |master |truncate |char |declare |;|+|--";
	/**
	 * 完整匹配的key，不需要考虑前空格
	 */
	private static List<String> FULL_MATCHING_KEYWRODS = new ArrayList<>();
	static {
		FULL_MATCHING_KEYWRODS.add(";");
		FULL_MATCHING_KEYWRODS.add("+");
		FULL_MATCHING_KEYWRODS.add("--");
	}
	
	
	/**
	 * sql注入风险的 正则关键字
	 *
	 * 函数匹配，需要用正则模式
	 */
	private final static String[] XSS_REGULAR_STR_ARRAY = new String[]{
			"chr\\s*\\(",
			"mid\\s*\\(",
			" char\\s*\\(",
			"sleep\\s*\\(",
			"user\\s*\\(",
			"show\\s+tables",
			"user[\\s]*\\([\\s]*\\)",
			"show\\s+databases",
			"sleep\\(\\d*\\)",
			"sleep\\(.*\\)",
	};
	/**
	 * sql注释的正则
	 */
	private final static Pattern SQL_ANNOTATION = Pattern.compile("/\\*[\\s\\S]*\\*/");
	private final static  String SQL_ANNOTATION2 = "--";
	
	/**
	 * sql注入提示语
	 */
	private final static String SQL_INJECTION_KEYWORD_TIP = "请注意，存在SQL注入关键词---> {}";
	private final static String SQL_INJECTION_TIP = "请注意，值可能存在SQL注入风险!--->";
	private final static String SQL_INJECTION_TIP_VARIABLE = "请注意，值可能存在SQL注入风险!---> {}";
	

	/**
	 * sql注入过滤处理，遇到注入关键字抛异常
	 * @param values
	 */
	public static void filterContentMulti(String... values) {
		filterContent(values, null);
	}

	/**
	 * 校验比较严格
	 * 
	 * sql注入过滤处理，遇到注入关键字抛异常
	 *
	 * @param value
	 * @return
	 */
	public static void filterContent(String value, String customXssString) {
		if (value == null || "".equals(value)) {
			return;
		}
		// 一、校验sql注释 不允许有sql注释
		checkSqlAnnotation(value);
		// 转为小写进行后续比较
		value = value.toLowerCase().trim();
		
		// 二、SQL注入检测存在绕过风险 (普通文本校验)
		//https://gitee.com/jeecg/jeecg-boot/issues/I4NZGE
		String[] xssArr = XSS_STR.split("\\|");
		for (int i = 0; i < xssArr.length; i++) {
			if (value.indexOf(xssArr[i]) > -1) {
				log.error(SqlInjectionUtil.SQL_INJECTION_KEYWORD_TIP, xssArr[i]);
				log.error(SqlInjectionUtil.SQL_INJECTION_TIP_VARIABLE, value);
				throw new JeecgSqlInjectionException(SqlInjectionUtil.SQL_INJECTION_TIP + value);
			}
		}
		// 三、SQL注入检测存在绕过风险 (自定义传入普通文本校验)
		if (customXssString != null) {
			String[] xssArr2 = customXssString.split("\\|");
			for (int i = 0; i < xssArr2.length; i++) {
				if (value.indexOf(xssArr2[i]) > -1) {
					log.error(SqlInjectionUtil.SQL_INJECTION_KEYWORD_TIP, xssArr2[i]);
					log.error(SqlInjectionUtil.SQL_INJECTION_TIP_VARIABLE, value);
					throw new JeecgSqlInjectionException(SqlInjectionUtil.SQL_INJECTION_TIP + value);
				}
			}
		}

		// 四、SQL注入检测存在绕过风险 (正则校验)
		for (String regularOriginal : XSS_REGULAR_STR_ARRAY) {
			String regular = ".*" + regularOriginal + ".*";
			if (Pattern.matches(regular, value)) {
				log.error(SqlInjectionUtil.SQL_INJECTION_KEYWORD_TIP, regularOriginal);
				log.error(SqlInjectionUtil.SQL_INJECTION_TIP_VARIABLE, value);
				throw new JeecgSqlInjectionException(SqlInjectionUtil.SQL_INJECTION_TIP + value);
			}
		}
		return;
	}

	/**
	 * 判断是否存在SQL注入关键词字符串
	 *
	 * @param keyword
	 * @return
	 */
	@SuppressWarnings("AlibabaUndefineMagicConstant")
	private static boolean isExistSqlInjectKeyword(String sql, String keyword) {
		if (sql.startsWith(keyword.trim())) {
			return true;
		} else if (sql.contains(keyword)) {
			// 需要匹配的，sql注入关键词
			String matchingText = " " + keyword;
			if(FULL_MATCHING_KEYWRODS.contains(keyword)){
				matchingText = keyword;
			}
			
			if (sql.contains(matchingText)) {
				return true;
			} else {
				String regularStr = "\\s+\\S+" + keyword;
				List<String> resultFindAll = ReUtil.findAll(regularStr, sql, 0, new ArrayList<String>());
				for (String res : resultFindAll) {
					log.info("isExistSqlInjectKeyword —- 匹配到的SQL注入关键词：{}", res);
					/**
					 * SQL注入中可以替换空格的字符(%09  %0A  %0D  +都可以替代空格)
					 * http://blog.chinaunix.net/uid-12501104-id-2932639.html
					 * https://www.cnblogs.com/Vinson404/p/7253255.html
					 * */
					if (res.contains("%") || res.contains("+") || res.contains("#") || res.contains("/") || res.contains(")")) {
						return true;
					}
				}
			}
		}
		return false;
	}

	/**
	 * 判断是否存在SQL注入关键词字符串
	 *
	 * @param keyword
	 * @return
	 */
	@SuppressWarnings("AlibabaUndefineMagicConstant")
	private static boolean isExistSqlInjectTableKeyword(String sql, String keyword) {
		// 需要匹配的，sql注入关键词
		String[] matchingTexts = new String[]{"`" + keyword, "(" + keyword, "(`" + keyword};
		for (String matchingText : matchingTexts) {
			String[] checkTexts = new String[]{" " + matchingText, "from" + matchingText};
			for (String checkText : checkTexts) {
				if (sql.contains(checkText)) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * sql注入过滤处理，遇到注入关键字抛异常
	 * 
	 * @param values
	 * @return
	 */
	public static void filterContent(String[] values, String customXssString) {
		for (String val : values) {
			if (oConvertUtils.isEmpty(val)) {
				return;
			}
			filterContent(val, customXssString);
		}
		return;
	}

	/**
	 * 【提醒：不通用】
	 * 仅用于字典条件SQL参数，注入过滤
	 *
	 * @param value
	 * @return
	 */
	public static void specialFilterContentForDictSql(String value) {
		String[] xssArr = specialDictSqlXssStr.split("\\|");
		if (value == null || "".equals(value)) {
			return;
		}
		// 一、校验sql注释 不允许有sql注释
		checkSqlAnnotation(value);
		value = value.toLowerCase().trim();
		
		// 二、SQL注入检测存在绕过风险 (普通文本校验)
		for (int i = 0; i < xssArr.length; i++) {
			if (isExistSqlInjectKeyword(value, xssArr[i])) {
				log.error(SqlInjectionUtil.SQL_INJECTION_KEYWORD_TIP, xssArr[i]);
				log.error(SqlInjectionUtil.SQL_INJECTION_TIP_VARIABLE, value);
				throw new JeecgSqlInjectionException(SqlInjectionUtil.SQL_INJECTION_TIP + value);
			}
		}
		String[] xssTableArr = XSS_STR_TABLE.split("\\|");
		for (String xssTableStr : xssTableArr) {
            if (isExistSqlInjectTableKeyword(value, xssTableStr)) {
                log.error(SqlInjectionUtil.SQL_INJECTION_KEYWORD_TIP, xssTableStr);
                log.error(SqlInjectionUtil.SQL_INJECTION_TIP_VARIABLE, value);
                throw new JeecgSqlInjectionException(SqlInjectionUtil.SQL_INJECTION_TIP + value);
            }
        }

		// 三、SQL注入检测存在绕过风险 (正则校验)
		for (String regularOriginal : XSS_REGULAR_STR_ARRAY) {
			String regular = ".*" + regularOriginal + ".*";
			if (Pattern.matches(regular, value)) {
				log.error(SqlInjectionUtil.SQL_INJECTION_KEYWORD_TIP, regularOriginal);
				log.error(SqlInjectionUtil.SQL_INJECTION_TIP_VARIABLE, value);
				throw new JeecgSqlInjectionException(SqlInjectionUtil.SQL_INJECTION_TIP + value);
			}
		}
		return;
	}

    /**
	 * 【提醒：不通用】
     *  仅用于Online报表SQL解析，注入过滤
     * @param value
     * @return
     */
	public static void specialFilterContentForOnlineReport(String value) {
		String[] xssArr = specialReportXssStr.split("\\|");
		if (value == null || "".equals(value)) {
			return;
		}
		// 一、校验sql注释 不允许有sql注释
		checkSqlAnnotation(value);
		value = value.toLowerCase().trim();
		
		// 二、SQL注入检测存在绕过风险 (普通文本校验)
		for (int i = 0; i < xssArr.length; i++) {
			if (isExistSqlInjectKeyword(value, xssArr[i])) {
				log.error(SqlInjectionUtil.SQL_INJECTION_KEYWORD_TIP, xssArr[i]);
				log.error(SqlInjectionUtil.SQL_INJECTION_TIP_VARIABLE, value);
				throw new JeecgSqlInjectionException(SqlInjectionUtil.SQL_INJECTION_TIP + value);
			}
		}
		String[] xssTableArr = XSS_STR_TABLE.split("\\|");
		for (String xssTableStr : xssTableArr) {
			if (isExistSqlInjectTableKeyword(value, xssTableStr)) {
				log.error(SqlInjectionUtil.SQL_INJECTION_KEYWORD_TIP, xssTableStr);
				log.error(SqlInjectionUtil.SQL_INJECTION_TIP_VARIABLE, value);
				throw new JeecgSqlInjectionException(SqlInjectionUtil.SQL_INJECTION_TIP + value);
			}
		}

		// 三、SQL注入检测存在绕过风险 (正则校验)
		for (String regularOriginal : XSS_REGULAR_STR_ARRAY) {
			String regular = ".*" + regularOriginal + ".*";
			if (Pattern.matches(regular, value)) {
				log.error(SqlInjectionUtil.SQL_INJECTION_KEYWORD_TIP, regularOriginal);
				log.error(SqlInjectionUtil.SQL_INJECTION_TIP_VARIABLE, value);
				throw new JeecgSqlInjectionException(SqlInjectionUtil.SQL_INJECTION_TIP + value);
			}
		}
		return;
	}


	/**
	 * 校验是否有sql注释 
	 * @return
	 */
	public static void checkSqlAnnotation(String str){
		if(str.contains(SQL_ANNOTATION2)){
			String error = "请注意，SQL中不允许含注释，有安全风险！";
			log.error(error);
			throw new RuntimeException(error);
		}

		
		Matcher matcher = SQL_ANNOTATION.matcher(str);
		if(matcher.find()){
			String error = "请注意，值可能存在SQL注入风险---> \\*.*\\";
			log.error(error);
			throw new JeecgSqlInjectionException(error);
		}
	}


	/**
	 * 返回查询表名
	 * <p>
	 * sql注入过滤处理，遇到注入关键字抛异常
	 *
	 * @param table
	 */
	private static Pattern tableNamePattern = Pattern.compile("^[a-zA-Z][a-zA-Z0-9_\\$]{0,63}$");
	public static String getSqlInjectTableName(String table) {
		if(oConvertUtils.isEmpty(table)){
			return table;
		}

		//update-begin---author:scott ---date:2024-05-28  for：表单设计器列表翻译存在表名带条件，导致翻译出问题----
		int index = table.toLowerCase().indexOf(" where ");
		if (index != -1) {
			table = table.substring(0, index);
			log.info("截掉where之后的新表名：" + table);
		}
		//update-end---author:scott ---date::2024-05-28  for：表单设计器列表翻译存在表名带条件，导致翻译出问题----

		table = table.trim();
		/**
		 * 检验表名是否合法
		 *
		 * 表名只能由字母、数字和下划线组成。
		 * 表名必须以字母开头。
		 * 表名长度通常有限制，例如最多为 64 个字符。
		 */
		boolean isValidTableName = tableNamePattern.matcher(table).matches();
		if (!isValidTableName) {
			String errorMsg = "表名不合法，存在SQL注入风险!--->" + table;
			log.error(errorMsg);
			throw new JeecgSqlInjectionException(errorMsg);
		}

		//进一步验证是否存在SQL注入风险
		filterContentMulti(table);
		return table;
	}


	/**
	 * 返回查询字段
	 * <p>
	 * sql注入过滤处理，遇到注入关键字抛异常
	 *
	 * @param field
	 */
	static final Pattern fieldPattern = Pattern.compile("^[a-zA-Z0-9_]+$");
	public static String getSqlInjectField(String field) {
		if(oConvertUtils.isEmpty(field)){
			return field;
		}
		
		field = field.trim();

		if (field.contains(SymbolConstant.COMMA)) {
			return getSqlInjectField(field.split(SymbolConstant.COMMA));
		}

		/**
		 * 校验表字段是否有效
		 *
		 * 字段定义只能是是字母 数字 下划线的组合（不允许有空格、转义字符串等）
		 */
		boolean isValidField = fieldPattern.matcher(field).matches();
		if (!isValidField) {
			String errorMsg = "字段不合法，存在SQL注入风险!--->" + field;
			log.error(errorMsg);
			throw new JeecgSqlInjectionException(errorMsg);
		}

		//进一步验证是否存在SQL注入风险
		filterContentMulti(field);
		return field;
	}

	/**
	 * 获取多个字段
	 * 返回: 逗号拼接
	 *
	 * @param fields
	 * @return
	 */
	public static String getSqlInjectField(String... fields) {
		for (String s : fields) {
			getSqlInjectField(s);
		}
		return String.join(SymbolConstant.COMMA, fields);
	}


	/**
	 * 获取排序字段
	 * 返回：字符串
	 *
	 * 1.将驼峰命名转化成下划线 
	 * 2.限制sql注入
	 * @param sortField  排序字段
	 * @return
	 */
	public static String getSqlInjectSortField(String sortField) {
		String field = SqlInjectionUtil.getSqlInjectField(oConvertUtils.camelToUnderline(sortField));
		return field;
	}

	/**
	 * 获取多个排序字段
	 * 返回：数组
	 *
	 * 1.将驼峰命名转化成下划线 
	 * 2.限制sql注入
	 * @param sortFields 多个排序字段
	 * @return
	 */
	public static List getSqlInjectSortFields(String... sortFields) {
		List list = new ArrayList<String>();
		for (String sortField : sortFields) {
			list.add(getSqlInjectSortField(sortField));
		}
		return list;
	}

	/**
	 * 获取 orderBy type
	 * 返回：字符串
	 * <p>
	 * 1.检测是否为 asc 或 desc 其中的一个
	 * 2.限制sql注入
	 *
	 * @param orderType
	 * @return
	 */
	public static String getSqlInjectOrderType(String orderType) {
		if (orderType == null) {
			return null;
		}
		orderType = orderType.trim();
		if (CommonConstant.ORDER_TYPE_ASC.equalsIgnoreCase(orderType)) {
			return CommonConstant.ORDER_TYPE_ASC;
		} else {
			return CommonConstant.ORDER_TYPE_DESC;
		}
	}

}

```


## 开放性重定向


### 开放式重定向防护

```java


/**
 * @Description: 通用工具
 * @author: jeecg-boot
 */
@Slf4j
public class CommonUtils {
    /**
     * 安全重定向校验
     * @param url 待校验的URL
     * @param safeDomains 安全域名白名单
     * @return 是否安全
     */
    public static boolean isSafeUrl(String url, List<String> safeDomains) {
        if (StringUtils.isBlank(url)) {
            return false;
        }

        // 1. 站内相对路径校验 (以 / 开头，且不是 // 开头)
        if (url.startsWith("/") && !url.startsWith("//")) {
            return true;
        }

        // 2. 绝对路径校验
        try {
            URI uri = new URI(url);
            String host = uri.getHost();
            if (host == null) {
                return false;
            }

            // 校验域名是否在白名单中
            if (safeDomains != null && !safeDomains.isEmpty()) {
                for (String domain : safeDomains) {
                    if (host.equalsIgnoreCase(domain) || host.endsWith("." + domain)) {
                        return true;
                    }
                }
            }
        } catch (URISyntaxException e) {
            log.error("URL 格式错误: {}", url);
            return false;
        }

        return false;
    }
}
```


#### 使用示例

```java
//  securityProperties.getSafeRedirectDomains() 是配置的允许重定向的白名单 
// 校验重定向地址安全性
if (!CommonUtils.isSafeUrl(filePath, securityProperties.getSafeRedirectDomains())) {
    response.setStatus(403);
    return;
}
response.sendRedirect(filePath);
```



### 使用硬编码密码

代码里直接写 密码字符串了

#### 整改方向
从代码中删除明文密码
移入配置文件 / 环境变量 / 密钥管理服务（Nacos/Apollo/vault）
代码读取配置获取密码



### 弱加密：使用不安全的ECB模式

````md
# ECB / CBC 加密模式 通俗大白话详解
结合你刚才的 **DES、AES、PBE** 场景，专门讲透，秒懂区别、风险、整改要求。

---

## 一、基础前提
DES、AES 这类都属于**分组密码**：
明文太长，会被切成**固定长度小块（分组）**，
**ECB、CBC 就是：不同的「块与块之间怎么加密」的规则**。

---

# 1. ECB 模式（电子密码本）
### 全称
Electronic CodeBook

### 工作逻辑
1. 把明文切成一块块
2. **每一块，单独用同一个密钥独立加密**
3. 块和块之间**毫无关联、互不影响**

### 致命缺点（重点！等保/渗透必高危）
1. **相同明文块 = 相同密文**
2. 完全没有混淆、没有随机性
3. 密文规律极强，**极易被破解、篡改、分析**

### 举个超级好懂的例子
明文：`AAAA BBBB AAAA`
ECB 加密后：`密A 密B 密A`
👉 一看就知道前后两段内容一样，直接泄露规律

### 结论
**ECB 极度不安全，现在所有安全规范：禁止使用**

---

# 2. CBC 模式（密码分组链接）
### 全称
Cipher Block Chaining

### 工作逻辑（核心：链式关联）
1. 明文切分成多个块
2. **第一个块**：先和一个随机的 **IV初始向量** 做异或，再加密
3. **后面每一个块**：
   和「**上一块加密出来的密文**」异或 → 再加密
4. 块与块环环相扣、互相影响

### 优点
1. 相同明文，只要 IV 不同，**加密结果完全不一样**
2. 破坏规律、防分析、防明文猜测
3. 比 ECB 安全非常多

### 必要条件
**CBC 必须搭配：随机 IV（初始向量）**
- IV 长度 = 加密块长度（DES 64位 / AES 128位）
- IV 必须**随机、不可复用**

---

# 二、极简对比总结
| 特性 | ECB 模式 | CBC 模式 |
|------|----------|----------|
| 块关联 | 无，独立加密 | 链式关联，互相影响 |
| 相同明文 | 密文完全相同 | 密文完全不同 |
| 是否需要 IV | 不需要 | **必须要随机IV** |
| 安全性 | 极低，高危漏洞 | 中等（老旧可用） |
| 合规要求 | 禁止使用 | 可临时用，推荐升级 GCM |

---

# 三、结合你上个问题：PBEWithMD5AndDES
1. 老旧 Java 默认很多用：
   - **DES + ECB** → 超级高危
2. 安全整改最低要求：
   - 改成 **DES/CBC + 随机IV**
3. 最终最优整改：
   - 弃用 DES+MD5
   - 改用 **AES-GCM / AES-CBC + SHA256**

---

# 四、安全整改标准答案（你整改能用）
1. 严禁：
   - `DES/ECB`、`AES/ECB`
2. 过渡可用：
   - `AES/CBC/PKCS5Padding` + 随机IV
3. 最优推荐（等保/密评满分）：
   - **AES-GCM**（自带完整性校验，防篡改）

---

# 五、一句话记忆
- **ECB：无脑单独加密，裸奔不安全，直接禁用**
- **CBC：前后块连环加密 + 随机IV，老系统标准安全方案**

需要我给你一段 Java 代码，演示 **ECB 不安全写法 vs CBC 安全写法** 对照吗？直接可用于整改替换。
````

#### 整改代码

```java
package org.jeecg.common.util.security;

import cn.hutool.core.codec.Base64Decoder;
import cn.hutool.core.codec.Base64Encoder;
import cn.hutool.core.util.ArrayUtil;
import cn.hutool.core.util.RandomUtil;
import cn.hutool.crypto.Mode;
import cn.hutool.crypto.Padding;
import cn.hutool.crypto.SecureUtil;
import cn.hutool.crypto.asymmetric.KeyType;
import cn.hutool.crypto.asymmetric.RSA;
import cn.hutool.crypto.asymmetric.Sign;
import cn.hutool.crypto.asymmetric.SignAlgorithm;
import cn.hutool.crypto.symmetric.AES;
import org.jeecg.common.util.security.entity.*;
import com.alibaba.fastjson.JSONObject;
import javax.crypto.SecretKey;
import java.security.KeyPair;

/**
 * @Description: SecurityTools
 * @author: jeecg-boot
 */
public class SecurityTools {
    public static final String ALGORITHM = "AES/CBC/PKCS5Padding";
    private static final int IV_LENGTH = 16;
    private static final SignAlgorithm SIGN_ALGORITHM = SignAlgorithm.SHA256withRSA;

    public static SecurityResp valid(SecurityReq req) {
        SecurityResp resp=new SecurityResp();
        String pubKey=req.getPubKey();
        String aesKey=req.getAesKey();
        String data=req.getData();
        String signData=req.getSignData();
        RSA rsa=new RSA(null, Base64Decoder.decode(pubKey));
        Sign sign= new Sign(SIGN_ALGORITHM,null,pubKey);

        byte[] decryptAes = rsa.decrypt(aesKey, KeyType.PublicKey);
        // 解密出数据并提取 IV
        byte[] bytes = Base64Decoder.decode(data);
        if (bytes.length <= IV_LENGTH) {
            resp.setSuccess(false);
            return resp;
        }
        byte[] iv = ArrayUtil.sub(bytes, 0, IV_LENGTH);
        byte[] encrypted = ArrayUtil.sub(bytes, IV_LENGTH, bytes.length);

        AES aes = new AES(Mode.CBC, Padding.PKCS5Padding, decryptAes, iv);
        String dencrptValue = aes.decryptStr(encrypted);
        resp.setData(JSONObject.parseObject(dencrptValue));

        boolean verify = sign.verify(dencrptValue.getBytes(), Base64Decoder.decode(signData));
        resp.setSuccess(verify);
        return resp;
    }

    public static SecuritySignResp sign(SecuritySignReq req) {
        SecretKey secretKey = SecureUtil.generateKey("AES");
        byte[] key= secretKey.getEncoded();
        String prikey=req.getPrikey();
        String data=req.getData();

        // 生成随机 IV 并进行 CBC 加密
        byte[] iv = RandomUtil.randomBytes(IV_LENGTH);
        AES aes = new AES(Mode.CBC, Padding.PKCS5Padding, key, iv);
        byte[] encrypted = aes.encrypt(data);
        // 将 IV 和密文拼接后 Base64 编码
        byte[] result = ArrayUtil.addAll(iv, encrypted);
        String encrptData = Base64Encoder.encode(result);

        RSA rsa=new RSA(prikey,null);
        byte[] encryptAesKey = rsa.encrypt(secretKey.getEncoded(), KeyType.PrivateKey);

        Sign sign= new Sign(SIGN_ALGORITHM,prikey,null);
        byte[] signed = sign.sign(data.getBytes());

        SecuritySignResp resp=new SecuritySignResp();
        resp.setAesKey(Base64Encoder.encode(encryptAesKey));
        resp.setData(encrptData);
        resp.setSignData(Base64Encoder.encode(signed));
        return resp;
    }

    public static MyKeyPair generateKeyPair(){
        KeyPair keyPair= SecureUtil.generateKeyPair(SIGN_ALGORITHM.getValue(),2048);
        String priKey= Base64Encoder.encode(keyPair.getPrivate().getEncoded());
        String pubkey= Base64Encoder.encode(keyPair.getPublic().getEncoded());
        MyKeyPair resp=new MyKeyPair();
        resp.setPriKey(priKey);
        resp.setPubKey(pubkey);
        return resp;
    }
}

```

