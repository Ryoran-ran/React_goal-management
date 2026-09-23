function mobileScroller(): HTMLElement | undefined {
  if (!window.matchMedia("(max-width: 760px)").matches) return undefined;
  return document.querySelector<HTMLElement>(".workspace") ?? undefined;
}

export function pageScrollTop(): number {
  return mobileScroller()?.scrollTop ?? window.scrollY;
}

export function scrollPageTo(top: number): void {
  const scroller = mobileScroller();
  if (scroller) scroller.scrollTo({ top });
  else window.scrollTo({ top });
}

export function scrollPageToTop(): void {
  scrollPageTo(0);
}
