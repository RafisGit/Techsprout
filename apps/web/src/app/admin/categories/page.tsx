'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '@/lib/api/catalog';
import { useCurrentUser } from '@/lib/useCurrentUser';
import {
  FolderTree,
  Plus,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Search,
  Check,
  X,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import type { CategoryDto, CreateCategoryRequest, UpdateCategoryRequest } from '@techsprout/contracts';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function AdminCategoriesPage() {
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDto | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);

  // Errors / feedback
  const [formError, setFormError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch Categories
  const {
    data: categories = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: fetchAdminCategories,
    enabled: isAdmin,
  });

  const invalidateCategories = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
  };

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateCategoryRequest) => createCategory(data),
    onSuccess: () => {
      setSuccessBanner('Category created successfully.');
      setIsModalOpen(false);
      resetModalForm();
      invalidateCategories();
      setTimeout(() => setSuccessBanner(null), 4000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setFormError(resp?.message || err?.message || 'Failed to create category');
    },
  });

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCategoryRequest }) =>
      updateCategory(id, data),
    onSuccess: () => {
      setSuccessBanner('Category updated successfully.');
      setIsModalOpen(false);
      resetModalForm();
      invalidateCategories();
      setTimeout(() => setSuccessBanner(null), 4000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setFormError(resp?.message || err?.message || 'Failed to update category');
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      setDeleteError(null);
      setSuccessBanner('Category deleted successfully.');
      invalidateCategories();
      setTimeout(() => setSuccessBanner(null), 4000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      if (resp?.errorCode === 'CATEGORY_HAS_COURSES') {
        setDeleteError(
          'Cannot delete category: It contains associated courses. Please reassign or delete the courses first.'
        );
      } else {
        setDeleteError(resp?.message || err?.message || 'Failed to delete category');
      }
    },
  });

  // Toggle Active State directly
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateCategory(id, { isActive }),
    onSuccess: () => {
      invalidateCategories();
    },
    onError: (err: any) => {
      setDeleteError(err?.response?.data?.message || 'Failed to change category status');
    },
  });

  const resetModalForm = () => {
    setEditingCategory(null);
    setName('');
    setSlug('');
    setDescription('');
    setIsActive(true);
    setIsSlugManuallyEdited(false);
    setFormError(null);
  };

  const openCreateModal = () => {
    resetModalForm();
    setIsModalOpen(true);
  };

  const openEditModal = (cat: CategoryDto) => {
    resetModalForm();
    setEditingCategory(cat);
    setName(cat.name);
    setSlug(cat.slug);
    setDescription(cat.description || '');
    setIsActive(cat.isActive);
    setIsSlugManuallyEdited(true);
    setIsModalOpen(true);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isSlugManuallyEdited && !editingCategory) {
      setSlug(slugify(val));
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim() || name.length < 2) {
      setFormError('Category name must be at least 2 characters.');
      return;
    }

    if (editingCategory) {
      updateMutation.mutate({
        id: editingCategory.id,
        data: {
          name: name.trim(),
          slug: slug.trim() ? slugify(slug) : undefined,
          description: description.trim() || null,
          isActive,
        },
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        slug: slug.trim() ? slugify(slug) : undefined,
        description: description.trim() || undefined,
        isActive,
      });
    }
  };

  const handleDeleteCategory = (cat: CategoryDto) => {
    if (confirm(`Are you sure you want to delete category "${cat.name}"?`)) {
      setDeleteError(null);
      deleteMutation.mutate(cat.id);
    }
  };

  // Authorization Guard (Admin only)
  if (!isLoadingUser && !isAdmin) {
    return (
      <div className='max-w-2xl mx-auto p-8 bg-red-50 border border-red-200 text-red-800 rounded-2xl shadow-xs text-center'>
        <ShieldAlert className='w-12 h-12 text-red-600 mx-auto mb-3' />
        <h2 className='text-xl font-bold mb-1'>Administrator Access Required</h2>
        <p className='text-xs text-gray-600 mb-4'>
          Category taxonomy management is restricted to system administrators.
        </p>
      </div>
    );
  }

  // Filter categories
  const filteredCategories = categories.filter((cat) => {
    const matchesSearch =
      cat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cat.slug.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter =
      filterActive === 'all' ||
      (filterActive === 'active' && cat.isActive) ||
      (filterActive === 'inactive' && !cat.isActive);
    return matchesSearch && matchesFilter;
  });

  return (
    <div className='space-y-6'>
      {/* Top Banner */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div>
          <h1 className='text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight'>
            Category Management
          </h1>
          <p className='text-sm text-gray-500 mt-1'>
            Define, organize, and activate course categories across the institutional catalog.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className='inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition shadow-xs'
        >
          <Plus className='w-4 h-4' />
          <span>New Category</span>
        </button>
      </div>

      {successBanner && (
        <div className='p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between text-sm'>
          <div className='flex items-center space-x-2'>
            <CheckCircle2 className='w-4 h-4 text-emerald-600 shrink-0' />
            <span>{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className='text-xs font-semibold hover:underline'
          >
            Dismiss
          </button>
        </div>
      )}

      {deleteError && (
        <div className='p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center justify-between text-sm'>
          <div className='flex items-center space-x-2'>
            <AlertCircle className='w-4 h-4 text-red-500 shrink-0' />
            <span>{deleteError}</span>
          </div>
          <button
            onClick={() => setDeleteError(null)}
            className='text-xs font-semibold hover:underline'
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className='bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
        <div className='relative flex-1 max-w-md'>
          <Search className='w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400' />
          <input
            type='text'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder='Search categories by name or slug...'
            className='w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
          />
        </div>

        <div className='flex items-center space-x-2'>
          <button
            onClick={() => setFilterActive('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filterActive === 'all'
                ? 'bg-primary text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            All ({categories.length})
          </button>
          <button
            onClick={() => setFilterActive('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filterActive === 'active'
                ? 'bg-emerald-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Active ({categories.filter((c) => c.isActive).length})
          </button>
          <button
            onClick={() => setFilterActive('inactive')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filterActive === 'inactive'
                ? 'bg-gray-700 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Inactive ({categories.filter((c) => !c.isActive).length})
          </button>
        </div>
      </div>

      {/* Categories Table */}
      <div className='bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden'>
        {isLoading ? (
          <div className='p-12 text-center'>
            <Loader2 className='w-8 h-8 text-primary animate-spin mx-auto mb-3' />
            <p className='text-sm text-gray-500'>Loading categories from API...</p>
          </div>
        ) : isError ? (
          <div className='p-12 text-center max-w-md mx-auto'>
            <AlertCircle className='w-10 h-10 text-red-500 mx-auto mb-3' />
            <h3 className='text-base font-semibold text-gray-900 mb-1'>Failed to load categories</h3>
            <p className='text-xs text-gray-500 mb-4'>
              {(error as any)?.response?.data?.message || 'Network error'}
            </p>
            <button
              onClick={() => refetch()}
              className='px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition'
            >
              Retry
            </button>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className='p-12 text-center max-w-md mx-auto'>
            <div className='w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400'>
              <FolderTree className='w-6 h-6' />
            </div>
            <h3 className='text-base font-semibold text-gray-900 mb-1'>No categories found</h3>
            <p className='text-xs text-gray-500 mb-4'>
              {searchTerm
                ? 'No categories matched your search term.'
                : 'Create your first category to start organizing courses.'}
            </p>
            <button
              onClick={openCreateModal}
              className='inline-flex items-center space-x-1.5 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition'
            >
              <Plus className='w-3.5 h-3.5' />
              <span>New Category</span>
            </button>
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-sm text-gray-600'>
              <thead className='bg-gray-50/80 text-xs font-semibold text-gray-700 uppercase border-b border-gray-200'>
                <tr>
                  <th scope='col' className='px-4 py-3.5'>Name</th>
                  <th scope='col' className='px-4 py-3.5'>Slug</th>
                  <th scope='col' className='px-4 py-3.5'>Description</th>
                  <th scope='col' className='px-4 py-3.5'>Status</th>
                  <th scope='col' className='px-4 py-3.5 text-right'>Actions</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {filteredCategories.map((cat) => (
                  <tr key={cat.id} className='hover:bg-gray-50/60 transition-colors'>
                    <td className='px-4 py-3.5 whitespace-nowrap'>
                      <span className='font-semibold text-gray-900'>{cat.name}</span>
                    </td>

                    <td className='px-4 py-3.5 whitespace-nowrap font-mono text-xs text-gray-500'>
                      /{cat.slug}
                    </td>

                    <td className='px-4 py-3.5 max-w-xs truncate text-xs text-gray-500'>
                      {cat.description || '—'}
                    </td>

                    <td className='px-4 py-3.5 whitespace-nowrap'>
                      <button
                        onClick={() =>
                          toggleActiveMutation.mutate({ id: cat.id, isActive: !cat.isActive })
                        }
                        title='Click to toggle status'
                        className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                          cat.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${cat.isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        <span>{cat.isActive ? 'Active' : 'Inactive'}</span>
                      </button>
                    </td>

                    <td className='px-4 py-3.5 text-right whitespace-nowrap'>
                      <div className='flex items-center justify-end space-x-2'>
                        <button
                          onClick={() => openEditModal(cat)}
                          className='p-1.5 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-lg transition'
                          title='Edit Category'
                        >
                          <Edit2 className='w-4 h-4' />
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(cat)}
                          disabled={deleteMutation.isPending}
                          className='p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition'
                          title='Delete Category'
                        >
                          <Trash2 className='w-4 h-4' />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal for Create / Edit */}
      {isModalOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4'>
          <div className='bg-white w-full max-w-lg rounded-2xl shadow-xl border border-gray-200 p-6 space-y-4 animate-in fade-in zoom-in-95'>
            <div className='flex items-center justify-between border-b border-gray-100 pb-3'>
              <h3 className='text-lg font-bold text-gray-900'>
                {editingCategory ? 'Edit Category' : 'Create New Category'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className='text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100'
              >
                <X className='w-5 h-5' />
              </button>
            </div>

            {formError && (
              <div className='p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center space-x-2'>
                <AlertCircle className='w-4 h-4 shrink-0' />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className='space-y-4'>
              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1'>
                  Category Name <span className='text-red-500'>*</span>
                </label>
                <input
                  type='text'
                  required
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder='e.g. Web Development'
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                />
              </div>

              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1'>
                  URL Slug <span className='text-red-500'>*</span>
                </label>
                <div className='flex rounded-xl shadow-xs'>
                  <span className='inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-xs font-mono'>
                    /
                  </span>
                  <input
                    type='text'
                    required
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setIsSlugManuallyEdited(true);
                    }}
                    placeholder='web-development'
                    className='flex-1 block w-full px-3.5 py-2 rounded-none rounded-r-xl border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>
              </div>

              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1'>
                  Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder='Brief description of topics covered under this category...'
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                />
              </div>

              <div className='flex items-center space-x-2 pt-1'>
                <input
                  type='checkbox'
                  id='isActive'
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className='w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary'
                />
                <label htmlFor='isActive' className='text-xs font-semibold text-gray-700'>
                  Category is Active (Visible for course tagging)
                </label>
              </div>

              <div className='flex items-center justify-end space-x-2 pt-3 border-t border-gray-100'>
                <button
                  type='button'
                  onClick={() => setIsModalOpen(false)}
                  className='px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition'
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className='px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl transition shadow-xs disabled:opacity-50'
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingCategory
                    ? 'Save Changes'
                    : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
