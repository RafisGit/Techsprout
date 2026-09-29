export type MediaResourceType = 'image' | 'video';

export type AllowedImageFolder =
  | 'techsprout/images/courses'
  | 'techsprout/images/instructors'
  | 'techsprout/images/categories'
  | 'techsprout/images/site';

export type AllowedVideoFolder = 'techsprout/videos/courses' | 'techsprout/videos/lessons';

export type MediaFolder = AllowedImageFolder | AllowedVideoFolder;

export interface MediaUploadResult {
  publicId: string;
  secureUrl: string;
  resourceType: MediaResourceType;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  originalFilename?: string;
  createdAt: string;
}

export interface MediaDeleteResult {
  publicId: string;
  result: string;
  resourceType: MediaResourceType;
}

export interface SignedUploadParameters {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
  resourceType: MediaResourceType;
  uploadUrl: string;
}

export interface UploadMediaOptions {
  folder?: string;
  customIdentifier?: string;
  tags?: string[];
  overwrite?: boolean;
}

export interface FilePayload {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size?: number;
}
