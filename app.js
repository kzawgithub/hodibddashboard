/**
 * Main Application Logic
 * Initializes the application and coordinates between modules
 */

// Main App class
class App {
    constructor() {
        // Initialize application state
        this.isInitialized = false;
        this.notificationTimeout = null;

        // Initialize the application when the DOM is fully loaded
        document.addEventListener('DOMContentLoaded', () => {
            this.init();
        });
    }

    // Show notification message
    showNotification(message, type = 'success', duration = 3000) {
        // Clear any existing notification
        this.clearNotification();

        // Create notification element if it doesn't exist
        let notification = document.getElementById('notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'notification';
            notification.className = 'notification';

            const messageElement = document.createElement('p');
            messageElement.className = 'notification-message';
            notification.appendChild(messageElement);

            const closeButton = document.createElement('button');
            closeButton.className = 'notification-close';
            closeButton.innerHTML = '&times;';
            closeButton.addEventListener('click', () => this.clearNotification());
            notification.appendChild(closeButton);

            document.body.appendChild(notification);
        }

        // Set notification type and message
        notification.className = `notification ${type}`;
        notification.querySelector('.notification-message').textContent = message;

        // Show notification
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        // Auto-hide after duration
        this.notificationTimeout = setTimeout(() => {
            this.clearNotification();
        }, duration);
    }

