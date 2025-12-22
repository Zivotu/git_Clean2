'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import styles from './SplashScreen.module.css';

const SplashScreen = () => {
  const [visible, setVisible] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => {
    // Check if user has seen the splash screen (optional: change key to reset for new campaign)
    // For now keeping the same key as requested, but we can update to 'hasSeenSplashScreen_v2' if needed.
    if (localStorage.getItem('hasSeenWorkshopSplash') === 'true') {
      setVisible(false);
      return;
    }

    const handleResize = () => {
      if (window.innerWidth < 768) {
        setImageSrc('/assets/WorkShop_1_vert.jpg');
      } else {
        setImageSrc('/assets/WorkShop_1_horiz.jpg');
      }
    };

    // Initial check
    handleResize();

    setVisible(true);

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleClick = () => {
    localStorage.setItem('hasSeenWorkshopSplash', 'true');
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
