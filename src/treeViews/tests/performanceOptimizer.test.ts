import * as assert from 'assert';
import {PerformanceOptimizer} from '../services';

describe('PerformanceOptimizer its', () => {
    teardown(() => {
        // Clean up any pending timeouts after each it
        PerformanceOptimizer.clearPendingUpdates();
    });

    it('should batch updates when enabled', (done) => {
        let updateCount = 0;
        const updateFn = () => {
            updateCount++;
        };

        PerformanceOptimizer.enableBatchUpdates();
        PerformanceOptimizer.addPendingUpdate(updateFn);
        PerformanceOptimizer.addPendingUpdate(updateFn);
        PerformanceOptimizer.addPendingUpdate(updateFn);

        // Updates shouldn't execute immediately when batching
        assert.strictEqual(updateCount, 0);

        // Wait for the batch interval to pass and execute updates
        setTimeout(() => {
            assert.strictEqual(updateCount, 3);
            done();
        }, 150); // Slightly more than the 100ms batch interval
    });

    it('should execute updates immediately when batching is disabled', () => {
        let updateCount = 0;
        const updateFn = () => {
            updateCount++;
        };

        PerformanceOptimizer.disableBatchUpdates();
        PerformanceOptimizer.addPendingUpdate(updateFn);
        PerformanceOptimizer.addPendingUpdate(updateFn);

        // Updates should execute immediately when batching is disabled
        assert.strictEqual(updateCount, 2);
    });

    it('should get correct pending update count', () => {
        PerformanceOptimizer.enableBatchUpdates();
        PerformanceOptimizer.addPendingUpdate(() => {});
        PerformanceOptimizer.addPendingUpdate(() => {});

        assert.strictEqual(PerformanceOptimizer.getPendingUpdateCount(), 2);

        PerformanceOptimizer.clearPendingUpdates();
        assert.strictEqual(PerformanceOptimizer.getPendingUpdateCount(), 0);
    });

    it('should clear pending updates', (done) => {
        let updateCount = 0;
        const updateFn = () => {
            updateCount++;
        };

        PerformanceOptimizer.enableBatchUpdates();
        PerformanceOptimizer.addPendingUpdate(updateFn);
        PerformanceOptimizer.addPendingUpdate(updateFn);

        assert.strictEqual(PerformanceOptimizer.getPendingUpdateCount(), 2);

        PerformanceOptimizer.clearPendingUpdates();
        assert.strictEqual(PerformanceOptimizer.getPendingUpdateCount(), 0);

        // Wait to ensure updates don't execute after clearing
        setTimeout(() => {
            assert.strictEqual(updateCount, 0);
            done();
        }, 150);
    });

    it('should flush pending updates manually', (done) => {
        let updateCount = 0;
        const updateFn = () => {
            updateCount++;
        };

        PerformanceOptimizer.enableBatchUpdates();
        PerformanceOptimizer.addPendingUpdate(updateFn);
        PerformanceOptimizer.addPendingUpdate(updateFn);

        assert.strictEqual(updateCount, 0); // Not executed yet

        PerformanceOptimizer.flushPendingUpdates();
        assert.strictEqual(updateCount, 2); // Should be executed now

        setTimeout(() => {
            // Should still be 2, not more, since we already flushed
            assert.strictEqual(updateCount, 2);
            done();
        }, 150);
    });

    it('should enable and disable batching properly', (done) => {
        let updateCount = 0;
        const updateFn = () => {
            updateCount++;
        };

        // Start with batching enabled
        PerformanceOptimizer.enableBatchUpdates();
        PerformanceOptimizer.addPendingUpdate(updateFn);

        assert.strictEqual(updateCount, 0); // Should not execute immediately

        // Disable batching - this should flush pending updates
        PerformanceOptimizer.disableBatchUpdates();

        // Updates should be flushed when disabling
        setTimeout(() => {
            assert.strictEqual(updateCount, 1);
            done();
        }, 10); // Check quickly since it should execute immediately after disable
    });
});
