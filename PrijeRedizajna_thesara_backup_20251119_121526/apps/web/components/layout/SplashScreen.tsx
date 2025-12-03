'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import styles from './SplashScreen.module.css';

const SplashScreen = () => {
  const [visible, setVisible] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem('hasSeenSplashScreen') === 'true') {
      setVisible(false);
      return;
    }
    setVisible(true);

    const mediaQuery = window.matchMedia('(orientation: portrait)');

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

  if (!visible) return null;

  return (
    <div className={styles.splashOverlay} onClick={handleClick}>
      {imageSrc && (
        <div className={styles.splashImageWrapper}>
          <Image
            src={imageSrc}
            alt="Thesara Splash Screen"
            width={1200}
            height={800}
            className={styles.splashImage}
            priority
          />
        </div>
      )}
    </div>
  );
};

export default SplashScreen;
