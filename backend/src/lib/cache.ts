import type { SourceType } from './types.js';

export interface CacheEntry {
  // Content identification
  sourceUrl: string;
  contentHash: string;
  sourceType: SourceType;
  
  // Temporal information
  lastModified?: string;
  etag?: string;
  cacheTimestamp: number;
  ttl: number;
  
  // Content storage
  content?: string;
  
  // Metadata
  size: number;
  lastCheck: number;
  checkCount: number;
}

export class IntelligentCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly maxMemorySize: number;
  
  constructor() {
    // Set memory cache size (10MB for most Node.js environments)
    this.maxMemorySize = 10 * 1024 * 1024;
    this.setupMemoryPressureListener();
  }
  
  private setupMemoryPressureListener(): void {
    if (typeof process !== 'undefined') {
      process.on('memoryPressure', () => {
        this.cleanupMemoryPressure();
      });
    }
  }
  
  async get(key: string, sourceType: SourceType): Promise<CacheEntry | null> {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    
    // Check if entry is expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }
    
    // Move to most recently used
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    return entry;
  }
  
  async set(key: string, content: string, ttl: number, metadata?: Partial<CacheEntry>): Promise<void> {
    // Calculate memory usage
    const currentMemoryUsage = this.calculateMemoryUsage();
    
    // If we're approaching memory limits, cleanup first
    if (currentMemoryUsage > this.maxMemorySize * 0.8) {
      await this.cleanupMemoryPressure();
    }
    
    const entry: CacheEntry = {
      sourceUrl: key,
      contentHash: await this.calculateContentHash(content),
      sourceType: metadata?.sourceType ?? 'html',
      cacheTimestamp: Date.now(),
      ttl,
      content,
      size: content.length,
      lastCheck: Date.now(),
      checkCount: 1,
      ...metadata,
    };
    
    this.cache.set(key, entry);
  }
  
  async invalidate(key: string): Promise<void> {
    this.cache.delete(key);
  }
  
  async cleanup(): Promise<void> {
    // Remove expired entries
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
      }
    }
    
    // If still over memory limit, force cleanup
    if (this.calculateMemoryUsage() > this.maxMemorySize) {
      await this.forceCleanup();
    }
  }
  
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.cacheTimestamp > entry.ttl * 1000;
  }
  
  private calculateMemoryUsage(): number {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += JSON.stringify(entry).length;
    }
    return totalSize;
  }
  
  private async calculateContentHash(content: string): Promise<string> {
    // Simple hash implementation - in production, use a proper hash function
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
  
  private async cleanupMemoryPressure(): Promise<void> {
    // Remove oldest entries first (LRU-like)
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].cacheTimestamp - b[1].cacheTimestamp);
    
    // Remove 30% of entries to reduce memory usage
    const toRemove = Math.ceil(entries.length * 0.3);
    
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      const key = entries[i]![0];
      this.cache.delete(key);
    }
  }
  
  private async forceCleanup(): Promise<void> {
    // Keep only the most recently used entries
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => b[1].cacheTimestamp - a[1].cacheTimestamp);
    
    // Keep only top 50% of entries
    const keepCount = Math.ceil(entries.length * 0.5);
    
    // Remove older entries
    for (let i = keepCount; i < entries.length; i++) {
      const key = entries[i]![0];
      this.cache.delete(key);
    }
  }
  
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const expired = entries.filter(entry => this.isExpired(entry));
    const valid = entries.filter(entry => !this.isExpired(entry));
    
    return {
      totalEntries: entries.length,
      validEntries: valid.length,
      expiredEntries: expired.length,
      memoryUsage: this.calculateMemoryUsage(),
      maxMemorySize: this.maxMemorySize,
    };
  }
}

export interface CacheStats {
  totalEntries: number;
  validEntries: number;
  expiredEntries: number;
  memoryUsage: number;
  maxMemorySize: number;
}
