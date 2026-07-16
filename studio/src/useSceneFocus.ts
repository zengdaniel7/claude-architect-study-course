import { useEffect } from "react";

export function useSceneFocus(changeKey: string | number) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      const heading = document.querySelector<HTMLElement>("#studio-main h1");
      if (!heading) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [changeKey]);
}
