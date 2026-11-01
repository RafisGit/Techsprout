import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'Verify Certificate | TechSprout Academy',
  description: 'Official academic registry credential verification for TechSprout Academy.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function VerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

