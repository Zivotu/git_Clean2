import Image from 'next/image';
import Link from 'next/link';
import LogoLight from '../../../assets/Thesara_Logo.png';
import LogoDark from '../../../assets/Thesara_Logo_dark.png';
import { SITE_NAME } from '@/lib/config';

export default function Logo({ className = '', isDark = false }: { className?: string; isDark?: boolean }) {
  return (
    <Link href="/" className={`flex items-center ${className}`}>
      <Image
        src={isDark ? LogoDark : LogoLight}
        alt={`${SITE_NAME} logo`}
        width={500}
        height={237}
        style={{ color: 'transparent' }}
        className="h-12 w-auto rounded-xl object-contain"
        priority
      />
    </Link>
  );
}
