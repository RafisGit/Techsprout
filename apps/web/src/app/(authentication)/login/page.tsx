'use client';

import Login from '@/components/forms/Login';
import Hero from '@/components/Hero';
import { useTranslation } from '@/i18n';

export default function LoginPage() {
  const { t } = useTranslation();

  return (
    <>
      <Hero pageName={t('actions.login')} />
      <Login />
    </>
  );
}
