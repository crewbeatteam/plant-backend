// Use Web Crypto API instead of Node.js crypto

export interface ImageStorageService {
  uploadImage(file: File): Promise<{ imageKey: string; contentHash: string; fileSize: number; contentType: string }>;
  deleteImage(imageKey: string): Promise<void>;
  getImageUrl(imageKey: string): Promise<string>;
}

export class R2ImageStorage implements ImageStorageService {
  private bucket: R2Bucket;
  private baseUrl: string;

  constructor(bucket: R2Bucket, baseUrl: string = "https://plant-id-images.your-domain.com") {
    this.bucket = bucket;
    this.baseUrl = baseUrl;
  }

  async uploadImage(file: File): Promise<{ imageKey: string; contentHash: string; fileSize: number; contentType: string }> {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Generate content hash for deduplication using Web Crypto API
    const hashBuffer = await crypto.subtle.digest('SHA-256', uint8Array);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Create structured key path
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const extension = this.getFileExtension(file.type);
    const imageKey = `plant-images/${year}/${month}/${hash}.${extension}`;
    
    // Check if image already exists
    const existing = await this.bucket.head(imageKey);
    if (existing) {
      return {
        imageKey,
        contentHash: hash,
        fileSize: file.size,
        contentType: file.type
      };
    }
    
    // Upload to R2
    await this.bucket.put(imageKey, uint8Array, {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000' // 1 year cache
      },
      customMetadata: {
        originalName: file.name,
        uploadedAt: now.toISOString(),
        contentHash: hash
      }
    });
    
    return {
      imageKey,
      contentHash: hash,
      fileSize: file.size,
      contentType: file.type
    };
  }

  async deleteImage(imageKey: string): Promise<void> {
    await this.bucket.delete(imageKey);
  }

  async getImageUrl(imageKey: string): Promise<string> {
    return `${this.baseUrl}/${imageKey}`;
  }

  private getFileExtension(mimeType: string): string {
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif'
    };
    return extensions[mimeType] || 'jpg';
  }
}

// Factory function to create storage service
export function createImageStorage(env: { IMAGES: R2Bucket }): ImageStorageService {
  return new R2ImageStorage(env.IMAGES);
}

// Utility function to convert base64 to File (for migration)
export function base64ToFile(base64Data: string, filename: string = 'image.jpg'): File {
  const [header, data] = base64Data.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  
  const binaryString = atob(data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return new File([bytes], filename, { type: mimeType });
}

// Utility to generate image thumbnails (for future use with Cloudflare Images)
export function generateThumbnailUrl(imageKey: string, width: number = 300, height: number = 300): string {
  // This would integrate with Cloudflare Images API for on-the-fly resizing
  // For now, return the original image URL
  return `https://plant-id-images.your-domain.com/${imageKey}`;
}