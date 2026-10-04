'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ShoppingCart, RefreshCw } from 'lucide-react';

export function FinanceSubNav() {
  const pathname = usePathname();

  const links = [
    {
      title: 'Finance Overview',
      href: '/admin/finance',
      icon: LayoutDashboard,
      exact: true,
    },
    {
      title: 'Orders Explorer',
      href: '/admin/finance/orders',
      icon: ShoppingCart,
      exact: false,
    },
    {
      title: 'Reconciliation & Refunds',
      href: '/admin/finance/reconciliation',
      icon: RefreshCw,
      exact: false,
    },
  ];

  return (
    <div className='flex items-center space-x-2 border-b border-gray-200 pb-3 mb-6 overflow-x-auto'>
      {links.map((link) => {
        const Icon = link.icon;
        const isActive = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
              isActive
                ? 'bg-primary text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Icon className='w-4 h-4' />
            <span>{link.title}</span>
          </Link>
        );
      })}
    </div>
  );
}
