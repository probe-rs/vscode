export class PerformanceOptimizer {
    private static batchUpdates: boolean = false;
    private static pendingUpdates: Array<() => void> = [];
    private static batchTimeout: NodeJS.Timeout | null = null;
    private static readonly BATCH_INTERVAL = 100; // ms
    
    // Enable batched updates
    static enableBatchUpdates() {
        this.batchUpdates = true;
    }
    
    // Disable batched updates
    static disableBatchUpdates() {
        this.batchUpdates = false;
        this.flushPendingUpdates();
    }
    
    // Add an update to the pending batch
    static addPendingUpdate(updateFn: () => void) {
        if (this.batchUpdates) {
            this.pendingUpdates.push(updateFn);
            
            // Schedule a flush if not already scheduled
            if (!this.batchTimeout) {
                this.batchTimeout = setTimeout(() => {
                    this.flushPendingUpdates();
                }, this.BATCH_INTERVAL);
            }
        } else {
            // Execute immediately if batching is disabled
            updateFn();
        }
    }
    
    // Execute all pending updates
    static flushPendingUpdates() {
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }
        
        // Execute all pending updates
        for (const update of this.pendingUpdates) {
            update();
        }
        
        // Clear the pending updates
        this.pendingUpdates = [];
    }
    
    // Get number of pending updates
    static getPendingUpdateCount(): number {
        return this.pendingUpdates.length;
    }
    
    // Clear all pending updates
    static clearPendingUpdates() {
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }
        this.pendingUpdates = [];
    }
}