'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

type ThemeContextType = {
  isDark: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  const applyTheme = useCallback((dark: boolean) => {
    if (dark) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    let initialIsDark = false; // Default to light

    if (savedTheme === 'dark') {
      initialIsDark = true;
    } else if (savedTheme === 'light') {
      initialIsDark = false;
    } else if (prefersDark) {
      initialIsDark = true;
    }

    setIsDark(initialIsDark);
    applyTheme(initialIsDark);
  }, [applyTheme]);

  const toggleTheme = useCallback(() => {
    setIsDark((prevIsDark) => {
      const newIsDark = !prevIsDark;
      localStorage.setItem('theme', newIsDark ? 'dark' : 'light');
      applyTheme(newIsDark);
      return newIsDark;
    });
  }, [applyTheme]);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
