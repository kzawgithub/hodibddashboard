/**
 * File Handler Module
 * Handles file uploads, chunked processing, and CSV parsing
 */

// FileHandler class to manage file uploads and processing
class FileHandler {
    constructor() {
        this.files = [];
        this.processedData = [];
        this.totalSize = 0;
        this.processedSize = 0;
        this.chunkSize = 512 * 1024; // 512KB chunks for better memory management
        this.isProcessing = false;
        this.worker = null;

        // Sets to track unique serial numbers
        this.hocSerialNumbers = new Set();
        this.ibdSerialNumbers = new Set();
        this.allSerialNumbers = new Set();

        // Map to track metrics per file
        this.fileMetrics = new Map();

        // Map to track serial numbers per file
        this.fileSerialNumbers = new Map();

        // Initialize web worker
        this.initWorker();

        // Initialize event listeners
        this.initEventListeners();
    }

    // Initialize web worker for background processing
    initWorker() {
        try {
            // Try to create a worker with different possible paths
            try {
                this.worker = new Worker('./csvWorker.js');
            } catch (e) {
                console.warn('Failed to load worker from ./csvWorker.js, trying alternative path');
                try {
                    this.worker = new Worker('csvWorker.js');
                } catch (e2) {
                    console.warn('Failed to load worker from csvWorker.js, disabling worker');
                    this.worker = null;
                    return;
                }
            }

            // Set up message handler
            this.worker.onmessage = (e) => {
                const { action, result, error } = e.data;

                if (action === 'chunkProcessed') {
                    // Update metrics with processed chunk
                    if (window.dataProcessor) {
                        window.dataProcessor.updateMetrics(result.metrics);
                    }

                    // Update table data
                    if (window.tableData) {
                        window.tableData.updateWithDateData(result.dateData);
                    }
                } else if (action === 'error') {
                    console.error('Worker error:', error);
                }
            };

            // Add error handler
            this.worker.onerror = (error) => {
                console.error('Worker error:', error);
                // Disable worker on error
                this.worker = null;
            };

            console.log('CSV processing worker initialized');
        } catch (error) {
            console.error('Failed to initialize worker:', error);
            this.worker = null;
        }
    }

