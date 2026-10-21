'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchDiscussions,
  fetchDiscussion,
  createDiscussion,
  updateDiscussion,
  deleteDiscussion,
  toggleDiscussionVote,
  createDiscussionReply,
  toggleReplyVote,
  deleteDiscussionReply,
} from '@/lib/api/discussions';
import { SafeMarkdown } from './SafeMarkdown';
import { Button } from '@/components/ui/button';
import {
  MessageSquare,
  ThumbsUp,
  Pin,
  CheckCircle,
  CornerDownRight,
  Send,
  MoreVertical,
  Trash2,
  ShieldAlert,
  GraduationCap,
  Sparkles,
  HelpCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { DiscussionDto, DiscussionReplyDto } from '@techsprout/contracts';

interface LessonDiscussionsProps {
  courseId: string;
  lessonId: string;
  currentUserId?: string;
  isInstructor?: boolean;
  isAdmin?: boolean;
}

export function LessonDiscussions({
  courseId,
  lessonId,
  currentUserId,
  isInstructor,
  isAdmin,
}: LessonDiscussionsProps) {
  const queryClient = useQueryClient();
  const [activeSort, setActiveSort] = useState<'recent' | 'upvoted' | 'unanswered'>('recent');
  const [isAsking, setIsAsking] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [expandedDiscussionId, setExpandedDiscussionId] = useState<string | null>(null);
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({});
  const [replyToParentId, setReplyToParentId] = useState<string | null>(null);

  // 1. Fetch Discussions List
  const {
    data: discussionsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['discussions', courseId, lessonId, activeSort],
    queryFn: () => fetchDiscussions(courseId, lessonId, { sort: activeSort, limit: 30 }),
    enabled: !!courseId && !!lessonId,
  });

  // 2. Fetch Active Thread Details when expanded
  const { data: activeThreadData, isLoading: isThreadLoading } = useQuery({
    queryKey: ['discussionDetail', courseId, lessonId, expandedDiscussionId],
    queryFn: () => fetchDiscussion(courseId, lessonId, expandedDiscussionId!),
    enabled: !!expandedDiscussionId,
  });

  // 3. Create Discussion Mutation
  const createMutation = useMutation({
    mutationFn: () => createDiscussion(courseId, lessonId, { title: newTitle, content: newContent }),
    onSuccess: () => {
      setNewTitle('');
      setNewContent('');
      setIsAsking(false);
      queryClient.invalidateQueries({ queryKey: ['discussions', courseId, lessonId] });
    },
  });

  // 4. Toggle Discussion Vote Mutation
  const voteDiscussionMutation = useMutation({
    mutationFn: (discussionId: string) => toggleDiscussionVote(courseId, lessonId, discussionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions', courseId, lessonId] });
      if (expandedDiscussionId) {
        queryClient.invalidateQueries({
          queryKey: ['discussionDetail', courseId, lessonId, expandedDiscussionId],
        });
      }
    },
  });

  // 5. Create Reply Mutation
  const replyMutation = useMutation({
    mutationFn: ({ discussionId, content, parentReplyId }: { discussionId: string; content: string; parentReplyId?: string | null }) =>
      createDiscussionReply(courseId, lessonId, discussionId, { content, parentReplyId }),
    onSuccess: (_, vars) => {
      setReplyTextMap((prev) => ({ ...prev, [vars.discussionId]: '' }));
      setReplyToParentId(null);
      queryClient.invalidateQueries({
        queryKey: ['discussionDetail', courseId, lessonId, vars.discussionId],
      });
      queryClient.invalidateQueries({ queryKey: ['discussions', courseId, lessonId] });
    },
  });

  // 6. Toggle Reply Vote Mutation
  const voteReplyMutation = useMutation({
    mutationFn: ({ discussionId, replyId }: { discussionId: string; replyId: string }) =>
      toggleReplyVote(courseId, lessonId, discussionId, replyId),
    onSuccess: () => {
      if (expandedDiscussionId) {
        queryClient.invalidateQueries({
          queryKey: ['discussionDetail', courseId, lessonId, expandedDiscussionId],
        });
      }
    },
  });

  // 7. Moderate Discussion (Pin / Status / Delete)
  const moderateMutation = useMutation({
    mutationFn: async ({
      discussionId,
      updates,
    }: {
      discussionId: string;
      updates: { isPinned?: boolean; status?: 'ACTIVE' | 'RESOLVED' | 'HIDDEN' | 'DELETED' };
    }) => {
      if (updates.status === 'DELETED') {
        return deleteDiscussion(courseId, lessonId, discussionId);
      }
      return updateDiscussion(courseId, lessonId, discussionId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions', courseId, lessonId] });
      if (expandedDiscussionId) {
        queryClient.invalidateQueries({
          queryKey: ['discussionDetail', courseId, lessonId, expandedDiscussionId],
        });
      }
    },
  });

  const handlePostDiscussion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    createMutation.mutate();
  };

  const handlePostReply = (discussionId: string) => {
    const text = replyTextMap[discussionId];
    if (!text || !text.trim()) return;
    replyMutation.mutate({
      discussionId,
      content: text.trim(),
      parentReplyId: replyToParentId,
    });
  };

  return (
    <div className='bg-white rounded-3xl border border-gray-200/80 p-6 sm:p-8 shadow-xs space-y-6'>
      {/* Header & Controls */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100'>
        <div>
          <div className='flex items-center gap-2'>
            <MessageSquare className='w-5 h-5 text-primary' />
            <h3 className='text-base sm:text-lg font-bold text-gray-900'>Lesson Discussions & Q&A</h3>
          </div>
          <p className='text-xs text-gray-500 mt-1'>
            Ask questions, collaborate with peers, and get direct guidance from instructors.
          </p>
        </div>

        <Button
          onClick={() => setIsAsking(!isAsking)}
          variant={isAsking ? 'outline' : 'default'}
          className='rounded-xl text-xs font-semibold px-4 py-2 bg-primary text-white hover:bg-primary/90'
        >
          {isAsking ? 'Cancel' : 'Ask a Question'}
        </Button>
      </div>

      {/* New Question Form */}
      {isAsking && (
        <form
          onSubmit={handlePostDiscussion}
          className='bg-gray-50/80 rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-4 animate-in fade-in duration-200'
        >
          <div className='flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wider'>
            <HelpCircle className='w-4 h-4 text-primary' />
            <span>Start a New Thread</span>
          </div>

          <div className='space-y-1.5'>
            <label className='text-xs font-semibold text-gray-700'>Topic / Question Summary</label>
            <input
              type='text'
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder='e.g., Why do we use useCallback here instead of useMemo?'
              maxLength={255}
              required
              className='w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
            />
          </div>

          <div className='space-y-1.5'>
            <label className='text-xs font-semibold text-gray-700'>Details & Context (Markdown supported)</label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={4}
              placeholder='Describe what you tried, share relevant snippets, or explain what is unclear...'
              maxLength={10000}
              required
              className='w-full rounded-xl border border-gray-200 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
            />
          </div>

          {createMutation.isError && (
            <div className='p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2'>
              <AlertCircle className='w-4 h-4 shrink-0' />
              <span>{(createMutation.error as any)?.response?.data?.message || 'Failed to submit discussion.'}</span>
            </div>
          )}

          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='ghost'
              onClick={() => setIsAsking(false)}
              className='rounded-xl text-xs font-semibold'
            >
              Cancel
            </Button>
            <Button
              type='submit'
              disabled={createMutation.isPending || !newTitle.trim() || !newContent.trim()}
              className='rounded-xl text-xs font-semibold px-4 py-2 bg-primary text-white hover:bg-primary/90'
            >
              {createMutation.isPending ? <Loader2 className='w-4 h-4 animate-spin' /> : 'Post Question'}
            </Button>
          </div>
        </form>
      )}

      {/* Filter and Sorting Tabs */}
      <div className='flex items-center gap-2 border-b border-gray-100 pb-2 text-xs'>
        <button
          onClick={() => setActiveSort('recent')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
            activeSort === 'recent'
              ? 'bg-primary/10 text-primary font-bold'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          Recent
        </button>
        <button
          onClick={() => setActiveSort('upvoted')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
            activeSort === 'upvoted'
              ? 'bg-primary/10 text-primary font-bold'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          Most Upvoted
        </button>
        <button
          onClick={() => setActiveSort('unanswered')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
            activeSort === 'unanswered'
              ? 'bg-primary/10 text-primary font-bold'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          Unanswered
        </button>
      </div>

      {/* Loading & Error States */}
      {isLoading && (
        <div className='py-12 flex flex-col items-center justify-center space-y-3 text-gray-400'>
          <Loader2 className='w-6 h-6 animate-spin text-primary' />
          <p className='text-xs font-medium'>Loading lesson discussions...</p>
        </div>
      )}

      {isError && (
        <div className='p-6 text-center space-y-3 bg-red-50/50 rounded-2xl border border-red-100'>
          <AlertCircle className='w-6 h-6 text-red-500 mx-auto' />
          <p className='text-xs font-semibold text-red-800'>Failed to load discussions.</p>
          <Button onClick={() => refetch()} variant='outline' size='sm' className='rounded-xl text-xs'>
            Retry
          </Button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && discussionsData?.data?.length === 0 && (
        <div className='py-12 text-center space-y-3 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200'>
          <MessageSquare className='w-8 h-8 text-gray-300 mx-auto' />
          <p className='text-sm font-semibold text-gray-700'>No discussions yet for this lesson</p>
          <p className='text-xs text-gray-400 max-w-sm mx-auto'>
            Have questions about the material or code samples? Start the conversation!
          </p>
          <Button
            onClick={() => setIsAsking(true)}
            variant='outline'
            size='sm'
            className='rounded-xl text-xs font-bold text-primary border-primary/20 hover:bg-primary/5'
          >
            Ask the First Question
          </Button>
        </div>
      )}

      {/* Discussion List */}
      <div className='space-y-4'>
        {discussionsData?.data?.map((item) => {
          const isExpanded = expandedDiscussionId === item.id;
          const isAuthor = item.userId === currentUserId;
          const canModerate = isInstructor || isAdmin;

          return (
            <div
              key={item.id}
              className={`rounded-2xl border transition-all ${
                item.isPinned
                  ? 'border-amber-200 bg-amber-50/20 shadow-xs'
                  : 'border-gray-200/90 bg-white hover:border-gray-300'
              }`}
            >
              {/* Card Header */}
              <div className='p-4 sm:p-5 space-y-3'>
                {item.isPinned && (
                  <div className='inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800'>
                    <Pin className='w-3 h-3 text-amber-600' />
                    <span>PINNED BY INSTRUCTOR</span>
                  </div>
                )}

                <div className='flex items-start justify-between gap-3'>
                  <div className='space-y-1.5 flex-1'>
                    <div className='flex items-center flex-wrap gap-2 text-xs'>
                      <span className='font-bold text-gray-900'>{item.userName}</span>

                      {/* Instructor Badge */}
                      {item.isCourseInstructor && (
                        <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-primary/10 text-primary border border-primary/20'>
                          <GraduationCap className='w-3 h-3' />
                          <span>Instructor</span>
                        </span>
                      )}

                      {/* Admin Badge */}
                      {item.isAdmin && !item.isCourseInstructor && (
                        <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800'>
                          <ShieldAlert className='w-3 h-3' />
                          <span>Admin</span>
                        </span>
                      )}

                      {item.status === 'RESOLVED' && (
                        <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800'>
                          <CheckCircle className='w-3 h-3 text-emerald-600' />
                          <span>Resolved</span>
                        </span>
                      )}

                      <span className='text-gray-400'>•</span>
                      <span className='text-gray-400'>{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>

                    <h4 className='text-sm sm:text-base font-bold text-gray-900 leading-snug'>
                      {item.title}
                    </h4>
                  </div>

                  {/* Actions & Moderation Dropdown */}
                  {canModerate && (
                    <div className='flex items-center gap-1'>
                      <Button
                        size='sm'
                        variant='ghost'
                        title={item.isPinned ? 'Unpin' : 'Pin to top'}
                        onClick={() =>
                          moderateMutation.mutate({
                            discussionId: item.id,
                            updates: { isPinned: !item.isPinned },
                          })
                        }
                        className='h-7 w-7 p-0 text-gray-400 hover:text-amber-600'
                      >
                        <Pin className='w-3.5 h-3.5' />
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        title='Mark Resolved'
                        onClick={() =>
                          moderateMutation.mutate({
                            discussionId: item.id,
                            updates: { status: item.status === 'RESOLVED' ? 'ACTIVE' : 'RESOLVED' },
                          })
                        }
                        className='h-7 w-7 p-0 text-gray-400 hover:text-emerald-600'
                      >
                        <CheckCircle className='w-3.5 h-3.5' />
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        title='Delete Thread'
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this thread?')) {
                            moderateMutation.mutate({
                              discussionId: item.id,
                              updates: { status: 'DELETED' },
                            });
                          }
                        }}
                        className='h-7 w-7 p-0 text-gray-400 hover:text-red-600'
                      >
                        <Trash2 className='w-3.5 h-3.5' />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Question Body */}
                <SafeMarkdown content={item.content} className='text-xs sm:text-sm text-gray-700' />

                {/* Bottom Bar: Votes and Reply Trigger */}
                <div className='flex items-center gap-3 pt-2 text-xs'>
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={() => voteDiscussionMutation.mutate(item.id)}
                    className={`h-8 px-2.5 rounded-lg border flex items-center gap-1.5 transition-all ${
                      item.hasUpvoted
                        ? 'border-primary/30 bg-primary/10 text-primary font-bold'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <ThumbsUp className={`w-3.5 h-3.5 ${item.hasUpvoted ? 'fill-current' : ''}`} />
                    <span>{item.upvoteCount}</span>
                  </Button>

                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={() => setExpandedDiscussionId(isExpanded ? null : item.id)}
                    className='h-8 px-3 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1.5'
                  >
                    <MessageSquare className='w-3.5 h-3.5 text-gray-500' />
                    <span>{item.replyCount} {item.replyCount === 1 ? 'Reply' : 'Replies'}</span>
                  </Button>
                </div>
              </div>

              {/* Threaded Replies Section */}
              {isExpanded && (
                <div className='border-t border-gray-100 bg-gray-50/60 p-4 sm:p-5 space-y-4 rounded-b-2xl animate-in fade-in duration-150'>
                  <div className='text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5'>
                    <CornerDownRight className='w-3.5 h-3.5 text-primary' />
                    <span>Replies ({activeThreadData?.replies?.length || 0})</span>
                  </div>

                  {isThreadLoading && (
                    <div className='py-4 text-center text-xs text-gray-400 flex items-center justify-center gap-2'>
                      <Loader2 className='w-4 h-4 animate-spin text-primary' />
                      <span>Loading conversation...</span>
                    </div>
                  )}

                  {/* Render Thread Replies */}
                  <div className='space-y-3'>
                    {activeThreadData?.replies?.map((rep) => (
                      <div
                        key={rep.id}
                        className='bg-white rounded-xl border border-gray-200/80 p-3.5 space-y-2'
                      >
                        <div className='flex items-center justify-between gap-2 text-xs'>
                          <div className='flex items-center gap-2'>
                            <span className='font-bold text-gray-900'>{rep.userName}</span>
                            {rep.isCourseInstructor && (
                              <span className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-primary/10 text-primary'>
                                <GraduationCap className='w-2.5 h-2.5' />
                                <span>Instructor</span>
                              </span>
                            )}
                            <span className='text-gray-400'>•</span>
                            <span className='text-gray-400'>{new Date(rep.createdAt).toLocaleDateString()}</span>
                          </div>

                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() =>
                              voteReplyMutation.mutate({ discussionId: item.id, replyId: rep.id })
                            }
                            className={`h-6 px-2 rounded text-[11px] flex items-center gap-1 ${
                              rep.hasUpvoted ? 'text-primary font-bold bg-primary/5' : 'text-gray-400 hover:text-gray-700'
                            }`}
                          >
                            <ThumbsUp className={`w-3 h-3 ${rep.hasUpvoted ? 'fill-current' : ''}`} />
                            <span>{rep.upvoteCount}</span>
                          </Button>
                        </div>

                        <SafeMarkdown content={rep.content} className='text-xs text-gray-700' />

                        {/* Nested Sub-Replies */}
                        {rep.replies && rep.replies.length > 0 && (
                          <div className='pl-4 border-l-2 border-primary/20 space-y-2 pt-2 mt-2'>
                            {rep.replies.map((sub) => (
                              <div key={sub.id} className='bg-gray-50 rounded-lg p-2.5 space-y-1 text-xs'>
                                <div className='flex items-center gap-2'>
                                  <span className='font-bold text-gray-800'>{sub.userName}</span>
                                  {sub.isCourseInstructor && (
                                    <span className='text-[9px] font-bold text-primary'>[Instructor]</span>
                                  )}
                                  <span className='text-gray-400 text-[10px]'>{new Date(sub.createdAt).toLocaleDateString()}</span>
                                </div>
                                <SafeMarkdown content={sub.content} className='text-xs text-gray-600' />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Reply Input Box */}
                  <div className='flex items-center gap-2 pt-2'>
                    <input
                      type='text'
                      value={replyTextMap[item.id] || ''}
                      onChange={(e) =>
                        setReplyTextMap((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handlePostReply(item.id);
                        }
                      }}
                      placeholder='Write a reply... (Press Enter to post)'
                      className='flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
                    />
                    <Button
                      onClick={() => handlePostReply(item.id)}
                      disabled={replyMutation.isPending || !replyTextMap[item.id]?.trim()}
                      size='sm'
                      className='rounded-xl h-8 px-3 bg-primary text-white hover:bg-primary/90 text-xs'
                    >
                      {replyMutation.isPending ? (
                        <Loader2 className='w-3.5 h-3.5 animate-spin' />
                      ) : (
                        <Send className='w-3.5 h-3.5' />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
