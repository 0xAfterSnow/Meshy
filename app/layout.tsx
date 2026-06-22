import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meshy — Persistent AI Agent Memory on 0G",
  description: "AI agents that remember across sessions, powered by 0G decentralized storage.",
};

// Inline pre-paint script: applies the saved theme to <html> before React hydrates,
// so the page never flashes the wrong palette.
// Inline pre-paint script. Runs synchronously in <head> before the <body>
// exists, so we apply the theme to <html> here (which always exists), then
// the page's useEffect mirrors it onto <body> on mount.
const themeScript = `
(function () {
  try {
    var t = localStorage.getItem("meshy-theme");
    var theme = (t === "light" || t === "dark") ? t : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    // Mirror to <body> as soon as it exists, so the css rule on body also matches.
    var apply = function () {
      if (document.body) document.body.setAttribute("data-theme", theme);
    };
    apply();
    if (!document.body) {
      new MutationObserver(function (_, obs) {
        if (document.body) { apply(); obs.disconnect(); }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