    // Set up event listeners for file upload functionality
    initEventListeners() {
        const dropArea = document.getElementById('dropArea');
        const fileInput = document.getElementById('fileInput');
        const submitButton = document.getElementById('submitFiles');

        // File input change event
        fileInput.addEventListener('change', (e) => {
            this.selectFiles(e.target.files);
        });

        // Drag and drop events
        dropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropArea.classList.add('drag-over');
        });

        dropArea.addEventListener('dragleave', () => {
            dropArea.classList.remove('drag-over');
        });

        dropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dropArea.classList.remove('drag-over');

            if (e.dataTransfer.files.length > 0) {
                this.selectFiles(e.dataTransfer.files);
            }
        });

        // Click on drop area to trigger file input
        dropArea.addEventListener('click', () => {
            fileInput.click();
        });

        // Submit button click event
        submitButton.addEventListener('click', () => {
            this.processFiles();
        });
    }

    // Handle the selected files (without processing)
    selectFiles(fileList) {
        if (this.isProcessing) {
            alert('Please wait for the current files to finish processing.');
            return;
        }

        // Convert FileList to Array and filter for CSV files
        const newFiles = Array.from(fileList).filter(file => file.name.toLowerCase().endsWith('.csv'));

        if (newFiles.length === 0) {
            alert('Please select CSV files only.');
            return;
        }

        // Check for already processed files
        let alreadyProcessedCount = 0;
        const unprocessedFiles = [];

        newFiles.forEach(file => {
            if (window.dataProcessor && window.dataProcessor.isFileProcessed(file)) {
                alreadyProcessedCount++;
                // Still add to the list but mark as already processed
                file.isAlreadyProcessed = true;
                unprocessedFiles.push(file);
            } else {
                unprocessedFiles.push(file);
            }
        });

        // Add files to the list
        this.files = [...this.files, ...unprocessedFiles];
        this.updateFileList();

        // Show the submit button if files are selected and update its state
        this.updateSubmitButtonVisibility();

        // Show notification if some files were already processed
        if (alreadyProcessedCount > 0 && window.app) {
            window.app.showNotification(
                `${alreadyProcessedCount} file(s) have already been processed. They will be marked in the list.`,
                'info'
            );
        }

        // Show notification if new unprocessed files were added
        const hasUnprocessedFiles = this.hasUnprocessedFiles();
        if (hasUnprocessedFiles && window.app) {
            window.app.showNotification(
                'New unprocessed files detected. You can now click "Process Files" to process them.',
                'success'
            );
        }
    }

    // Check if there are any unprocessed files
    hasUnprocessedFiles() {
        // If no files, return false
        if (this.files.length === 0) return false;

        // Check if there are any files that are not processed and not removed
        return this.files.some(file => {
            const isProcessed = file.isAlreadyProcessed ||
                (window.dataProcessor && window.dataProcessor.isFileProcessed(file));
            return !isProcessed && !file.isRemoved;
        });
    }

    // Update the visibility and state of the submit button
    updateSubmitButtonVisibility() {
        const submitContainer = document.getElementById('submitContainer');
        const submitButton = document.getElementById('submitFiles');

        if (!submitContainer || !submitButton) return;

        // First determine if we should show the container at all
        submitContainer.style.display = this.files.length > 0 ? 'block' : 'none';

        // If no files, nothing more to do
        if (this.files.length === 0) return;

        // Check if there are any unprocessed files
        const hasUnprocessedFiles = this.hasUnprocessedFiles();

        // Create or get the message element
        let messageElement = document.getElementById('submitButtonMessage');
        if (!messageElement) {
            messageElement = document.createElement('div');
            messageElement.id = 'submitButtonMessage';
            messageElement.className = 'submit-button-message';
            submitContainer.appendChild(messageElement);
        }

        // Update button state and message
        if (hasUnprocessedFiles) {
            // Enable button and hide message
            submitButton.disabled = false;
            messageElement.style.display = 'none';
            submitButton.classList.remove('disabled-btn');
        } else {
            // Disable button and show message
            submitButton.disabled = true;
            messageElement.style.display = 'block';
            messageElement.textContent = 'All files have been processed. Upload new files to enable processing.';
            submitButton.classList.add('disabled-btn');
        }
    }

    // Update the UI with the list of files
    updateFileList() {
        const fileListElement = document.getElementById('uploadedFilesList');
        fileListElement.innerHTML = '';

        this.files.forEach((file, index) => {
            const listItem = document.createElement('li');

            // Check file status
            const isProcessed = file.isAlreadyProcessed ||
                (window.dataProcessor && window.dataProcessor.isFileProcessed(file));
            const isRemoved = file.isRemoved === true;

            // Add appropriate status class
            if (isRemoved) {
                listItem.classList.add('removed-file');
            } else if (isProcessed) {
                listItem.classList.add('processed-file');
            }

            // Create file item HTML with status indicator
            listItem.innerHTML = `
                <span class="file-name">${file.name} (${this.formatFileSize(file.size)})</span>
                ${isRemoved ? '<span class="file-status removed">Removed</span>' :
                  isProcessed ? '<span class="file-status processed">Processed</span>' : ''}
                <button class="remove-file" data-index="${index}">${isRemoved ? 'Delete' : 'Remove'}</button>
            `;
            fileListElement.appendChild(listItem);
        });

        // Add event listeners to remove buttons
        document.querySelectorAll('.remove-file').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event bubbling
                const index = parseInt(e.currentTarget.getAttribute('data-index'));
                const file = this.files[index];

                // Show confirmation dialog
                this.showConfirmationDialog(
                    file.isRemoved ?
                        `Permanently delete "${file.name}"?` :
                        `Remove "${file.name}" from dashboard?`,
                    file.isRemoved ?
                        'This will permanently delete the file from the list. This action cannot be undone.' :
                        'This will remove the file data from all metrics and visualizations. The file will remain in the list but marked as removed.',
                    () => this.removeFile(index)
                );
            });
        });
    }

    // Show confirmation dialog
    showConfirmationDialog(title, message, confirmCallback) {
        const dialog = document.getElementById('confirmationDialog');
        const messageElement = document.getElementById('confirmationMessage');
        const titleElement = dialog.querySelector('.confirmation-title');
        const confirmBtn = document.getElementById('confirmBtn');
        const cancelBtn = document.getElementById('cancelBtn');

        // Set dialog content
        titleElement.textContent = title;
        messageElement.textContent = message;

        // Show dialog
        dialog.classList.add('show');

        // Set up event listeners
        const handleConfirm = () => {
            dialog.classList.remove('show');
            confirmCallback();
            // Clean up event listeners
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };

        const handleCancel = () => {
            dialog.classList.remove('show');
            // Clean up event listeners
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };

        // Add event listeners
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
    }

    // Remove a file from the list and update the dashboard
    removeFile(index) {
        if (this.isProcessing) {
            if (window.app) {
                window.app.showNotification('Cannot remove files while processing.', 'error');
            } else {
                alert('Cannot remove files while processing.');
            }
            return;
        }

        // Get the file before removing it
        const file = this.files[index];
        const fileName = file.name;

        // Check if the file is already marked as removed
        if (file.isRemoved) {
            // Permanently delete the file
            this.files.splice(index, 1);

            // Update the file list UI
            this.updateFileList();

            // Update submit button visibility
            this.updateSubmitButtonVisibility();

            // Show notification
            if (window.app) {
                window.app.showNotification(`File "${fileName}" permanently deleted.`, 'warning');
            }

            console.log(`File permanently deleted: ${fileName}`);
            return;
        }

        // Mark the file as removed instead of actually removing it
        file.isRemoved = true;

        // Get the file metrics and serial numbers before removing from processed data
        const fileMetrics = this.fileMetrics.get(fileName);
        const fileSerialNumbers = this.fileSerialNumbers.get(fileName);

        // Log the file metrics and serial numbers being removed
        if (fileMetrics) {
            console.log(`File metrics being removed for ${fileName}:`, fileMetrics);
        }

        if (fileSerialNumbers) {
            console.log(`File serial numbers being removed - HOC: ${fileSerialNumbers.hoc.size}, IBD: ${fileSerialNumbers.ibd.size}`);

            // Remove the serial numbers from the data processor
            if (window.dataProcessor) {
                window.dataProcessor.removeSerialNumbers(fileSerialNumbers);
            }
        }

        // Remove the file data from processedData array
        const fileDataIndex = this.processedData.findIndex(item => item.fileName === fileName);
        if (fileDataIndex !== -1) {
            this.processedData.splice(fileDataIndex, 1);
        }

        console.log(`File marked as removed: ${fileName}`);

        // Update the file list UI to show the removed status
        this.updateFileList();

        // Update submit button visibility
        this.updateSubmitButtonVisibility();

        // Update the dashboard with the remaining data
        this.updateDashboardAfterRemoval();

        // Show notification
        if (window.app) {
            window.app.showNotification(`File "${fileName}" removed. Dashboard updated to exclude its data.`, 'warning');
        }
    }

    // Update dashboard after file removal
    updateDashboardAfterRemoval() {
        // Count active (non-removed) files
        const activeFiles = this.files.filter(file => !file.isRemoved);

        // If no active files remain, reset the dashboard
        if (activeFiles.length === 0) {
            this.resetDashboard();
            return;
        }

        // For a more accurate approach, we'll recalculate metrics from scratch
        // based on the remaining active files

        // First, reset the data processor's metrics and serial number sets
        if (window.dataProcessor) {
            window.dataProcessor.resetMetrics();

            // Reset our local serial number sets too
            this.hocSerialNumbers.clear();
            this.ibdSerialNumbers.clear();
            this.allSerialNumbers.clear();

            console.log(`Recalculating metrics for ${activeFiles.length} active files`);

            // Re-add metrics for each active file
            activeFiles.forEach(file => {
                const fileName = file.name;
                const fileMetrics = this.fileMetrics.get(fileName);
                const fileSerialNumbers = this.fileSerialNumbers.get(fileName);

                if (fileMetrics) {
                    // Create a deep copy of the metrics to avoid reference issues
                    const metricsCopy = JSON.parse(JSON.stringify(fileMetrics));
                    console.log(`Re-adding metrics for file: ${fileName}`, metricsCopy);
                    window.dataProcessor.updateMetrics(metricsCopy);
                }

                if (fileSerialNumbers) {
                    console.log(`Re-adding serial numbers for file: ${fileName}`);

                    // Add HOC serial numbers
                    fileSerialNumbers.hoc.forEach(serialNo => {
                        this.hocSerialNumbers.add(serialNo);
                        this.allSerialNumbers.add(serialNo);
                    });

                    // Add IBD serial numbers
                    fileSerialNumbers.ibd.forEach(serialNo => {
                        this.ibdSerialNumbers.add(serialNo);
                        this.allSerialNumbers.add(serialNo);
                    });
                }
            });

            // Update the unique serial counts in the data processor
            const hocSize = this.hocSerialNumbers.size;
            const ibdSize = this.ibdSerialNumbers.size;
            const totalSize = this.allSerialNumbers.size;

            console.log(`Updating serial counts after recalculation - HOC: ${hocSize}, IBD: ${ibdSize}, Total: ${totalSize}`);

            window.dataProcessor.updateSerialCounts(
                hocSize,
                ibdSize,
                totalSize
            );
        }

        // Update the files processed count
        const filesProcessedElement = document.getElementById('filesProcessed');
        if (filesProcessedElement) {
            const uniqueProcessedCount = window.dataProcessor ?
                window.dataProcessor.getProcessedFilesCount() : 0;

            filesProcessedElement.textContent = `${activeFiles.length} active (${uniqueProcessedCount} unique)`;
        }

        // Update visualizations to reflect the new data
        if (window.visualizer && window.dataProcessor) {
            window.visualizer.updateCharts(window.dataProcessor.getSummaryMetrics());
        }

        // Update table data to reflect the removed file
        if (window.tableData) {
            window.tableData.finalizeProcessing();
        }

        // Log the current state after removal
        if (window.dataProcessor) {
            const metrics = window.dataProcessor.getSummaryMetrics();
            console.log('Dashboard state after file removal:', {
                totalTransactions: metrics.totalTransactions,
                hocCount: metrics.hocCount,
                ibdCount: metrics.ibdCount,
                hocUniqueSerialCount: metrics.hocUniqueSerialCount,
                ibdUniqueSerialCount: metrics.ibdUniqueSerialCount
            });
        }
    }

    // Reset dashboard to empty state
    resetDashboard() {
        // Update files processed count
        document.getElementById('filesProcessed').textContent = '0';

        // Reset unique serial number sets
        this.hocSerialNumbers.clear();
        this.ibdSerialNumbers.clear();
        this.allSerialNumbers.clear();

        // Clear file metrics and serial numbers maps
        this.fileMetrics.clear();
        this.fileSerialNumbers.clear();

        // Clear processed data array
        this.processedData = [];

        // Reset data processor with empty array
        if (window.dataProcessor) {
            // Clear the processed files tracking
            window.dataProcessor.processedFiles.clear();
            window.dataProcessor.processData([]);
        }

        // Reset visualizer charts
        if (window.visualizer) {
            window.visualizer.resetCharts();
        }

        // Reset table data
        if (window.tableData) {
            window.tableData.resetTable();
        }

        // Show notification about reset
        if (window.app) {
            window.app.showNotification('Dashboard reset. All file tracking has been cleared.', 'info');
        }

        console.log('Dashboard reset to empty state. File tracking cleared.');
    }

    // Format file size for display
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Process all files in chunks with memory optimization
    async processFiles() {
        if (this.files.length === 0 || this.isProcessing) return;

        this.isProcessing = true;
        this.processedData = [];

        // Filter out already processed files
        const filesToProcess = this.files.filter(file => {
            return !(window.dataProcessor && window.dataProcessor.isFileProcessed(file));
        });

        // Calculate total size of files to process
        this.totalSize = filesToProcess.reduce((total, file) => total + file.size, 0);
        this.processedSize = 0;

        // Count of already processed files
        const alreadyProcessedCount = this.files.length - filesToProcess.length;

        // Show progress UI
        const progressElement = document.getElementById('uploadProgress');
        progressElement.style.display = 'block';

        // If all files are already processed, show notification and return
        if (filesToProcess.length === 0) {
            if (window.app) {
                window.app.showNotification(
                    `All ${alreadyProcessedCount} file(s) have already been processed. No new data to process.`,
                    'info'
                );
            }

            // Update the file list to refresh status indicators
            this.updateFileList();

            // Hide progress UI
            progressElement.style.display = 'none';
            this.isProcessing = false;
            return;
        }

        try {
            // Process files sequentially to reduce memory pressure
            for (const file of filesToProcess) {
                // Show file-specific progress
                document.getElementById('progressText').textContent = `Processing file: ${file.name}`;

                // Process file and immediately aggregate metrics
                await this.processFileWithMemoryOptimization(file);

                // Mark file as processed after successful processing
                if (window.dataProcessor) {
                    window.dataProcessor.markFileAsProcessed(file);
                }

                // Force garbage collection if possible
                if (window.gc) {
                    window.gc();
                } else {
                    // Attempt to trigger garbage collection indirectly
                    const arr = new Array(100).fill('x').map(() => new Array(1000000).join('x'));
                    arr.length = 0;
                }
            }

            // Calculate total processed rows
            const totalProcessedRows = this.processedData.reduce((total, file) => {
                return total + (file.processedRowCount || 0);
            }, 0);

            // Update UI with processed data
            this.updateDashboard();

            // Ensure the final transaction count is accurate
            if (window.dataProcessor) {
                const currentMetrics = window.dataProcessor.getSummaryMetrics();

                // Update metrics with unique serial counts
                const metricsUpdate = {
                    hocUniqueSerialCount: this.hocSerialNumbers.size,
                    ibdUniqueSerialCount: this.ibdSerialNumbers.size,
                    totalUniqueSerialCount: this.allSerialNumbers ? this.allSerialNumbers.size :
                        (this.hocSerialNumbers.size + this.ibdSerialNumbers.size)
                };

                if (currentMetrics.totalTransactions < totalProcessedRows) {
                    console.log(`Final transaction count fix: ${currentMetrics.totalTransactions} → ${totalProcessedRows}`);
                    console.log(`Unique serial counts - HOC: ${metricsUpdate.hocUniqueSerialCount}, IBD+WU: ${metricsUpdate.ibdUniqueSerialCount}, Total across all types: ${metricsUpdate.totalUniqueSerialCount}`);
                    window.dataProcessor.fixTransactionCount(totalProcessedRows, metricsUpdate);
                } else {
                    // Just update the unique serial counts
                    window.dataProcessor.updateMetrics(metricsUpdate);
                }
            }

            // Show success message
            if (window.app) {
                window.app.showNotification(`Successfully processed ${this.files.length} files with ${totalProcessedRows} transactions`, 'success');
            }

        } catch (error) {
            console.error('Error processing files:', error);
            alert('An error occurred while processing the files. Please try again.');
        } finally {
            this.isProcessing = false;

            // Hide progress UI after a short delay
            setTimeout(() => {
                progressElement.style.display = 'none';

                // Update the submit button state after processing
                this.updateSubmitButtonVisibility();
            }, 1000);
        }
    }

    // Process a file with memory optimization using Web Worker if available
    async processFileWithMemoryOptimization(file) {
        return new Promise((resolve, reject) => {
            // Store file data for reference
            const fileData = {
                fileName: file.name,
                rowCount: 0,
                sampleRows: [], // Keep a few sample rows for display purposes
                processedRowCount: 0 // Track actual processed rows for debugging
            };

            // Set up streaming with smaller chunks for better memory management
            const CHUNK_SIZE = 512 * 1024; // 512KB chunks
            const reader = new FileReader();
            let offset = 0;
            let header = null;
            let lastPartialLine = '';

            // Function to read the next chunk
            const readNextChunk = () => {
                const slice = file.slice(offset, offset + CHUNK_SIZE);
                reader.readAsText(slice);
            };

            // Handle chunk load
            reader.onload = (e) => {
                try {
                    // Process the chunk
                    const chunk = e.target.result;

                    // Combine with any partial line from previous chunk
                    const combinedText = lastPartialLine + chunk;

                    // Split into lines, but handle the last line carefully
                    const lines = combinedText.split('\n');

                    // The last line might be incomplete if we're not at the end of the file
                    if (offset + CHUNK_SIZE < file.size) {
                        lastPartialLine = lines.pop() || '';
                    } else {
                        lastPartialLine = '';
                    }

                    // If this is the first chunk, extract the header
                    const isFirstChunk = offset === 0;
                    if (isFirstChunk) {
                        header = this.parseCSVLine(lines[0]);
                        console.log(`File header: ${header.join(', ')}`);
                    }

                    // Count valid lines in this chunk (for debugging)
                    let validLinesInChunk = 0;

                    // Process the chunk using Web Worker if available
                    if (this.worker) {
                        // Process sample rows for display regardless of worker
                        if (isFirstChunk && lines.length > 1) {
                            // Get a few sample rows for reference
                            for (let i = 1; i < Math.min(10, lines.length); i++) {
                                if (lines[i].trim() !== '') {
                                    const rowData = this.parseCSVLine(lines[i]);
                                    if (rowData.length >= header.length) {
                                        const rowObject = {};
                                        header.forEach((key, index) => {
                                            rowObject[key] = rowData[index] || '';
                                        });
                                        if (rowObject.REPORTTYPE) {
                                            fileData.sampleRows.push(rowObject);
                                        }
                                    }
                                }
                            }
                        }

                        // Process the chunk in the main thread to ensure data is processed
                        const processedRows = this.processChunkInMainThread(lines, header, isFirstChunk, fileData);
                        validLinesInChunk += processedRows;

                        // Also send to worker for parallel processing
                        try {
                            this.worker.postMessage({
                                action: 'processChunk',
                                data: {
                                    chunk: combinedText,
                                    header: header,
                                    isFirstChunk: isFirstChunk
                                }
                            });
                        } catch (workerError) {
                            console.error('Error sending data to worker:', workerError);
                            // Worker failed, but we already processed in main thread so we can continue
                        }
                    } else {
                        // Fallback to processing in the main thread if worker is not available
                        const processedRows = this.processChunkInMainThread(lines, header, isFirstChunk, fileData);
                        validLinesInChunk += processedRows;
                    }

                    // Update row count with actual processed rows
                    fileData.rowCount += lines.length - (isFirstChunk ? 1 : 0);
                    fileData.processedRowCount += validLinesInChunk;

                    // Update progress
                    offset += CHUNK_SIZE;
                    this.processedSize += chunk.length;
                    this.updateProgress();

                    // Check if there's more to read
                    if (offset < file.size) {
                        // Use setTimeout to prevent call stack overflow and allow GC
                        setTimeout(readNextChunk, 0);
                    } else {
                        // Store processed data with accurate counts
                        this.processedData.push({
                            fileName: fileData.fileName,
                            rowCount: fileData.rowCount,
                            processedRowCount: fileData.processedRowCount,
                            sampleRows: fileData.sampleRows
                        });

                        // Store metrics for this file
                        if (window.dataProcessor) {
                            // Get metrics before and after processing this file to calculate the difference
                            const currentMetrics = window.dataProcessor.getSummaryMetrics();

                            // Create metrics object that represents only this file's contribution
                            const fileMetrics = {
                                totalTransactions: fileData.processedRowCount,
                                totalAmount: 0, // Will be calculated from the file's data
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
                                currencyCounts: {
                                    USD: 0,
                                    MMK: 0
                                },
                                currencyAmounts: {
                                    USD: 0,
                                    MMK: 0
                                }
                            };

                            // Calculate metrics from the file's sample rows
                            if (fileData.sampleRows && fileData.sampleRows.length > 0) {
                                // Create temporary sets to track unique serial numbers for this file only
                                const fileHocSerialNumbers = new Set();
                                const fileIbdSerialNumbers = new Set();

                                // Process each sample row to calculate metrics
                                fileData.sampleRows.forEach(row => {
                                    // Helper function to safely add numeric values
                                    const safeAdd = (a, b) => {
                                        const numA = typeof a === 'number' && !isNaN(a) ? a : 0;
                                        const numB = typeof b === 'number' && !isNaN(b) ? b : 0;
                                        return numA + numB;
                                    };

                                    // Get amount
                                    const amount = typeof row.TRANSACTION_AMOUNT === 'string' ?
                                        parseFloat(row.TRANSACTION_AMOUNT) || 0 :
                                        (typeof row.TRANSACTION_AMOUNT === 'number' ? row.TRANSACTION_AMOUNT : 0);

                                    // Determine if credit or debit
                                    const isCredit = row.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'C';
                                    const isDebit = row.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'D';

                                    // Get serial number
                                    const serialNo = row.SERIAL_NO || '';

                                    // Update total amount
                                    fileMetrics.totalAmount = safeAdd(fileMetrics.totalAmount, amount);

                                    // Update metrics based on report type
                                    if (row.REPORTTYPE === 'HOC') {
                                        fileMetrics.hocCount++;
                                        fileMetrics.hocAmount = safeAdd(fileMetrics.hocAmount, amount);

                                        // Track serial number
                                        if (serialNo) {
                                            fileHocSerialNumbers.add(serialNo);
                                        }

                                        // Update credit/debit counts
                                        if (isCredit) {
                                            fileMetrics.hocCreditCount++;
                                            fileMetrics.hocCreditAmount = safeAdd(fileMetrics.hocCreditAmount, amount);
                                        } else if (isDebit) {
                                            fileMetrics.hocDebitCount++;
                                            fileMetrics.hocDebitAmount = safeAdd(fileMetrics.hocDebitAmount, amount);
                                        }
                                    } else if (row.REPORTTYPE === 'IBD') {
                                        fileMetrics.ibdCount++;
                                        fileMetrics.ibdAmount = safeAdd(fileMetrics.ibdAmount, amount);

                                        // Track serial number
                                        if (serialNo) {
                                            fileIbdSerialNumbers.add(serialNo);
                                        }

                                        // Update credit/debit counts
                                        if (isCredit) {
                                            fileMetrics.ibdCreditCount++;
                                            fileMetrics.ibdCreditAmount = safeAdd(fileMetrics.ibdCreditAmount, amount);
                                        } else if (isDebit) {
                                            fileMetrics.ibdDebitCount++;
                                            fileMetrics.ibdDebitAmount = safeAdd(fileMetrics.ibdDebitAmount, amount);
                                        }
                                    } else if (row.REPORTTYPE === 'WU') {
                                        // For WU transactions, track serial numbers for IBD
                                        if (serialNo) {
                                            fileIbdSerialNumbers.add(serialNo);
                                        }
                                    }

                                    // Update currency counts
                                    if (row.TRANSACTION_CURRENCY === 'USD') {
                                        fileMetrics.currencyCounts.USD++;
                                        fileMetrics.currencyAmounts.USD = safeAdd(fileMetrics.currencyAmounts.USD, amount);
                                    } else if (row.TRANSACTION_CURRENCY === 'MMK') {
                                        fileMetrics.currencyCounts.MMK++;
                                        fileMetrics.currencyAmounts.MMK = safeAdd(fileMetrics.currencyAmounts.MMK, amount);
                                    }
                                });

                                // Scale metrics based on the ratio of total rows to sample rows
                                const scaleFactor = fileData.processedRowCount / fileData.sampleRows.length;

                                // Scale all count metrics (except serial numbers which are handled separately)
                                fileMetrics.hocCount = Math.round(fileMetrics.hocCount * scaleFactor);
                                fileMetrics.hocCreditCount = Math.round(fileMetrics.hocCreditCount * scaleFactor);
                                fileMetrics.hocDebitCount = Math.round(fileMetrics.hocDebitCount * scaleFactor);
                                fileMetrics.ibdCount = Math.round(fileMetrics.ibdCount * scaleFactor);
                                fileMetrics.ibdCreditCount = Math.round(fileMetrics.ibdCreditCount * scaleFactor);
                                fileMetrics.ibdDebitCount = Math.round(fileMetrics.ibdDebitCount * scaleFactor);
                                fileMetrics.currencyCounts.USD = Math.round(fileMetrics.currencyCounts.USD * scaleFactor);
                                fileMetrics.currencyCounts.MMK = Math.round(fileMetrics.currencyCounts.MMK * scaleFactor);

                                // Scale all amount metrics
                                fileMetrics.totalAmount *= scaleFactor;
                                fileMetrics.hocAmount *= scaleFactor;
                                fileMetrics.hocCreditAmount *= scaleFactor;
                                fileMetrics.hocDebitAmount *= scaleFactor;
                                fileMetrics.ibdAmount *= scaleFactor;
                                fileMetrics.ibdCreditAmount *= scaleFactor;
                                fileMetrics.ibdDebitAmount *= scaleFactor;
                                fileMetrics.currencyAmounts.USD *= scaleFactor;
                                fileMetrics.currencyAmounts.MMK *= scaleFactor;

                                // Store the metrics for this file
                                this.fileMetrics.set(file.name, fileMetrics);

                                // Store only the serial numbers that came from this file
                                this.fileSerialNumbers.set(file.name, {
                                    hoc: fileHocSerialNumbers,
                                    ibd: fileIbdSerialNumbers
                                });
                            } else {
                                // If no sample rows, use proportional estimation based on total metrics
                                // This is a fallback method that's less accurate
                                const totalFiles = this.processedData.length;
                                if (totalFiles > 0 && currentMetrics.totalTransactions > 0) {
                                    const proportion = fileData.processedRowCount / currentMetrics.totalTransactions;

                                    // Scale all metrics by the proportion
                                    fileMetrics.totalAmount = currentMetrics.totalAmount * proportion;
                                    fileMetrics.hocCount = Math.round(currentMetrics.hocCount * proportion);
                                    fileMetrics.hocAmount = currentMetrics.hocAmount * proportion;
                                    fileMetrics.hocCreditCount = Math.round(currentMetrics.hocCreditCount * proportion);
                                    fileMetrics.hocCreditAmount = currentMetrics.hocCreditAmount * proportion;
                                    fileMetrics.hocDebitCount = Math.round(currentMetrics.hocDebitCount * proportion);
                                    fileMetrics.hocDebitAmount = currentMetrics.hocDebitAmount * proportion;
                                    fileMetrics.ibdCount = Math.round(currentMetrics.ibdCount * proportion);
                                    fileMetrics.ibdAmount = currentMetrics.ibdAmount * proportion;
                                    fileMetrics.ibdCreditCount = Math.round(currentMetrics.ibdCreditCount * proportion);
                                    fileMetrics.ibdCreditAmount = currentMetrics.ibdCreditAmount * proportion;
                                    fileMetrics.ibdDebitCount = Math.round(currentMetrics.ibdDebitCount * proportion);
                                    fileMetrics.ibdDebitAmount = currentMetrics.ibdDebitAmount * proportion;
                                    fileMetrics.currencyCounts.USD = Math.round(currentMetrics.currencyCounts.USD * proportion);
                                    fileMetrics.currencyCounts.MMK = Math.round(currentMetrics.currencyCounts.MMK * proportion);
                                    fileMetrics.currencyAmounts.USD = currentMetrics.currencyAmounts.USD * proportion;
                                    fileMetrics.currencyAmounts.MMK = currentMetrics.currencyAmounts.MMK * proportion;
                                }

                                // Store the metrics for this file
                                this.fileMetrics.set(file.name, fileMetrics);

                                // Create empty sets for serial numbers since we don't have sample data
                                this.fileSerialNumbers.set(file.name, {
                                    hoc: new Set(),
                                    ibd: new Set()
                                });
                            }

                            console.log(`Stored metrics for file: ${file.name}`);
                        }

                        console.log(`File ${fileData.fileName} processed: ${fileData.processedRowCount} valid rows out of ${fileData.rowCount} total rows`);

                        // Ensure the transaction count is accurate in the UI
                        if (window.dataProcessor) {
                            const currentMetrics = window.dataProcessor.getSummaryMetrics();
                            const totalProcessedRows = this.processedData.reduce((total, file) => {
                                return total + (file.processedRowCount || 0);
                            }, 0);

                            // If the current transaction count is less than the total processed rows,
                            // update it to reflect the actual count
                            if (currentMetrics.totalTransactions < totalProcessedRows) {
                                console.log(`Updating transaction count during file processing: ${currentMetrics.totalTransactions} → ${totalProcessedRows}`);
                                window.dataProcessor.fixTransactionCount(totalProcessedRows);
                            }
                        }

                        resolve();
                    }
                } catch (error) {
                    console.error('Error processing chunk:', error);
                    reject(error);
                }
            };

            // Handle errors
            reader.onerror = (error) => {
                reject(new Error(`Error reading file: ${file.name} - ${error}`));
            };

            // Start reading the first chunk
            readNextChunk();
        });
    }

    // Process a chunk in the main thread (fallback if worker is not available)
    processChunkInMainThread(lines, header, isFirstChunk, fileData) {
        // Create temporary metrics for this chunk
        const chunkMetrics = {
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
            currencyCounts: {
                USD: 0,
                MMK: 0
            },
            currencyAmounts: {
                USD: 0,
                MMK: 0
            }
        };

        // We don't need to track serial numbers here as they're tracked at the class level

        // Temporary date data for this chunk
        const dateData = {};

        // Start processing from line 1 if this is the first chunk (skip header)
        const startIndex = isFirstChunk ? 1 : 0;

        // Count of valid rows processed in this chunk
        let validRowsProcessed = 0;

        // Process each line in the chunk
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '') continue;

            const rowData = this.parseCSVLine(line);

            // Only process rows that have enough data
            if (rowData.length >= header.length) {
                // Create an object with all fields for accurate processing
                const rowObject = {};
                header.forEach((key, index) => {
                    rowObject[key] = rowData[index] || '';
                });

                // Only process rows that have a REPORTTYPE value
                if (rowObject.REPORTTYPE) {
                    // Increment valid row counter
                    validRowsProcessed++;

                    // Keep sample rows for reference (increased to 10 for better representation)
                    if (fileData.sampleRows.length < 10 && Math.random() < 0.5) {
                        fileData.sampleRows.push(rowObject);
                    }

                    // Process metrics directly instead of storing the row
                    this.updateMetricsWithRow(rowObject, chunkMetrics);

                    // Update date-based aggregation for table
                    this.updateDateData(rowObject, dateData);
                }
            }
        }

        // Log chunk processing statistics
        if (validRowsProcessed > 0) {
            console.log(`Processed chunk with ${validRowsProcessed} valid transactions`);
        }

        // Update global metrics with this chunk's metrics
        this.updateGlobalMetrics(chunkMetrics);

        // Update table data with date aggregation
        this.updateTableData(dateData);

        // Return the count of valid rows processed
        return validRowsProcessed;
    }

    // Update metrics directly with a row instead of storing all rows
    updateMetricsWithRow(row, metrics) {
        // Helper function to safely add numeric values
        const safeAdd = (a, b) => {
            const numA = typeof a === 'number' && !isNaN(a) ? a : 0;
            const numB = typeof b === 'number' && !isNaN(b) ? b : 0;
            return numA + numB;
        };

        // Ensure amount is a number with proper validation
        const amount = typeof row.TRANSACTION_AMOUNT === 'string' ?
            parseFloat(row.TRANSACTION_AMOUNT) || 0 :
            (typeof row.TRANSACTION_AMOUNT === 'number' ? row.TRANSACTION_AMOUNT : 0);

        // Update total counts
        metrics.totalTransactions++;
        metrics.totalAmount = safeAdd(metrics.totalAmount, amount);

        // Determine if this is a credit or debit transaction
        const isCredit = row.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'C';
        const isDebit = row.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'D';

        // Get the serial number (with error handling)
        const serialNo = row.SERIAL_NO || '';

        // Update report type counts
        if (row.REPORTTYPE === 'HOC') {
            metrics.hocCount++;
            metrics.hocAmount = safeAdd(metrics.hocAmount, amount);

            // Track unique serial numbers for HOC
            if (serialNo && this.hocSerialNumbers) {
                this.hocSerialNumbers.add(serialNo);
                this.allSerialNumbers.add(serialNo);
            }

            // Update HOC credit/debit counts
            if (isCredit) {
                metrics.hocCreditCount++;
                metrics.hocCreditAmount = safeAdd(metrics.hocCreditAmount, amount);
            } else if (isDebit) {
                metrics.hocDebitCount++;
                metrics.hocDebitAmount = safeAdd(metrics.hocDebitAmount, amount);
            }
        } else if (row.REPORTTYPE === 'IBD') {
            metrics.ibdCount++;
            metrics.ibdAmount = safeAdd(metrics.ibdAmount, amount);

            // Track unique serial numbers for IBD
            if (serialNo && this.ibdSerialNumbers) {
                this.ibdSerialNumbers.add(serialNo);
                this.allSerialNumbers.add(serialNo);
            }

            // Update IBD credit/debit counts
            if (isCredit) {
                metrics.ibdCreditCount++;
                metrics.ibdCreditAmount = safeAdd(metrics.ibdCreditAmount, amount);
            } else if (isDebit) {
                metrics.ibdDebitCount++;
                metrics.ibdDebitAmount = safeAdd(metrics.ibdDebitAmount, amount);
            }
        } else if (row.REPORTTYPE === 'WU') {
            // For WU transactions, only track unique serial numbers for IBD count
            // but don't include in other IBD metrics
            if (serialNo && this.ibdSerialNumbers) {
                this.ibdSerialNumbers.add(serialNo);
                this.allSerialNumbers.add(serialNo);
            }
        }

        // Update currency counts
        if (row.TRANSACTION_CURRENCY === 'USD') {
            metrics.currencyCounts.USD++;
            metrics.currencyAmounts.USD = safeAdd(metrics.currencyAmounts.USD, amount);
        } else if (row.TRANSACTION_CURRENCY === 'MMK') {
            metrics.currencyCounts.MMK++;
            metrics.currencyAmounts.MMK = safeAdd(metrics.currencyAmounts.MMK, amount);
        }
    }

    // Update date-based aggregation for table
    updateDateData(row, dateData) {
        // Extract date from transaction date using a standardized approach
        let date = 'Unknown';
        if (row.TRANSACTION_DATE) {
            try {
                // Extract just the date part if there's a space (time component)
                let dateStr = row.TRANSACTION_DATE;
                if (dateStr.includes(' ')) {
                    dateStr = dateStr.split(' ')[0];
                }

                // Format: "26-JAN-25" (DD-MMM-YY)
                if (/^\d{2}-[A-Z]{3}-\d{2}$/.test(dateStr)) {
                    date = dateStr;
                }
                // Format: "2023-01-01" (ISO format YYYY-MM-DD)
                else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    // Convert to DD-MMM-YY format for consistency
                    const dateObj = new Date(dateStr);
                    if (!isNaN(dateObj.getTime())) {
                        date = dateObj.toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: '2-digit'
                        }).replace(/ /g, '-').toUpperCase();
                    } else {
                        date = dateStr;
                    }
                }
                // Try to parse as date if it's in another format
                else {
                    const dateObj = new Date(dateStr);
                    if (!isNaN(dateObj.getTime())) {
                        date = dateObj.toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: '2-digit'
                        }).replace(/ /g, '-').toUpperCase();
                    } else {
                        date = dateStr;
                    }
                }
            } catch (error) {
                console.error('Error parsing date:', error);
                date = 'Unknown';
            }
        }

        // Initialize date entry if it doesn't exist
        if (!dateData[date]) {
            dateData[date] = {
                hocCreditCount: 0,
                hocCreditAmount: 0,
                hocDebitCount: 0,
                hocDebitAmount: 0,
                ibdCreditCount: 0,
                ibdCreditAmount: 0,
                ibdDebitCount: 0,
                ibdDebitAmount: 0
            };
        }

        // Get transaction amount as number with validation
        const amount = typeof row.TRANSACTION_AMOUNT === 'string' ?
            parseFloat(row.TRANSACTION_AMOUNT) || 0 :
            (typeof row.TRANSACTION_AMOUNT === 'number' ? row.TRANSACTION_AMOUNT : 0);

        // Determine transaction type
        const isCredit = row.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'C';
        const isDebit = row.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'D';

        // Update counts and amounts based on transaction type
        if (row.REPORTTYPE === 'HOC') {
            if (isCredit) {
                dateData[date].hocCreditCount++;
                dateData[date].hocCreditAmount += amount;
            } else if (isDebit) {
                dateData[date].hocDebitCount++;
                dateData[date].hocDebitAmount += amount;
            }
        } else if (row.REPORTTYPE === 'IBD') {
            if (isCredit) {
                dateData[date].ibdCreditCount++;
                dateData[date].ibdCreditAmount += amount;
            } else if (isDebit) {
                dateData[date].ibdDebitCount++;
                dateData[date].ibdDebitAmount += amount;
            }
        }
    }

    // Update global metrics with a file's metrics
    updateGlobalMetrics(fileMetrics) {
        // If we have a data processor, update it with the metrics
        if (window.dataProcessor) {
            // Log metrics being added for debugging
            if (fileMetrics.totalTransactions > 0) {
                console.log(`Adding metrics: ${fileMetrics.totalTransactions} transactions (HOC: ${fileMetrics.hocCount}, IBD: ${fileMetrics.ibdCount})`);
            }

            window.dataProcessor.updateMetrics(fileMetrics);

            // Log current metrics after update
            const currentMetrics = window.dataProcessor.getSummaryMetrics();
            console.log(`Current total metrics: ${currentMetrics.totalTransactions} transactions`);
        }
    }

    // Update table data with date aggregation
    updateTableData(dateData) {
        // If we have a table data processor, update it with the date data
        if (window.tableData) {
            window.tableData.updateWithDateData(dateData);
        }
    }

    // Legacy method for backward compatibility
    async processFileInChunks(file) {
        console.warn('Using legacy processFileInChunks method - consider upgrading to memory-optimized version');
        return this.processFileWithMemoryOptimization(file).then(() => {
            // Return empty array to maintain compatibility
            return [];
        });
    }

    // Parse a CSV line into an array of values
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        // Add the last field
        result.push(current.trim());

        return result;
    }

    // Update progress UI
    updateProgress() {
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');

        const percentage = Math.min(100, Math.round((this.processedSize / this.totalSize) * 100));

        progressBar.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}% - Processing files...`;
    }

    // Get all processed data
    getAllData() {
        return this.processedData;
    }

    // Update dashboard with processed data
    updateDashboard() {
        // Count active (non-removed) files
        const activeFiles = this.files.filter(file => !file.isRemoved);

        // Update files processed count with validation
        const filesProcessedElement = document.getElementById('filesProcessed');
        if (filesProcessedElement) {
            // Show both active files and total unique processed files
            const uniqueProcessedCount = window.dataProcessor ?
                window.dataProcessor.getProcessedFilesCount() : 0;

            // Update the display to show both counts
            filesProcessedElement.textContent = `${activeFiles.length} active (${uniqueProcessedCount} unique)`;
        }

        // Calculate total rows processed across all files
        const totalRowsProcessed = this.processedData.reduce((total, file) => {
            return total + (file.processedRowCount || 0);
        }, 0);

        // Log detailed processing information
        console.log(`Dashboard updated with ${activeFiles.length} active files out of ${this.files.length} total files containing approximately ${totalRowsProcessed} transactions`);

        // Update the file list to refresh status indicators
        this.updateFileList();

        // If we have a data processor, ensure the transaction count is accurate
        if (window.dataProcessor) {
            // Get current metrics
            const currentMetrics = window.dataProcessor.getSummaryMetrics();

            // Check if we need to update the transaction count
            if (currentMetrics.totalTransactions < totalRowsProcessed) {
                console.log(`Fixing transaction count: ${currentMetrics.totalTransactions} → ${totalRowsProcessed}`);

                // Create a metrics update to fix the transaction count
                const metricsUpdate = {
                    totalTransactions: totalRowsProcessed,
                    // Keep other metrics proportional to maintain data integrity
                    totalAmount: currentMetrics.totalAmount * (totalRowsProcessed / Math.max(currentMetrics.totalTransactions, 1)),
                    hocCount: Math.round(currentMetrics.hocCount * (totalRowsProcessed / Math.max(currentMetrics.totalTransactions, 1))),
                    ibdCount: Math.round(currentMetrics.ibdCount * (totalRowsProcessed / Math.max(currentMetrics.totalTransactions, 1))),
                    // Add other metrics as needed with similar scaling
                };

                // Apply the fix - this will update the UI without resetting accumulated metrics
                window.dataProcessor.fixTransactionCount(totalRowsProcessed, metricsUpdate);
            }

            // Only process sample data if we're not using a worker AND we have no metrics yet
            if (!this.worker && currentMetrics.totalTransactions === 0) {
                // For backward compatibility with non-worker mode, create a representative dataset
                const allData = [];

                // Use all sample rows from all files to represent the full dataset
                this.processedData.forEach(file => {
                    if (file.sampleRows && file.sampleRows.length > 0) {
                        allData.push(...file.sampleRows);
                    }
                });

                // If we have sample data, process it
                if (allData.length > 0) {
                    console.log(`Processing ${allData.length} sample rows as representative data`);
                    window.dataProcessor.processData(allData);

                    // Fix the transaction count after processing sample data
                    window.dataProcessor.fixTransactionCount(totalRowsProcessed);
                } else {
                    console.warn('No sample data available for processing');
                }
            }

            // Log the current metrics for debugging
            const metrics = window.dataProcessor.getSummaryMetrics();
            console.log('Current metrics:', {
                totalTransactions: metrics.totalTransactions,
                hocCount: metrics.hocCount,
                ibdCount: metrics.ibdCount
            });
        }
    }
}

// Create a global instance of the FileHandler
window.fileHandler = new FileHandler();
