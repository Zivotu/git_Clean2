"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import AdminAccessTrigger from '@/components/AdminAccessTrigger';
import { useI18n } from '@/lib/i18n-provider';
import PartnershipModal from '@/components/PartnershipModal';

type FooterProps = {
  isDark?: boolean;
};

export default function Footer({
  isDark = false,
}: FooterProps) {
  const { messages } = useI18n();
  const [showPartnership, setShowPartnership] = useState(false);

  const tFooter = (key: string) => messages[`Footer.${key}`] || key;
  const tNav = (key: string) => messages[`Nav.${key}`] || key;

  return (
    <>
      <footer className={`mt-12 border-t ${isDark ? 'border-[#27272A] bg-[#0B0B10]' : 'border-slate-200 bg-white'}`}>
        <div className="relative mx-auto max-w-7xl px-4 py-12 text-sm text-gray-500">
          <div className="flex flex-col md:flex-row justify-between gap-8">
            <div>
              <Logo isDark={isDark} className="mb-4 h-8 w-auto" />
              <p className={isDark ? 'text-zinc-300' : 'text-gray-600'}>{tFooter('slogan')}</p>

              <div className="flex gap-4 mt-6">
                <a
                  href="https://www.tiktok.com/@thesara_repository?is_from_webapp=1&sender_device=pc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:scale-110 transition-transform"
                >
                  <img
                    src={isDark ? '/socials/tiktok_b.png' : '/socials/tiktok_w.png'}
                    alt="TikTok"
                    className="w-[47px] h-14 opacity-80 hover:opacity-100 transition-opacity"
                  />
                </a>
                <a
                  href="https://x.com/THESARA_SPACE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:scale-110 transition-transform"
                >
                  <img
                    src={isDark ? '/socials/x_b.png' : '/socials/x_w.png'}
                    alt="X"
                    className="w-[47px] h-14 opacity-80 hover:opacity-100 transition-opacity"
                  />
                </a>
                <a
                  href="https://www.linkedin.com/company/thesara-repository/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:scale-110 transition-transform"
                >
                  <img
                    src={isDark ? '/socials/linkedin_b.png' : '/socials/linkedin_w.png'}
                    alt="LinkedIn"
                    className="w-[47px] h-14 opacity-80 hover:opacity-100 transition-opacity"
                  />
                </a>
                <a
                  href="https://www.instagram.com/thesara.space/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:scale-110 transition-transform"
                >
                  <img
                    src={isDark ? '/socials/insta_b.png' : '/socials/insta_w.png'}
                    alt="Instagram"
                    className="w-[47px] h-14 opacity-80 hover:opacity-100 transition-opacity"
                  />
                </a>
              </div>
            </div>
            <div className="flex gap-12">
              <div>
                <h4 className={`font-medium mb-3 ${isDark ? 'text-zinc-200' : 'text-gray-900'}`}>{tNav('platform')}</h4>
                <ul className="space-y-2">
                  <li>
                    <Link href="/create" className="hover:text-emerald-600 transition">
                      {tNav('publishApp')}
                    </Link>
                  </li>
                  <li>
                    <Link href="/my" className="hover:text-emerald-600 transition">
                      {tNav('myProjects')}
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className={`font-medium mb-3 ${isDark ? 'text-zinc-200' : 'text-gray-900'}`}>{tNav('resources')}</h4>
                <ul className="space-y-2">
                  <li>
                    <Link href="/faq" className="hover:text-emerald-600 transition">
                      {tNav('faq')}
                    </Link>
                  </li>
                  <li>
                    <a href="/docs" className="hover:text-emerald-600 transition">
                      {tNav('docs')}
                    </a>
                  </li>
                  <li>
                    <a href="/ThesaraMediaBundle.7z" className="hover:text-emerald-600 transition" download>
                      Thesara Media Bundle
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className={`font-medium mb-3 ${isDark ? 'text-zinc-200' : 'text-gray-900'}`}>{tNav('company')}</h4>
                <ul className="space-y-2">
                  <li>
                    <Link href="/about" prefetch={false} className="hover:text-emerald-600 transition">
                      {tNav('about')}
                    </Link>
                  </li>
                  <li>
                    <Link href="/docs/thesara_terms.html" prefetch={false} className="hover:text-emerald-600 transition">
                      {tNav('terms')}
                    </Link>
                  </li>
                  <li>
                    <Link href="/privacy" prefetch={false} className="hover:text-emerald-600 transition">
                      {tNav('privacy')}
                    </Link>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => setShowPartnership(true)}
                      className="hover:text-emerald-600 transition"
                    >
                      {tFooter('partnershipLink') || 'Partnerships'}
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t text-center text-xs text-gray-500">
            &copy; 2025 Thesara. {tFooter('allRights')}
          </div>
          <AdminAccessTrigger className="absolute bottom-6 right-4 md:right-0" />
        </div>
      </footer>
      <PartnershipModal open={showPartnership} onClose={() => setShowPartnership(false)} />
    </>
  );
}
