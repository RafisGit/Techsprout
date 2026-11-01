'use client';

import Register from '@/components/forms/Register';
import Hero from '@/components/Hero';
import { useTranslation } from '@/i18n';

export default function RegisterPage() {
  const { t } = useTranslation();

  return (
    <>
      <Hero pageName={t('auth.createAccountTitle')} />
      <Register />
    </>
  );
}
