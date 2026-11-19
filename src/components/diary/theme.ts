import postcss from "postcss";

/** Build-time scoping: no Web Awesome reset or theme rule reaches the blog shell. */
export function scopeDiaryTheme(css: string) {
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    rule.selectors = rule.selectors.map((selector) => {
      if (selector.includes(":root") || selector.includes(":host"))
        return selector
          .replaceAll(":root", ".diary-app")
          .replaceAll(":host", ".diary-app");
      // Theme classes live on the diary root; other selectors are descendants.
      return selector.startsWith(".")
        ? `:is(.diary-app)${selector}`
        : `.diary-app ${selector}`;
    });
  });
  return root.toString();
}
