import { createImageStorage } from "./imageStorage";

export interface ImageCleanupService {
  cleanupOrphanedImages(): Promise<number>;
  cleanupOldImages(daysOld: number): Promise<number>;
  cleanupUnusedImages(): Promise<number>;
}

export class R2ImageCleanup implements ImageCleanupService {
  private db: D1Database;
  private imageStorage: any;

  constructor(db: D1Database, env: { IMAGES: R2Bucket }) {
    this.db = db;
    this.imageStorage = createImageStorage(env);
  }

  async cleanupOrphanedImages(): Promise<number> {
    // Find images in R2 that are not referenced in the database
    const { results: imageMetadata } = await this.db.prepare(`
      SELECT image_key FROM image_metadata
    `).all();

    const dbImageKeys = new Set(imageMetadata.map((row: any) => row.image_key));
    
    // This would require listing all R2 objects, which can be expensive
    // For now, we'll focus on database-driven cleanup
    return 0;
  }

  async cleanupOldImages(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffIso = cutoffDate.toISOString();

    // Find old images that haven't been accessed recently
    const { results: oldImages } = await this.db.prepare(`
      SELECT image_key 
      FROM image_metadata 
      WHERE uploaded_at < ? 
      AND (last_accessed IS NULL OR last_accessed < ?)
    `).bind(cutoffIso, cutoffIso).all();

    let deletedCount = 0;

    for (const image of oldImages) {
      const imageKey = (image as any).image_key;
      
      // Check if image is still being used
      const { results: usage } = await this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM identification_images 
        WHERE image_key = ?
      `).bind(imageKey).all();

      if ((usage[0] as any).count === 0) {
        // Delete from R2
        await this.imageStorage.deleteImage(imageKey);
        
        // Delete from database
        await this.db.prepare(`
          DELETE FROM image_metadata 
          WHERE image_key = ?
        `).bind(imageKey).run();

        deletedCount++;
      }
    }

    return deletedCount;
  }

  async cleanupUnusedImages(): Promise<number> {
    // Find images that are not referenced by any identification
    const { results: unusedImages } = await this.db.prepare(`
      SELECT im.image_key 
      FROM image_metadata im
      LEFT JOIN identification_images ii ON im.image_key = ii.image_key
      WHERE ii.image_key IS NULL
    `).all();

    let deletedCount = 0;

    for (const image of unusedImages) {
      const imageKey = (image as any).image_key;
      
      // Delete from R2
      await this.imageStorage.deleteImage(imageKey);
      
      // Delete from database
      await this.db.prepare(`
        DELETE FROM image_metadata 
        WHERE image_key = ?
      `).bind(imageKey).run();

      deletedCount++;
    }

    return deletedCount;
  }
}

// Scheduled cleanup function (can be called from a cron job)
export async function performScheduledCleanup(
  db: D1Database, 
  env: { IMAGES: R2Bucket }
): Promise<{ deletedOldImages: number, deletedUnusedImages: number }> {
  const cleanup = new R2ImageCleanup(db, env);
  
  // Clean up images older than 90 days that haven't been accessed
  const deletedOldImages = await cleanup.cleanupOldImages(90);
  
  // Clean up images that are no longer referenced
  const deletedUnusedImages = await cleanup.cleanupUnusedImages();
  
  console.log(`Cleanup completed: ${deletedOldImages} old images, ${deletedUnusedImages} unused images deleted`);
  
  return { deletedOldImages, deletedUnusedImages };
}

// Update image access time (call this when serving images)
export async function updateImageAccess(db: D1Database, imageKey: string): Promise<void> {
  await db.prepare(`
    UPDATE image_metadata 
    SET last_accessed = ?, access_count = access_count + 1 
    WHERE image_key = ?
  `).bind(new Date().toISOString(), imageKey).run();
}