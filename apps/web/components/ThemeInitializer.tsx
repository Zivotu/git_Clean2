'use client';

import { useEffect } from 'react';

export function ThemeInitializer() {
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    let initialTheme = 'light'; // Default to light

    if (savedTheme) {
      initialTheme = savedTheme;
    } else if (prefersDark) {
      initialTheme = 'dark';
    }

    if (initialTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return null;
}
