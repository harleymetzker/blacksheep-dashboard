import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

type Ctx = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  // carrega do storage depois que o browser existe
  useEffect(() => {
    try {
      const stored = localStorage.getItem("theme") as Theme | null;
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {}
  }, []);

  // aplica classe no <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");

    try {
      localStorage.setItem("theme", theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
