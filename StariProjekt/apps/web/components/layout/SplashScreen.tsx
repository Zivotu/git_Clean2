'use client';

import React, { useState, useEffect } from 'react';
import styles from './SplashScreen.module.css';

const SplashScreen = () => {
  const [visible, setVisible] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null); // Initial state is null

  useEffect(() => {
    if (localStorage.getItem('hasSeenSplashScreen') === 'true') {
      setVisible(false);
      return;
    }
    setVisible(true);

    const mediaQuery = window.matchMedia("(orientation: portrait)");

    const updateImage = () => {
      if (mediaQuery.matches) {
        setImageSrc('/assets/ThesaraSplash_Web_vert_1a.jpg');
      } else {
        setImageSrc('/assets/ThesaraSplash_Web_1.jpg');
      }
    };

    updateImage();

    mediaQuery.addEventListener('change', updateImage);
    return () => mediaQuery.removeEventListener('change', updateImage);
  }, []);

  const handleClick = () => {
    localStorage.setItem('hasSeenSplashScreen', 'true');
    setVisible(false);
  };

  if (!visible) {
    return null;
  }

  return (
    <div className={styles.splashOverlay} onClick={handleClick}>
      {imageSrc && ( // Only render the image if the src is set
        <img
          src={imageSrc}
          alt="Thesara Splash Screen"
          className={styles.splashImage}
        />
      )}
    </div>
  );
};

export default SplashScreen;