    // Clear notification
    clearNotification() {
        const notification = document.getElementById('notification');
        if (notification) {
            notification.classList.remove('show');
        }

        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
            this.notificationTimeout = null;
        }
    }

    // Initialize the application
    init() {
        if (this.isInitialized) return;

        // Check if required modules are loaded
        if (!window.fileHandler || !window.dataProcessor || !window.visualizer) {
            console.error('Required modules are not loaded.');
            return;
        }

        // Set up memory monitoring
        this.setupMemoryMonitoring();

        // Mark as initialized
        this.isInitialized = true;
        console.log('Financial Transaction Dashboard initialized successfully.');
    }

    // Set up memory monitoring
    setupMemoryMonitoring() {
        // Check if performance memory API is available
        if (window.performance && window.performance.memory) {
            // Create memory monitor element
            const memoryMonitor = document.createElement('div');
            memoryMonitor.id = 'memoryMonitor';
            memoryMonitor.className = 'memory-monitor';
            memoryMonitor.innerHTML = 'Memory: Monitoring...';
            document.body.appendChild(memoryMonitor);

            // Update memory usage every 5 seconds
            this.memoryMonitorInterval = setInterval(() => {
                this.updateMemoryUsage();
            }, 5000);

            // Initial update
            this.updateMemoryUsage();

            console.log('Memory monitoring initialized');
        } else {
            console.log('Performance memory API not available');
        }
    }

    // Update memory usage display
    updateMemoryUsage() {
        if (window.performance && window.performance.memory) {
            const memoryInfo = window.performance.memory;
            const usedHeapSize = this.formatBytes(memoryInfo.usedJSHeapSize);
            const heapLimit = this.formatBytes(memoryInfo.jsHeapSizeLimit);

            const memoryMonitor = document.getElementById('memoryMonitor');
            if (memoryMonitor) {
                memoryMonitor.innerHTML = `Memory: ${usedHeapSize} / ${heapLimit}`;

                // Add warning class if memory usage is high
                const usageRatio = memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit;
                if (usageRatio > 0.8) {
                    memoryMonitor.className = 'memory-monitor warning';

                    // Try to trigger garbage collection
                    this.triggerGarbageCollection();
                } else if (usageRatio > 0.6) {
                    memoryMonitor.className = 'memory-monitor caution';
                } else {
                    memoryMonitor.className = 'memory-monitor';
                }
            }
        }
    }

    // Format bytes to human-readable format
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Try to trigger garbage collection
    triggerGarbageCollection() {
        // Create and destroy large objects to encourage garbage collection
        const arr = new Array(100).fill('x').map(() => new Array(1000000).join('x'));
        arr.length = 0;

        // Log memory pressure
        console.log('High memory usage detected, attempting to free memory');
    }

    // Set up Web Worker for background processing
    setupWebWorker() {
        // Check if Web Workers are supported
        if (window.Worker) {
            try {
                // Create a blob URL for the worker script
                const workerScript = `
                    self.onmessage = function(e) {
                        const { action, data } = e.data;

                        if (action === 'processData') {
                            // Process data in the background
                            const result = processDataInBackground(data);
                            self.postMessage({ action: 'processComplete', result });
                        }
                    };

                    // Function to process data in the background
                    function processDataInBackground(data) {
                        // Calculate metrics
                        const metrics = {
                            totalTransactions: 0,
                            totalAmount: 0,
                            hocCount: 0,
                            hocAmount: 0,
                            ibdCount: 0,
                            ibdAmount: 0,
                            hocUniqueSerialCount: 0,
                            ibdUniqueSerialCount: 0,
                            currencyCounts: {
                                USD: 0,
                                MMK: 0
                            },
                            currencyAmounts: {
                                USD: 0,
                                MMK: 0
                            }
                        };

                        // Sets to track unique serial numbers
                        const hocSerialNumbers = new Set();
                        const ibdSerialNumbers = new Set();

                        // Process each transaction
                        data.forEach(transaction => {
                            const amount = parseFloat(transaction.TRANSACTION_AMOUNT) || 0;
                            const serialNo = transaction.SERIAL_NO || '';

                            // Update total counts
                            metrics.totalTransactions++;
                            metrics.totalAmount += amount;

                            // Update report type counts
                            if (transaction.REPORTTYPE === 'HOC') {
                                metrics.hocCount++;
                                metrics.hocAmount += amount;

                                // Track unique serial numbers for HOC
                                if (serialNo) {
                                    hocSerialNumbers.add(serialNo);
                                }
                            } else if (transaction.REPORTTYPE === 'IBD') {
                                metrics.ibdCount++;
                                metrics.ibdAmount += amount;

                                // Track unique serial numbers for IBD
                                if (serialNo) {
                                    ibdSerialNumbers.add(serialNo);
                                }
                            } else if (transaction.REPORTTYPE === 'WU') {
                                // For WU transactions, only track unique serial numbers for IBD count
                                // but don't include in other IBD metrics
                                if (serialNo) {
                                    ibdSerialNumbers.add(serialNo);
                                }
                            }

                            // Update currency counts
                            if (transaction.TRANSACTION_CURRENCY === 'USD') {
                                metrics.currencyCounts.USD++;
                                metrics.currencyAmounts.USD += amount;
                            } else if (transaction.TRANSACTION_CURRENCY === 'MMK') {
                                metrics.currencyCounts.MMK++;
                                metrics.currencyAmounts.MMK += amount;
                            }
                        });

                        // Update unique serial counts
                        metrics.hocUniqueSerialCount = hocSerialNumbers.size;
                        metrics.ibdUniqueSerialCount = ibdSerialNumbers.size;

                        return { metrics, processedData: data };
                    }
                `;

                const blob = new Blob([workerScript], { type: 'application/javascript' });
                const workerUrl = URL.createObjectURL(blob);

                // Create the worker
                this.worker = new Worker(workerUrl);

                // Set up message handler
                this.worker.onmessage = (e) => {
                    const { action, result } = e.data;

                    if (action === 'processComplete') {
                        // Update the UI with the processed data
                        if (window.dataProcessor) {
                            window.dataProcessor.summaryMetrics = result.metrics;
                            window.dataProcessor.updateUI();
                        }

                        // Update visualizations
                        if (window.visualizer) {
                            window.visualizer.updateCharts(result.metrics);
                        }
                    }
                };

                console.log('Web Worker initialized for background processing.');
            } catch (error) {
                console.error('Failed to initialize Web Worker:', error);
            }
        }
    }

    // Process data using Web Worker if available
    processDataWithWorker(data) {
        if (this.worker) {
            this.worker.postMessage({
                action: 'processData',
                data: data
            });
        } else {
            // Fallback to main thread processing
            if (window.dataProcessor) {
                window.dataProcessor.processData(data);
            }
        }
    }


}

// Create a global instance of the App
window.app = new App();
