import { createElement, type ComponentChildren, type JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type WaDialog from "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import type WaInput from "@awesome.me/webawesome/dist/components/input/input.js";
import type WaTextarea from "@awesome.me/webawesome/dist/components/textarea/textarea.js";
import type WaTabGroup from "@awesome.me/webawesome/dist/components/tab-group/tab-group.js";
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/input/input.js";
import "@awesome.me/webawesome/dist/components/textarea/textarea.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/callout/callout.js";
import "@awesome.me/webawesome/dist/components/tag/tag.js";
import "@awesome.me/webawesome/dist/components/spinner/spinner.js";
import "@awesome.me/webawesome/dist/components/tab-group/tab-group.js";
import "@awesome.me/webawesome/dist/translations/zh-cn.js";

// Keep the web-component property/event bridge local to the diary island.
type ButtonProps = JSX.HTMLAttributes<HTMLElement> & {
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
  variant?: "neutral" | "brand" | "danger";
};
export function Button({
  children,
  type = "button",
  variant,
  ...props
}: ButtonProps) {
  const classes = String(props.class || "");
  const primary = classes.includes("diary-primary");
  const danger = classes.includes("diary-danger");
  return createElement(
    "wa-button",
    {
      ...props,
      type,
      variant: variant || (primary ? "brand" : danger ? "danger" : "neutral"),
      appearance: primary ? "accent" : "outlined",
    },
    children
  );
}

type ValueEvent = { currentTarget: { value: string } };
type FieldProps = {
  label: string;
  class?: string;
  name?: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  maxLength?: number;
  autoComplete?: string;
  onInput?: (event: ValueEvent) => void;
  onChange?: (event: ValueEvent) => void;
};
export function Input({
  onInput,
  onChange,
  autoComplete,
  maxLength,
  ...props
}: FieldProps & { type?: WaInput["type"] }) {
  return createElement("wa-input", {
    ...props,
    autocomplete: autoComplete,
    maxlength: maxLength,
    passwordToggle: props.type === "password",
    onInput: (event: Event) =>
      onInput?.({
        currentTarget: { value: (event.currentTarget as WaInput).value || "" },
      }),
    onChange: (event: Event) =>
      onChange?.({
        currentTarget: { value: (event.currentTarget as WaInput).value || "" },
      }),
  });
}
export function Textarea({
  onInput,
  ...props
}: FieldProps & { rows?: number }) {
  return createElement("wa-textarea", {
    ...props,
    resize: "vertical",
    onInput: (event: Event) =>
      onInput?.({
        currentTarget: {
          value: (event.currentTarget as WaTextarea).value || "",
        },
      }),
  });
}

export function Dialog({
  label,
  children,
  footer,
  locked = false,
  onClose,
}: {
  label: string;
  children: ComponentChildren;
  footer: ComponentChildren;
  locked?: boolean;
  onClose: () => void;
}) {
  const ref = useRef<WaDialog>(null);
  const current = useRef({ locked, onClose });
  current.current = { locked, onClose };
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = window.document.activeElement;
    const hide = (event: Event) => {
      if (event.target !== dialog) return;
      // Preact owns open/closed state, including Escape and the close button.
      event.preventDefault();
      if (!current.current.locked) current.current.onClose();
    };
    dialog.addEventListener("wa-hide", hide);
    dialog.open = true;
    return () => {
      dialog.removeEventListener("wa-hide", hide);
      dialog.open = false;
      dialog.dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  return createElement(
    "wa-dialog",
    { ref, label, class: "diary-dialog" },
    children,
    <div slot="footer" class="diary-actions">
      {footer}
    </div>
  );
}

export function Callout({
  children,
  variant = "danger",
  class: className,
}: {
  children: ComponentChildren;
  variant?: "danger" | "warning" | "success";
  class?: string;
}) {
  return createElement(
    "wa-callout",
    {
      variant,
      class: className,
      role: variant === "danger" ? "alert" : "status",
    },
    children
  );
}
export function Tag({ children }: { children: ComponentChildren }) {
  return createElement(
    "wa-tag",
    { size: "small", appearance: "filled" },
    children
  );
}
export function Loading({ children }: { children: ComponentChildren }) {
  return (
    <p class="diary-loading" role="status">
      {createElement("wa-spinner", { "aria-hidden": "true" })}
      {children}
    </p>
  );
}

export function EditorTabs({
  preview,
  onChange,
  editor,
  reader,
}: {
  preview: boolean;
  onChange: (preview: boolean) => void;
  editor: ComponentChildren;
  reader: ComponentChildren;
}) {
  // Keep navigation available while fields are locked, so pending writes never hide the body.
  const ref = useRef<WaTabGroup>(null);
  useEffect(() => {
    const group = ref.current!;
    const show = (event: Event) => {
      if (event.target === group)
        onChange(
          (event as CustomEvent<{ name: string }>).detail.name === "preview"
        );
    };
    group.addEventListener("wa-tab-show", show);
    return () => group.removeEventListener("wa-tab-show", show);
  }, [onChange]);
  return createElement(
    "wa-tab-group",
    { ref, active: preview ? "preview" : "edit", class: "diary-editor-tabs" },
    createElement("wa-tab", { panel: "edit" }, "编辑 Markdown"),
    createElement("wa-tab", { panel: "preview" }, "预览"),
    createElement("wa-tab-panel", { name: "edit" }, editor),
    createElement("wa-tab-panel", { name: "preview" }, reader)
  );
}
