'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, ExternalLink, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '@/lib/api/notifications';
import type { NotificationDto, NotificationCategory } from '@techsprout/contracts';

function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function categoryBadge(category: NotificationCategory) {
  switch (category) {
    case 'TRANSACTIONAL':
      return <span className='rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800'>Order</span>;
    case 'ACADEMIC':
      return <span className='rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800'>Learning</span>;
    case 'SYSTEM':
      return <span className='rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-800'>System</span>;
    default:
      return null;
  }
}

export function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  // 1. Fetch unread count periodically
  const { data: countData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const unreadCount = countData?.unreadCount ?? 0;

  // 2. Fetch notifications list
  const {
    data: notificationsData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => fetchNotifications({ page: 1, limit: 10 }),
    enabled: isOpen,
    staleTime: 5000,
  });

  // 3. Mark single notification as read mutation
  const markReadMutation = useMutation({
    mutationFn: markNotificationAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // 4. Mark all as read mutation
  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleNotificationClick = async (notif: NotificationDto) => {
    if (!notif.isRead) {
      await markReadMutation.mutateAsync(notif.id);
    }
    if (notif.actionUrl) {
      setIsOpen(false);
      router.push(notif.actionUrl);
    }
  };

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await markAllReadMutation.mutateAsync();
  };

  const items = notificationsData?.items ?? [];

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          aria-label={`Notifications (${unreadCount} unread)`}
          className='relative flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary'
        >
          <Bell className='h-5 w-5' />
          {unreadCount > 0 && (
            <span className='absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow'>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align='end'
        className='w-[360px] p-0 shadow-xl rounded-xl border border-gray-200 bg-white sm:w-[400px]'
      >
        {/* Header */}
        <div className='flex items-center justify-between border-b border-gray-100 px-4 py-3'>
          <div className='flex items-center space-x-2'>
            <h3 className='text-sm font-semibold text-gray-900'>Notifications</h3>
            {unreadCount > 0 && (
              <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'>
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant='ghost'
              size='sm'
              disabled={markAllReadMutation.isPending}
              onClick={handleMarkAllRead}
              className='h-auto px-2 py-1 text-xs text-gray-600 hover:text-primary'
            >
              <CheckCheck className='mr-1 h-3.5 w-3.5' />
              Mark all as read
            </Button>
          )}
        </div>

        {/* Content list */}
        <div className='max-h-[380px] overflow-y-auto divide-y divide-gray-50'>
          {isLoading ? (
            <div className='flex items-center justify-center py-10 text-gray-400'>
              <Loader2 className='h-6 w-6 animate-spin' />
              <span className='ml-2 text-sm'>Loading notifications...</span>
            </div>
          ) : isError ? (
            <div className='p-6 text-center text-sm text-red-500'>
              Failed to load notifications. Please try again.
            </div>
          ) : items.length === 0 ? (
            <div className='p-8 text-center'>
              <Bell className='mx-auto h-8 w-8 text-gray-300' />
              <p className='mt-2 text-sm font-medium text-gray-900'>No notifications</p>
              <p className='mt-1 text-xs text-gray-500'>
                You are all caught up! Check back later for updates.
              </p>
            </div>
          ) : (
            items.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`group relative flex cursor-pointer items-start p-3.5 transition-colors hover:bg-gray-50 ${
                  !notif.isRead ? 'bg-sky-50/50' : 'bg-white'
                }`}
              >
                {/* Unread indicator dot */}
                <div className='mt-1.5 mr-2.5 flex-shrink-0'>
                  {!notif.isRead ? (
                    <div className='h-2 w-2 rounded-full bg-primary ring-2 ring-primary/20' />
                  ) : (
                    <div className='h-2 w-2 rounded-full bg-transparent' />
                  )}
                </div>

                {/* Notification body */}
                <div className='flex-1 min-w-0 pr-2'>
                  <div className='flex items-center space-x-1.5'>
                    {categoryBadge(notif.category)}
                    <p
                      className={`truncate text-xs font-semibold ${
                        !notif.isRead ? 'text-gray-900' : 'text-gray-700'
                      }`}
                    >
                      {notif.title}
                    </p>
                  </div>
                  <p className='mt-1 text-xs text-gray-600 line-clamp-2 leading-relaxed'>
                    {notif.message}
                  </p>
                  <div className='mt-1.5 flex items-center justify-between text-[11px] text-gray-400'>
                    <span>{formatRelativeTime(notif.createdAt)}</span>
                    {notif.actionUrl && (
                      <span className='flex items-center text-primary group-hover:underline'>
                        View <ExternalLink className='ml-0.5 h-3 w-3' />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
