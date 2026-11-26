/** Turns off the public site's kit stylesheets so the admin uses only its own styles. */
export function disableKit(): void {
  document.querySelectorAll<HTMLLinkElement>("link[data-kit]").forEach((link) => {
    link.disabled = true;
  });
}
