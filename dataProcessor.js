/**
 * Data Processor Module
 * Handles data aggregation, filtering, and calculations
 */

class DataProcessor {
    constructor() {
        this.rawData = [];
        this.filteredData = [];
        this.summaryMetrics = {
            totalTransactions: 0,
            totalAmount: 0,
            hocCount: 0,
            hocAmount: 0,
            hocCreditCount: 0,
            hocCreditAmount: 0,
            hocDebitCount: 0,
            hocDebitAmount: 0,
            ibdCount: 0,
            ibdAmount: 0,
            ibdCreditCount: 0,
            ibdCreditAmount: 0,
            ibdDebitCount: 0,
            ibdDebitAmount: 0,
            hocUniqueSerialCount: 0,
            ibdUniqueSerialCount: 0,
            totalUniqueSerialCount: 0,
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
        this.hocSerialNumbers = new Set();
        this.ibdSerialNumbers = new Set();
        this.allSerialNumbers = new Set();

        // Set to track processed files (by unique identifier)
        this.processedFiles = new Set();

        // Initialize event listeners for filters
        this.initEventListeners();
    }

    // Set up event listeners for filter controls
    initEventListeners() {
        const applyFiltersBtn = document.getElementById('applyFilters');
        const resetFiltersBtn = document.getElementById('resetFilters');

        applyFiltersBtn.addEventListener('click', () => {
            this.applyFilters();
        });

        resetFiltersBtn.addEventListener('click', () => {
            this.resetFilters();
        });
    }

    // Process the raw data
    processData(data) {
        this.rawData = data || [];
        this.filteredData = [...this.rawData];

        // Reset metrics before calculating
        this.resetMetrics();

        // Calculate summary metrics
        this.calculateMetrics(this.filteredData);

        // Update the UI with the calculated metrics
        this.updateUI();

        // Update visualizations
        if (window.visualizer) {
            window.visualizer.updateCharts(this.summaryMetrics);
        }

        // Update table data
        if (window.tableData) {
            window.tableData.processData(this.filteredData);
        }

        // Apply any active filters
        const currencyFilter = document.getElementById('currencyFilter').value;
        const reportTypeFilter = document.getElementById('reportTypeFilter').value;

        // If filters are active, reapply them
        if (currencyFilter !== 'all' || reportTypeFilter !== 'all') {
            console.log('Reapplying active filters after data update');
            this.applyFilters();
        }

        // Log data status
        if (this.rawData.length === 0) {
            console.log('Data processor reset with empty data');
        } else {
            console.log(`Data processor updated with ${this.rawData.length} records`);
        }
    }

    // Update metrics incrementally (for memory optimization)
    updateMetrics(newMetrics) {
        // Check if newMetrics is valid
        if (!newMetrics) {
            console.warn('Received invalid metrics, skipping update');
            return;
        }

        // If metrics are not initialized, initialize them
        if (!this.summaryMetrics) {
            this.resetMetrics();
        }

        // Log incoming metrics for debugging
        if (newMetrics.totalTransactions > 0) {
            console.log(`DataProcessor: Updating metrics with ${newMetrics.totalTransactions} new transactions`);
            console.log(`Incoming metrics breakdown - HOC: ${newMetrics.hocCount}, IBD: ${newMetrics.ibdCount}`);
        }

        // Helper function to safely add numeric values
        const safeAdd = (a, b) => {
            const numA = typeof a === 'number' && !isNaN(a) ? a : 0;
            const numB = typeof b === 'number' && !isNaN(b) ? b : 0;
            return numA + numB;
        };

        // Store previous values for logging
        const prevTotal = this.summaryMetrics.totalTransactions;

        // Add the new metrics to the existing ones with proper validation
        this.summaryMetrics.totalTransactions = safeAdd(this.summaryMetrics.totalTransactions, newMetrics.totalTransactions);
        this.summaryMetrics.totalAmount = safeAdd(this.summaryMetrics.totalAmount, newMetrics.totalAmount);
        this.summaryMetrics.hocCount = safeAdd(this.summaryMetrics.hocCount, newMetrics.hocCount);
        this.summaryMetrics.hocAmount = safeAdd(this.summaryMetrics.hocAmount, newMetrics.hocAmount);
        this.summaryMetrics.hocCreditCount = safeAdd(this.summaryMetrics.hocCreditCount, newMetrics.hocCreditCount);
        this.summaryMetrics.hocCreditAmount = safeAdd(this.summaryMetrics.hocCreditAmount, newMetrics.hocCreditAmount);
        this.summaryMetrics.hocDebitCount = safeAdd(this.summaryMetrics.hocDebitCount, newMetrics.hocDebitCount);
        this.summaryMetrics.hocDebitAmount = safeAdd(this.summaryMetrics.hocDebitAmount, newMetrics.hocDebitAmount);
        this.summaryMetrics.ibdCount = safeAdd(this.summaryMetrics.ibdCount, newMetrics.ibdCount);
        this.summaryMetrics.ibdAmount = safeAdd(this.summaryMetrics.ibdAmount, newMetrics.ibdAmount);
        this.summaryMetrics.ibdCreditCount = safeAdd(this.summaryMetrics.ibdCreditCount, newMetrics.ibdCreditCount);
        this.summaryMetrics.ibdCreditAmount = safeAdd(this.summaryMetrics.ibdCreditAmount, newMetrics.ibdCreditAmount);
        this.summaryMetrics.ibdDebitCount = safeAdd(this.summaryMetrics.ibdDebitCount, newMetrics.ibdDebitCount);
        this.summaryMetrics.ibdDebitAmount = safeAdd(this.summaryMetrics.ibdDebitAmount, newMetrics.ibdDebitAmount);

        // Update unique serial counts if provided
        if (newMetrics.hocUniqueSerialCount !== undefined) {
            this.summaryMetrics.hocUniqueSerialCount = safeAdd(this.summaryMetrics.hocUniqueSerialCount, newMetrics.hocUniqueSerialCount);
        }
        if (newMetrics.ibdUniqueSerialCount !== undefined) {
            this.summaryMetrics.ibdUniqueSerialCount = safeAdd(this.summaryMetrics.ibdUniqueSerialCount, newMetrics.ibdUniqueSerialCount);
        }
        if (newMetrics.totalUniqueSerialCount !== undefined) {
            this.summaryMetrics.totalUniqueSerialCount = safeAdd(this.summaryMetrics.totalUniqueSerialCount, newMetrics.totalUniqueSerialCount);
        }

        // Update currency counts with proper validation
        if (newMetrics.currencyCounts) {
            this.summaryMetrics.currencyCounts.USD = safeAdd(this.summaryMetrics.currencyCounts.USD, newMetrics.currencyCounts.USD);
            this.summaryMetrics.currencyCounts.MMK = safeAdd(this.summaryMetrics.currencyCounts.MMK, newMetrics.currencyCounts.MMK);
        }

        if (newMetrics.currencyAmounts) {
            this.summaryMetrics.currencyAmounts.USD = safeAdd(this.summaryMetrics.currencyAmounts.USD, newMetrics.currencyAmounts.USD);
            this.summaryMetrics.currencyAmounts.MMK = safeAdd(this.summaryMetrics.currencyAmounts.MMK, newMetrics.currencyAmounts.MMK);
        }

        // Log the change in metrics
        if (newMetrics.totalTransactions > 0) {
            console.log(`Metrics updated: ${prevTotal} → ${this.summaryMetrics.totalTransactions} transactions (added ${this.summaryMetrics.totalTransactions - prevTotal})`);
        }

        // Update the UI with the updated metrics
        this.updateUI();

        // Update visualizations
        if (window.visualizer) {
            window.visualizer.updateCharts(this.summaryMetrics);
        }

        // Update table data if needed
        if (window.tableData && newMetrics.totalTransactions > 100) {
            // Force table refresh for large updates
            console.log('Forcing table refresh due to significant metrics update');
            window.tableData.finalizeProcessing();
        }
    }

    // Subtract metrics (for file removal)
    subtractMetrics(metricsToSubtract) {
        // Check if metricsToSubtract is valid
        if (!metricsToSubtract) {
            console.warn('Received invalid metrics to subtract, skipping operation');
            return;
        }

        // If metrics are not initialized, nothing to subtract from
        if (!this.summaryMetrics) {
            console.warn('No metrics initialized, nothing to subtract from');
            return;
        }

        // Log metrics being subtracted for debugging
        if (metricsToSubtract.totalTransactions > 0) {
            console.log(`DataProcessor: Subtracting ${metricsToSubtract.totalTransactions} transactions from metrics`);
            console.log(`Subtracting metrics breakdown - HOC: ${metricsToSubtract.hocCount}, IBD: ${metricsToSubtract.ibdCount}`);
        }

        // Helper function to safely subtract numeric values (never go below 0)
        const safeSubtract = (a, b) => {
            const numA = typeof a === 'number' && !isNaN(a) ? a : 0;
            const numB = typeof b === 'number' && !isNaN(b) ? b : 0;
            return Math.max(0, numA - numB);
        };

        // Store previous values for logging
        const prevTotal = this.summaryMetrics.totalTransactions;

        // Subtract the metrics with proper validation
        this.summaryMetrics.totalTransactions = safeSubtract(this.summaryMetrics.totalTransactions, metricsToSubtract.totalTransactions);
        this.summaryMetrics.totalAmount = safeSubtract(this.summaryMetrics.totalAmount, metricsToSubtract.totalAmount);
        this.summaryMetrics.hocCount = safeSubtract(this.summaryMetrics.hocCount, metricsToSubtract.hocCount);
        this.summaryMetrics.hocAmount = safeSubtract(this.summaryMetrics.hocAmount, metricsToSubtract.hocAmount);
        this.summaryMetrics.hocCreditCount = safeSubtract(this.summaryMetrics.hocCreditCount, metricsToSubtract.hocCreditCount);
        this.summaryMetrics.hocCreditAmount = safeSubtract(this.summaryMetrics.hocCreditAmount, metricsToSubtract.hocCreditAmount);
        this.summaryMetrics.hocDebitCount = safeSubtract(this.summaryMetrics.hocDebitCount, metricsToSubtract.hocDebitCount);
        this.summaryMetrics.hocDebitAmount = safeSubtract(this.summaryMetrics.hocDebitAmount, metricsToSubtract.hocDebitAmount);
        this.summaryMetrics.ibdCount = safeSubtract(this.summaryMetrics.ibdCount, metricsToSubtract.ibdCount);
        this.summaryMetrics.ibdAmount = safeSubtract(this.summaryMetrics.ibdAmount, metricsToSubtract.ibdAmount);
        this.summaryMetrics.ibdCreditCount = safeSubtract(this.summaryMetrics.ibdCreditCount, metricsToSubtract.ibdCreditCount);
        this.summaryMetrics.ibdCreditAmount = safeSubtract(this.summaryMetrics.ibdCreditAmount, metricsToSubtract.ibdCreditAmount);
        this.summaryMetrics.ibdDebitCount = safeSubtract(this.summaryMetrics.ibdDebitCount, metricsToSubtract.ibdDebitCount);
        this.summaryMetrics.ibdDebitAmount = safeSubtract(this.summaryMetrics.ibdDebitAmount, metricsToSubtract.ibdDebitAmount);

        // For unique serial counts, we don't directly subtract since they're based on Sets
        // Instead, we'll just use the current size of the Sets which should be accurate
        // after serial numbers have been properly removed
        this.summaryMetrics.hocUniqueSerialCount = this.hocSerialNumbers.size;
        this.summaryMetrics.ibdUniqueSerialCount = this.ibdSerialNumbers.size;
        this.summaryMetrics.totalUniqueSerialCount = this.allSerialNumbers.size;

        // Update currency counts with proper validation
        if (metricsToSubtract.currencyCounts) {
            this.summaryMetrics.currencyCounts.USD = safeSubtract(this.summaryMetrics.currencyCounts.USD, metricsToSubtract.currencyCounts.USD);
            this.summaryMetrics.currencyCounts.MMK = safeSubtract(this.summaryMetrics.currencyCounts.MMK, metricsToSubtract.currencyCounts.MMK);
        }

        if (metricsToSubtract.currencyAmounts) {
            this.summaryMetrics.currencyAmounts.USD = safeSubtract(this.summaryMetrics.currencyAmounts.USD, metricsToSubtract.currencyAmounts.USD);
            this.summaryMetrics.currencyAmounts.MMK = safeSubtract(this.summaryMetrics.currencyAmounts.MMK, metricsToSubtract.currencyAmounts.MMK);
        }

        // Log the change in metrics
        if (metricsToSubtract.totalTransactions > 0) {
            console.log(`Metrics updated after subtraction: ${prevTotal} → ${this.summaryMetrics.totalTransactions} transactions (removed ${prevTotal - this.summaryMetrics.totalTransactions})`);
            console.log(`Updated unique serial counts - HOC: ${this.summaryMetrics.hocUniqueSerialCount}, IBD: ${this.summaryMetrics.ibdUniqueSerialCount}, Total: ${this.summaryMetrics.totalUniqueSerialCount}`);
        }

        // Update the UI with the updated metrics
        this.updateUI();

        // Update visualizations
        if (window.visualizer) {
            window.visualizer.updateCharts(this.summaryMetrics);
        }

        // Update table data
        if (window.tableData) {
            // Force table refresh after removing data
            console.log('Forcing table refresh after data removal');
            window.tableData.finalizeProcessing();
        }
    }

    // Reset metrics to initial state
    resetMetrics() {
        this.summaryMetrics = {
            totalTransactions: 0,
            totalAmount: 0,
            hocCount: 0,
            hocAmount: 0,
            hocCreditCount: 0,
            hocCreditAmount: 0,
            hocDebitCount: 0,
            hocDebitAmount: 0,
            ibdCount: 0,
            ibdAmount: 0,
            ibdCreditCount: 0,
            ibdCreditAmount: 0,
            ibdDebitCount: 0,
            ibdDebitAmount: 0,
            hocUniqueSerialCount: 0,
            ibdUniqueSerialCount: 0,
            totalUniqueSerialCount: 0,
            currencyCounts: {
                USD: 0,
                MMK: 0
            },
            currencyAmounts: {
                USD: 0,
                MMK: 0
            }
        };

        // Reset the sets of unique serial numbers
        this.hocSerialNumbers = new Set();
        this.ibdSerialNumbers = new Set();
        this.allSerialNumbers = new Set();
    }

    // Apply filters to the data
    applyFilters() {
        const currencyFilter = document.getElementById('currencyFilter').value;
        const reportTypeFilter = document.getElementById('reportTypeFilter').value;

        // Start with all data
        this.filteredData = [...this.rawData];

        // Apply currency filter
        if (currencyFilter !== 'all') {
            this.filteredData = this.filteredData.filter(item =>
                item.TRANSACTION_CURRENCY === currencyFilter
            );
        }

        // Apply report type filter
        if (reportTypeFilter !== 'all') {
            if (reportTypeFilter === 'IBD') {
                // For IBD filter, include both IBD and WU report types
                this.filteredData = this.filteredData.filter(item =>
                    item.REPORTTYPE === 'IBD' || item.REPORTTYPE === 'WU'
                );
            } else {
                // For HOC or any other filter, apply as normal
                this.filteredData = this.filteredData.filter(item =>
                    item.REPORTTYPE === reportTypeFilter
                );
            }
        }

        // Reset metrics before recalculating
        this.resetMetrics();

        // Recalculate metrics with filtered data
        this.calculateMetrics(this.filteredData);

        // Update UI
        this.updateUI();

        // Update visualizations
        if (window.visualizer) {
            window.visualizer.updateCharts(this.summaryMetrics);
        }

        // Update table data with filtered data
        if (window.tableData) {
            window.tableData.processData(this.filteredData);
        }

        // Log filter application
        console.log(`Filters applied: Currency=${currencyFilter}, ReportType=${reportTypeFilter}`);
        console.log(`Filtered data: ${this.filteredData.length} records (from ${this.rawData.length} total)`);

        // Log breakdown of report types in filtered data
        const reportTypeCounts = {};
        this.filteredData.forEach(item => {
            reportTypeCounts[item.REPORTTYPE] = (reportTypeCounts[item.REPORTTYPE] || 0) + 1;
        });
        console.log('Report type breakdown in filtered data:', reportTypeCounts);

        // Log breakdown of currencies in filtered data
        const currencyCounts = {};
        this.filteredData.forEach(item => {
            currencyCounts[item.TRANSACTION_CURRENCY] = (currencyCounts[item.TRANSACTION_CURRENCY] || 0) + 1;
        });
        console.log('Currency breakdown in filtered data:', currencyCounts);
    }

    // Reset all filters
    resetFilters() {
        document.getElementById('currencyFilter').value = 'all';
        document.getElementById('reportTypeFilter').value = 'all';

        // Reset to all data
        this.filteredData = [...this.rawData];

        // Reset metrics before recalculating
        this.resetMetrics();

        // Recalculate metrics
        this.calculateMetrics(this.filteredData);

        // Update UI
        this.updateUI();

        // Update visualizations
        if (window.visualizer) {
            window.visualizer.updateCharts(this.summaryMetrics);
        }

        // Update table data with reset data
        if (window.tableData) {
            window.tableData.processData(this.filteredData);
        }

        // Log filter reset
        console.log(`Filters reset. Using all ${this.rawData.length} records.`);
    }

    // Calculate metrics from the data
    calculateMetrics(data) {
        // Reset metrics
        this.resetMetrics();

        // Helper function to safely add numeric values
        const safeAdd = (a, b) => {
            const numA = typeof a === 'number' && !isNaN(a) ? a : 0;
            const numB = typeof b === 'number' && !isNaN(b) ? b : 0;
            return numA + numB;
        };

        // Log the data size being processed
        console.log(`Calculating metrics for ${data.length} transactions`);

        // Process each transaction
        data.forEach(transaction => {
            // Ensure amount is a number with proper validation
            const amount = typeof transaction.TRANSACTION_AMOUNT === 'string' ?
                parseFloat(transaction.TRANSACTION_AMOUNT) || 0 :
                (typeof transaction.TRANSACTION_AMOUNT === 'number' ? transaction.TRANSACTION_AMOUNT : 0);

            // Update total counts
            this.summaryMetrics.totalTransactions++;
            this.summaryMetrics.totalAmount = safeAdd(this.summaryMetrics.totalAmount, amount);

            // Determine if this is a credit or debit transaction
            const isCredit = transaction.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'C';
            const isDebit = transaction.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'D';

            // Get the serial number (with error handling)
            const serialNo = transaction.SERIAL_NO || '';

            // Update report type counts
            if (transaction.REPORTTYPE === 'HOC') {
                this.summaryMetrics.hocCount++;
                this.summaryMetrics.hocAmount = safeAdd(this.summaryMetrics.hocAmount, amount);

                // Track unique serial numbers for HOC
                if (serialNo) {
                    this.hocSerialNumbers.add(serialNo);
                    this.allSerialNumbers.add(serialNo);
                }

                // Update HOC credit/debit counts
                if (isCredit) {
                    this.summaryMetrics.hocCreditCount++;
                    this.summaryMetrics.hocCreditAmount = safeAdd(this.summaryMetrics.hocCreditAmount, amount);
                } else if (isDebit) {
                    this.summaryMetrics.hocDebitCount++;
                    this.summaryMetrics.hocDebitAmount = safeAdd(this.summaryMetrics.hocDebitAmount, amount);
                }
            } else if (transaction.REPORTTYPE === 'IBD') {
                this.summaryMetrics.ibdCount++;
                this.summaryMetrics.ibdAmount = safeAdd(this.summaryMetrics.ibdAmount, amount);

                // Track unique serial numbers for IBD
                if (serialNo) {
                    this.ibdSerialNumbers.add(serialNo);
                    this.allSerialNumbers.add(serialNo);
                }

                // Update IBD credit/debit counts
                if (isCredit) {
                    this.summaryMetrics.ibdCreditCount++;
                    this.summaryMetrics.ibdCreditAmount = safeAdd(this.summaryMetrics.ibdCreditAmount, amount);
                } else if (isDebit) {
                    this.summaryMetrics.ibdDebitCount++;
                    this.summaryMetrics.ibdDebitAmount = safeAdd(this.summaryMetrics.ibdDebitAmount, amount);
                }
            } else if (transaction.REPORTTYPE === 'WU') {
                // For WU transactions, only track unique serial numbers for IBD count
                // but don't include in other IBD metrics
                if (serialNo) {
                    this.ibdSerialNumbers.add(serialNo);
                    this.allSerialNumbers.add(serialNo);
                }
            }

            // Update currency counts
            if (transaction.TRANSACTION_CURRENCY === 'USD') {
                this.summaryMetrics.currencyCounts.USD++;
                this.summaryMetrics.currencyAmounts.USD = safeAdd(this.summaryMetrics.currencyAmounts.USD, amount);
            } else if (transaction.TRANSACTION_CURRENCY === 'MMK') {
                this.summaryMetrics.currencyCounts.MMK++;
                this.summaryMetrics.currencyAmounts.MMK = safeAdd(this.summaryMetrics.currencyAmounts.MMK, amount);
            }
        });

        // Update unique serial counts
        this.summaryMetrics.hocUniqueSerialCount = this.hocSerialNumbers.size;
        this.summaryMetrics.ibdUniqueSerialCount = this.ibdSerialNumbers.size;
        this.summaryMetrics.totalUniqueSerialCount = this.allSerialNumbers.size;

        // Log the calculated metrics
        console.log(`Metrics calculation complete: ${this.summaryMetrics.totalTransactions} total transactions`);
        console.log(`HOC: ${this.summaryMetrics.hocCount} (${this.summaryMetrics.hocUniqueSerialCount} unique serials), IBD: ${this.summaryMetrics.ibdCount} (${this.summaryMetrics.ibdUniqueSerialCount} unique serials including WU transactions)`);
        console.log(`Total unique serial count across all types: ${this.summaryMetrics.totalUniqueSerialCount}`);
    }

    // Update the UI with calculated metrics
    updateUI() {
        // Update summary metrics
        document.getElementById('totalTransactions').textContent = this.formatNumber(this.summaryMetrics.totalTransactions);
        document.getElementById('totalAmount').textContent = this.formatCurrency(this.summaryMetrics.totalAmount);

        // Update HOC transaction breakdown
        document.getElementById('hocCount').textContent = this.formatNumber(this.summaryMetrics.hocCount);
        document.getElementById('hocUniqueSerialCount').textContent = this.formatNumber(this.summaryMetrics.hocUniqueSerialCount);
        document.getElementById('hocAmount').textContent = this.formatCurrency(this.summaryMetrics.hocAmount);

        // Update HOC credit/debit breakdown
        document.getElementById('hocCreditCount').textContent = this.formatNumber(this.summaryMetrics.hocCreditCount);
        document.getElementById('hocCreditAmount').textContent = this.formatCurrency(this.summaryMetrics.hocCreditAmount);
        document.getElementById('hocDebitCount').textContent = this.formatNumber(this.summaryMetrics.hocDebitCount);
        document.getElementById('hocDebitAmount').textContent = this.formatCurrency(this.summaryMetrics.hocDebitAmount);

        // Update IBD transaction breakdown
        document.getElementById('ibdCount').textContent = this.formatNumber(this.summaryMetrics.ibdCount);
        document.getElementById('ibdUniqueSerialCount').textContent = this.formatNumber(this.summaryMetrics.ibdUniqueSerialCount);
        document.getElementById('ibdAmount').textContent = this.formatCurrency(this.summaryMetrics.ibdAmount);

        // Update IBD credit/debit breakdown
        document.getElementById('ibdCreditCount').textContent = this.formatNumber(this.summaryMetrics.ibdCreditCount);
        document.getElementById('ibdCreditAmount').textContent = this.formatCurrency(this.summaryMetrics.ibdCreditAmount);
        document.getElementById('ibdDebitCount').textContent = this.formatNumber(this.summaryMetrics.ibdDebitCount);
        document.getElementById('ibdDebitAmount').textContent = this.formatCurrency(this.summaryMetrics.ibdDebitAmount);

        // Update files processed count
        document.getElementById('filesProcessed').textContent = window.fileHandler ? window.fileHandler.files.length : 0;
    }

    // Format number with commas
    formatNumber(number) {
        // Ensure number is actually a number
        if (isNaN(number) || number === null || number === undefined) {
            return '0';
        }
        return Number(number).toLocaleString('en-US');
    }

    // Format currency with MMK symbol and 2 decimal places
    formatCurrency(amount) {
        // Ensure amount is actually a number
        if (isNaN(amount) || amount === null || amount === undefined) {
            return '0.00 MMK';
        }
        return Number(amount).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + ' MMK';
    }

    // Get the current filtered data
    getFilteredData() {
        return this.filteredData;
    }

    // Get the summary metrics
    getSummaryMetrics() {
        return this.summaryMetrics;
    }

    // Generate a unique file identifier
    generateFileId(file) {
        // Use filename and size as a unique identifier
        return `${file.name}_${file.size}`;
    }

    // Check if a file has already been processed
    isFileProcessed(file) {
        const fileId = this.generateFileId(file);
        return this.processedFiles.has(fileId);
    }

    // Mark a file as processed
    markFileAsProcessed(file) {
        const fileId = this.generateFileId(file);
        this.processedFiles.add(fileId);
        console.log(`File marked as processed: ${file.name} (ID: ${fileId})`);
        return fileId;
    }

    // Remove serial numbers associated with a file
    removeSerialNumbers(serialNumbers) {
        if (!serialNumbers || !serialNumbers.hoc || !serialNumbers.ibd) {
            console.warn('Invalid serial numbers provided for removal');
            return;
        }

        // Log the removal operation
        console.log(`Removing serial numbers - HOC: ${serialNumbers.hoc.size}, IBD: ${serialNumbers.ibd.size}`);

        // Store the counts before removal for logging
        const beforeHocCount = this.hocSerialNumbers.size;
        const beforeIbdCount = this.ibdSerialNumbers.size;
        const beforeTotalCount = this.allSerialNumbers.size;

        // Remove HOC serial numbers
        let hocRemoved = 0;
        serialNumbers.hoc.forEach(serialNo => {
            if (this.hocSerialNumbers.has(serialNo)) {
                this.hocSerialNumbers.delete(serialNo);
                hocRemoved++;
            }
            // Only remove from allSerialNumbers if it's not also in IBD
            if (!this.ibdSerialNumbers.has(serialNo)) {
                this.allSerialNumbers.delete(serialNo);
            }
        });

        // Remove IBD serial numbers
        let ibdRemoved = 0;
        serialNumbers.ibd.forEach(serialNo => {
            if (this.ibdSerialNumbers.has(serialNo)) {
                this.ibdSerialNumbers.delete(serialNo);
                ibdRemoved++;
            }
            // Only remove from allSerialNumbers if it's not also in HOC
            if (!this.hocSerialNumbers.has(serialNo)) {
                this.allSerialNumbers.delete(serialNo);
            }
        });

        // Update the unique serial counts in the metrics
        this.summaryMetrics.hocUniqueSerialCount = this.hocSerialNumbers.size;
        this.summaryMetrics.ibdUniqueSerialCount = this.ibdSerialNumbers.size;
        this.summaryMetrics.totalUniqueSerialCount = this.allSerialNumbers.size;

        console.log(`Serial numbers removed - HOC: ${hocRemoved}, IBD: ${ibdRemoved}`);
        console.log(`Updated unique serial counts - Before: HOC: ${beforeHocCount}, IBD: ${beforeIbdCount}, Total: ${beforeTotalCount}`);
        console.log(`Updated unique serial counts - After: HOC: ${this.summaryMetrics.hocUniqueSerialCount}, IBD: ${this.summaryMetrics.ibdUniqueSerialCount}, Total: ${this.summaryMetrics.totalUniqueSerialCount}`);

        // Update the UI with the updated metrics
        this.updateUI();

        // Update visualizations to reflect the new serial counts
        if (window.visualizer) {
            window.visualizer.updateCharts(this.summaryMetrics);
        }
    }

    // Get all processed file IDs
    getProcessedFileIds() {
        return Array.from(this.processedFiles);
    }

    // Get count of processed files
    getProcessedFilesCount() {
        return this.processedFiles.size;
    }

    // Update serial counts directly
    updateSerialCounts(hocCount, ibdCount, totalCount) {
        this.summaryMetrics.hocUniqueSerialCount = hocCount;
        this.summaryMetrics.ibdUniqueSerialCount = ibdCount;
        this.summaryMetrics.totalUniqueSerialCount = totalCount;

        console.log(`Updated unique serial counts - HOC: ${hocCount}, IBD: ${ibdCount}, Total: ${totalCount}`);

        // Update the UI with the updated metrics
        this.updateUI();

        // Update visualizations to reflect the new serial counts
        if (window.visualizer) {
            window.visualizer.updateCharts(this.summaryMetrics);
        }
    }

    // Fix transaction count without resetting accumulated metrics
    fixTransactionCount(totalTransactions, metricsUpdate = null) {
        // If we have specific metrics updates, apply them
        if (metricsUpdate) {
            // Log the fix operation
            console.log(`Fixing transaction count to ${totalTransactions} with metric updates`);

            // Update the transaction count
            this.summaryMetrics.totalTransactions = totalTransactions;

            // Apply any other metric updates if provided
            if (metricsUpdate.totalAmount !== undefined) {
                this.summaryMetrics.totalAmount = metricsUpdate.totalAmount;
            }
            if (metricsUpdate.hocCount !== undefined) {
                this.summaryMetrics.hocCount = metricsUpdate.hocCount;
            }
            if (metricsUpdate.ibdCount !== undefined) {
                this.summaryMetrics.ibdCount = metricsUpdate.ibdCount;
            }
            if (metricsUpdate.hocUniqueSerialCount !== undefined) {
                this.summaryMetrics.hocUniqueSerialCount = metricsUpdate.hocUniqueSerialCount;
            }
            if (metricsUpdate.ibdUniqueSerialCount !== undefined) {
                this.summaryMetrics.ibdUniqueSerialCount = metricsUpdate.ibdUniqueSerialCount;
            }
            if (metricsUpdate.totalUniqueSerialCount !== undefined) {
                this.summaryMetrics.totalUniqueSerialCount = metricsUpdate.totalUniqueSerialCount;
            }
        } else {
            // Just fix the transaction count
            console.log(`Fixing transaction count to ${totalTransactions}`);
            this.summaryMetrics.totalTransactions = totalTransactions;
        }

        // Update the UI with the fixed metrics
        this.updateUI();

        // Update visualizations
        if (window.visualizer) {
            window.visualizer.updateCharts(this.summaryMetrics);
        }

        // Log the fixed metrics
        console.log(`Transaction count fixed. Current count: ${this.summaryMetrics.totalTransactions}`);
    }
}

// Create a global instance of the DataProcessor
window.dataProcessor = new DataProcessor();
