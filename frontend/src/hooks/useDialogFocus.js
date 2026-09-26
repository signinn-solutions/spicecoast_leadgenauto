import { useEffect, useRef } from "react";

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

let openDialogCount = 0;
let originalOverflow = "";
const dialogStack = [];

export default function useDialogFocus(isOpen, panelRef, onClose, initialSelector) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const panel = panelRef.current;
    const previousFocus = document.activeElement;
    if (openDialogCount === 0) originalOverflow = document.body.style.overflow;
    openDialogCount += 1;
    const dialogToken = Symbol("dialog");
    dialogStack.push(dialogToken);
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(panel?.querySelectorAll(focusableSelector) || []).filter(
        (element) => element.getClientRects().length > 0
      );
    const initial = panel?.querySelector(initialSelector) || focusables()[0] || panel;
    initial?.focus();

    const onKeyDown = (event) => {
      if (dialogStack.at(-1) !== dialogToken) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      dialogStack.splice(dialogStack.indexOf(dialogToken), 1);
      openDialogCount -= 1;
      if (openDialogCount === 0) document.body.style.overflow = originalOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen, panelRef, initialSelector]);
}
