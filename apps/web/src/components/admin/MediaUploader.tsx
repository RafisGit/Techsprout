'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  UploadCloud,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileVideo,
  Image as ImageIcon,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadImageMedia, uploadVideoMedia, type MediaUploadResult } from '@/lib/api/catalog';

export interface MediaUploaderProps {
  type?: 'image' | 'video';
  mediaType?: 'IMAGE' | 'VIDEO' | 'image' | 'video';
  folder?: string;
  currentUrl?: string | null;
  currentMediaId?: string | null;
  initialPublicUrl?: string | null;
  initialMediaId?: string | null;
  onMediaSelect?: (media: { id: string; url: string; publicId: string } | null) => void;
  onUploaded?: (asset: { id: string; secureUrl: string; publicId: string }) => void;
  onRemoved?: () => void;
  label?: string;
  helperText?: string;
}

export function MediaUploader({
  type,
  mediaType,
  folder,
  currentUrl,
  currentMediaId,
  initialPublicUrl,
  initialMediaId,
  onMediaSelect,
  onUploaded,
  onRemoved,
  label,
  helperText,
}: MediaUploaderProps) {
  const resolvedType = (mediaType || type || 'image').toLowerCase() as 'image' | 'video';
  const effectiveInitialUrl = initialPublicUrl !== undefined ? initialPublicUrl : currentUrl || null;

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(effectiveInitialUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreviewUrl(effectiveInitialUrl);
  }, [effectiveInitialUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsUploading(true);

    try {
      let result: MediaUploadResult;
      if (resolvedType === 'image') {
        if (!file.type.startsWith('image/')) {
          throw new Error('Please select a valid image file (JPEG, PNG, WebP)');
        }
        result = await uploadImageMedia(file, folder || 'techsprout/images/courses');
      } else {
        if (!file.type.startsWith('video/')) {
          throw new Error('Please select a valid video file (MP4, WebM)');
        }
        result = await uploadVideoMedia(file, folder || 'techsprout/videos/lessons');
      }

      setPreviewUrl(result.secureUrl);

      if (onMediaSelect) {
        onMediaSelect({
          id: result.id,
          url: result.secureUrl,
          publicId: result.publicId,
        });
      }
      if (onUploaded) {
        onUploaded({
          id: result.id,
          secureUrl: result.secureUrl,
          publicId: result.publicId,
        });
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { message?: string } }; message?: string };
      const msg = errorObj.response?.data?.message || errorObj.message || 'Failed to upload media';
      setError(msg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    if (onMediaSelect) onMediaSelect(null);
    if (onRemoved) onRemoved();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className='space-y-2'>
      {label && <label className='block text-xs font-semibold text-gray-700'>{label}</label>}

      <input
        type='file'
        ref={fileInputRef}
        onChange={handleFileChange}
        accept={
          resolvedType === 'image'
            ? 'image/jpeg,image/png,image/webp,image/gif'
            : 'video/mp4,video/webm'
        }
        className='hidden'
      />

      {error && (
        <div className='flex items-center space-x-2 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs'>
          <AlertCircle className='w-4 h-4 shrink-0' />
          <span>{error}</span>
        </div>
      )}

      {previewUrl ? (
        <div className='relative group border border-gray-200 rounded-xl overflow-hidden bg-gray-50 p-2'>
          {resolvedType === 'image' ? (
            <div className='relative w-full h-44 rounded-lg overflow-hidden bg-gray-100'>
              <Image
                src={previewUrl}
                alt='Uploaded media'
                fill
                className='object-cover'
                sizes='(max-width: 768px) 100vw, 500px'
              />
            </div>
          ) : (
            <div className='flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200'>
              <div className='flex items-center space-x-3 truncate'>
                <div className='p-2 rounded-lg bg-primary/10 text-primary'>
                  <FileVideo className='w-6 h-6' />
                </div>
                <div className='truncate'>
                  <p className='text-sm font-medium text-gray-900 truncate'>Video Media Attached</p>
                  <a
                    href={previewUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-xs text-primary hover:underline truncate block'
                  >
                    {previewUrl}
                  </a>
                </div>
              </div>
              <span className='px-2.5 py-0.5 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center space-x-1 shrink-0'>
                <CheckCircle2 className='w-3 h-3' />
                <span>Ready</span>
              </span>
            </div>
          )}

          <div className='mt-2 flex items-center justify-between px-1'>
            <div className='flex items-center space-x-2 text-xs text-emerald-600 font-medium'>
              <CheckCircle2 className='w-3.5 h-3.5' />
              <span>Media secured in Cloudinary</span>
            </div>
            <div className='flex items-center space-x-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className='h-8 text-xs'
              >
                <RotateCcw className='w-3.5 h-3.5 mr-1' />
                Replace
              </Button>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={handleRemove}
                disabled={isUploading}
                className='h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50'
              >
                <X className='w-3.5 h-3.5 mr-1' />
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${
            isUploading
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
              : 'border-gray-300 hover:border-primary hover:bg-primary/5'
          }`}
        >
          {isUploading ? (
            <div className='flex flex-col items-center space-y-2 py-4'>
              <Loader2 className='w-8 h-8 text-primary animate-spin' />
              <p className='text-xs font-medium text-gray-600'>
                Uploading to Cloudinary & persisting to database...
              </p>
              <p className='text-[11px] text-gray-400'>Please wait</p>
            </div>
          ) : (
            <div className='flex flex-col items-center space-y-2 text-center py-2'>
              <div className='p-3 rounded-full bg-gray-100 text-gray-500 group-hover:text-primary transition-colors'>
                {resolvedType === 'image' ? (
                  <ImageIcon className='w-6 h-6' />
                ) : (
                  <UploadCloud className='w-6 h-6' />
                )}
              </div>
              <div className='space-y-1'>
                <p className='text-xs font-semibold text-gray-700'>
                  Click or drag file to upload {resolvedType}
                </p>
                <p className='text-[11px] text-gray-400'>
                  {resolvedType === 'image'
                    ? 'PNG, JPG, WebP up to 10MB'
                    : 'MP4, WebM up to 100MB'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {helperText && <p className='text-[11px] text-gray-500'>{helperText}</p>}
    </div>
  );
}
