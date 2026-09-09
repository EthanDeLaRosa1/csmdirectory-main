import { useEffect, useState } from "react";
import { Palette } from "lucide-react";

const THEMES = [
  { id: "red", name: "Copado Red", hex: "#ef4444", hsl: "0 84.2% 60.2%" },
  { id: "chiikawa", name: "Chiikawa (Pastel 🎀✨)", hex: "#f472b6", hsl: "330 81% 70%" },
  { id: "purple", name: "Cyberpunk Purple", hex: "#a855f7", hsl: "270 91% 65%" },
  { id: "emerald", name: "Emerald Ops", hex: "#10b981", hsl: "158 64% 42%" },
  { id: "blue", name: "Ocean Blue", hex: "#0ea5e9", hsl: "199 89% 48%" },
];

export function ColorThemePicker() {
  const [activeColor, setActiveColor] = useState("red");
  useEffect(() => {
    const saved = localStorage.getItem("csm_accent_theme");
    if (saved && THEMES.some((t) => t.id === saved)) {
      applyColor(saved);
    } else {
      applyColor("red");
    }
  }, []);

  const applyColor = (themeId: string) => {
    setActiveColor(themeId);
    localStorage.setItem("csm_accent_theme", themeId);

    const theme = THEMES.find((t) => t.id === themeId);
    if (!theme) return;

    let styleEl = document.getElementById("csm-theme-override") as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "csm-theme-override";
      document.head.appendChild(styleEl);
    }

    const isChiikawa = themeId === "chiikawa";
    const chiikawaCursorSvg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><circle cx='8' cy='8' r='4.5' fill='%23ffffff' stroke='%23333333' stroke-width='1.5'/><circle cx='24' cy='8' r='4.5' fill='%23ffffff' stroke='%23333333' stroke-width='1.5'/><circle cx='16' cy='18' r='12.5' fill='%23ffffff' stroke='%23333333' stroke-width='1.5'/><circle cx='11.5' cy='16' r='1.8' fill='%23333333'/><circle cx='20.5' cy='16' r='1.8' fill='%23333333'/><ellipse cx='8.5' cy='19' rx='2.5' ry='1.5' fill='%23f472b6'/><ellipse cx='23.5' cy='19' rx='2.5' ry='1.5' fill='%23f472b6'/><path d='M14 20.5 C15 22, 17 22, 18 20.5' fill='none' stroke='%23333333' stroke-width='1.5' stroke-linecap='round'/></svg>`;

    styleEl.innerHTML = `
      :root {
        --primary: ${theme.hsl} !important;
        --ring: ${theme.hsl} !important;
      }
      .bg-primary { background-color: ${theme.hex} !important; }
      .text-primary { color: ${theme.hex} !important; }
      .border-primary { border-color: ${theme.hex} !important; }

      ${
        isChiikawa
          ? `body, button, input, a, select { cursor: url("${chiikawaCursorSvg}") 16 16, auto !important; }`
          : ""
      }
    `;
  };


  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 py-1">
      <Palette className="size-3.5 text-muted-foreground mr-0.5" />
      {THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => applyColor(t.id)}
          className={`size-4 rounded-full transition-transform ${
            activeColor === t.id
              ? "scale-125 ring-2 ring-foreground ring-offset-1 ring-offset-background"
              : "opacity-70 hover:opacity-100"
          }`}
          style={{ backgroundColor: t.hex }}
          title={t.name}
        />
      ))}
      
    </div>
  );
}