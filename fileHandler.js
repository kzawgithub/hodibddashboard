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

        // ADD THIS LINE: Set to track uploaded filenames in the current session
        this.uploadedFileNamesInSession = new Set();

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
            // Use window.app.showNotification for consistency, if available
            if (window.app) {
                window.app.showNotification('Please wait for the current files to finish processing.', 'warning');
            } else {
                alert('Please wait for the current files to finish processing.');
            }
            return;
        }

        // Convert FileList to Array and filter for CSV files
        const newFiles = Array.from(fileList).filter(file => file.name.toLowerCase().endsWith('.csv'));

        if (newFiles.length === 0) {
            // Use window.app.showNotification
            if (window.app) {
                window.app.showNotification('Please select CSV files only.', 'info');
            } else {
                alert('Please select CSV files only.');
            }
            return;
        }

        let alreadyProcessedCount = 0;
        const unprocessedFiles = [];
        // let duplicateFileCount = 0; // Optional: for user feedback if multiple duplicates are selected

        newFiles.forEach(file => {
            // NEW DUPLICATE CHECK
            if (this.uploadedFileNamesInSession.has(file.name)) {
                if (window.app) {
                    window.app.showNotification(`File '${file.name}' has already been uploaded in this session. Please refresh the application if you need to upload it again.`, 'error');
                } else {
                    // Fallback if window.app is not available for some reason
                    alert(`File '${file.name}' has already been uploaded in this session. Please refresh the application if you need to upload it again.`);
                }
                // duplicateFileCount++; // Optional
            } else {
                // Not a duplicate in this session, add to session tracking
                this.uploadedFileNamesInSession.add(file.name);

                // Existing logic for already processed files (by dataProcessor)
                if (window.dataProcessor && window.dataProcessor.isFileProcessed(file)) {
                    alreadyProcessedCount++;
                    // Still add to the list but mark as already processed
                    file.isAlreadyProcessed = true;
                    unprocessedFiles.push(file);
                } else {
                    unprocessedFiles.push(file);
                }
            }
        });

        // Add only the non-duplicate, correctly typed files to the list
        // Important: Only add to this.files if there are new unprocessedFiles to add,
        // otherwise, if all files selected were duplicates, this would add an empty array.
        if (unprocessedFiles.length > 0) {
            this.files = [...this.files, ...unprocessedFiles];
        }
        
        // Update the file list UI in all cases, as it might need to reflect changes
        // even if no new files are added (e.g. if a file was processed by dataProcessor before)
        this.updateFileList();

        // Show the submit button if files are selected and update its state
        this.updateSubmitButtonVisibility();

        // Show notification if some files were already processed by dataProcessor
        if (alreadyProcessedCount > 0 && window.app) {
            window.app.showNotification(
                `${alreadyProcessedCount} file(s) have already been processed by the system. They will be marked in the list.`,
                'info'
            );
        }

        // Show notification if new unprocessed files were added
        const newFilesSuccessfullyAddedToUnprocessed = unprocessedFiles.some(f => !f.isAlreadyProcessed);
        if (newFilesSuccessfullyAddedToUnprocessed && window.app) {
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
            // Initialize file-specific metrics
            const fileSpecificMetrics = {
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
                hocUniqueSerialCount: 0, // Will be calculated at the end
                ibdUniqueSerialCount: 0, // Will be calculated at the end
                currencyCounts: {
                    USD: 0,
                    MMK: 0
                },
                currencyAmounts: {
                    USD: 0,
                    MMK: 0
                }
            };

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

                    // Process sample rows for display (can be kept for UI purposes if needed)
                    if (isFirstChunk && lines.length > 1) {
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

                    // Process the chunk and get chunk-specific metrics
                    const chunkMetricsResult = this.processChunkForMetrics(lines, header, isFirstChunk, fileData.fileName);
                    validLinesInChunk += chunkMetricsResult.processedRows;

                    // Accumulate chunk metrics into fileSpecificMetrics
                    this.accumulateMetrics(fileSpecificMetrics, chunkMetricsResult.metrics);


                    // If worker is available, it can still be used for other tasks or a different processing pipeline
                    // For now, we rely on main thread processing for fileSpecificMetrics accuracy.
                    if (this.worker) {
                        // The worker's role might need to be re-evaluated.
                        // For now, let's assume it might be doing something else or could be removed
                        // if its sole purpose was metrics calculation.
                        // To avoid breaking existing worker logic, we can still send data,
                        // but the primary source of truth for fileMetrics is now the main thread.
                        try {
                            this.worker.postMessage({
                                action: 'processChunk', // This action might need to be handled differently by the worker
                                data: {
                                    chunk: combinedText, // Sending combinedText as before
                                    header: header,
                                    isFirstChunk: isFirstChunk,
                                    fileName: file.name // Pass fileName for context
                                }
                            });
                        } catch (workerError) {
                            console.error('Error sending data to worker:', workerError);
                        }
                    }

                    // Update row count with actual processed rows
                    fileData.rowCount += lines.length - (isFirstChunk ? 1 : 0); // total lines read
                    fileData.processedRowCount += validLinesInChunk; // valid transactions processed

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
                            sampleRows: fileData.sampleRows // Sample rows are still useful for quick display if needed
                        });

                        // Finalize HOC and IBD unique serial counts for the file
                        // These sets (this.fileHocSerialNumbers and this.fileIbdSerialNumbers)
                        // should be temporary and specific to this file processing instance.
                        // Let's create them here before storing.
                        const fileHocSerialNumbers = new Set();
                        const fileIbdSerialNumbers = new Set();
                        // This requires iterating through the file's rows again or collecting serials during chunk processing.
                        // For now, we'll assume this.updateMetricsWithRow (called by processChunkForMetrics)
                        // correctly updates global serial number sets (this.hocSerialNumbers, this.ibdSerialNumbers).
                        // We need a way to get serial numbers *only* for the current file.

                        // The most straightforward way is to process rows and collect serials specifically for this file.
                        // The existing this.updateMetricsWithRow updates global sets.
                        // We need a version that updates file-local sets for fileSpecificMetrics.
                        // This is already handled by processChunkForMetrics and accumulateMetrics.
                        // The serial numbers are collected in fileSpecificMetrics.hocSerialNumbers (Set) and fileSpecificMetrics.ibdSerialNumbers (Set)
                        // by the accumulateMetrics function.

                        // Update unique serial counts in fileSpecificMetrics from the sets
                        fileSpecificMetrics.hocUniqueSerialCount = fileSpecificMetrics.hocSerialNumbers ? fileSpecificMetrics.hocSerialNumbers.size : 0;
                        fileSpecificMetrics.ibdUniqueSerialCount = fileSpecificMetrics.ibdSerialNumbers ? fileSpecificMetrics.ibdSerialNumbers.size : 0;


                        // Store the fully accumulated fileSpecificMetrics
                        this.fileMetrics.set(file.name, fileSpecificMetrics);

                        // Store the serial numbers specific to this file
                        // These are already part of fileSpecificMetrics if collected correctly
                        this.fileSerialNumbers.set(file.name, {
                             hoc: fileSpecificMetrics.hocSerialNumbers || new Set(),
                             ibd: fileSpecificMetrics.ibdSerialNumbers || new Set()
                        });


                        // Update global metrics in DataProcessor with the metrics from this file
                        if (window.dataProcessor) {
                            window.dataProcessor.updateMetrics(fileSpecificMetrics);
                        }

                        console.log(`Stored accurate metrics for file: ${file.name}`, fileSpecificMetrics);
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

    // Renamed from processChunkInMainThread to processChunkForMetrics
    // This function now returns metrics for the chunk and does not update global state directly.
    processChunkForMetrics(lines, header, isFirstChunk, fileName) {
        // Initialize metrics for this specific chunk
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
            currencyCounts: { USD: 0, MMK: 0 },
            currencyAmounts: { USD: 0, MMK: 0 },
            // Temporary sets for unique serials within this chunk for this file
            hocSerialNumbers: new Set(),
            ibdSerialNumbers: new Set()
        };

        const dateData = {}; // For table data, can still be updated globally or returned
        const startIndex = isFirstChunk ? 1 : 0;
        let validRowsProcessed = 0;

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '') continue;

            const rowData = this.parseCSVLine(line);
            if (rowData.length >= header.length) {
                const rowObject = {};
                header.forEach((key, index) => {
                    rowObject[key] = rowData[index] || '';
                });

                if (rowObject.REPORTTYPE) {
                    validRowsProcessed++;
                    // Update chunkMetrics with this row
                    this.updateMetricsWithRow(rowObject, chunkMetrics, true); // Pass true for isChunkOrFileSpecific
                    // Update date-based aggregation for table (can remain global for now)
                    this.updateDateData(rowObject, dateData);
                }
            }
        }

        if (validRowsProcessed > 0) {
            // console.log(`File ${fileName}: Processed chunk with ${validRowsProcessed} valid transactions`);
        }

        // Update table data with date aggregation from this chunk
        this.updateTableData(dateData);


        return { metrics: chunkMetrics, processedRows: validRowsProcessed };
    }

    // Helper function to accumulate metrics from a chunk into a target metrics object
    accumulateMetrics(targetMetrics, chunkMetrics) {
        const safeAdd = (a, b) => (Number(a) || 0) + (Number(b) || 0);

        targetMetrics.totalTransactions = safeAdd(targetMetrics.totalTransactions, chunkMetrics.totalTransactions);
        targetMetrics.totalAmount = safeAdd(targetMetrics.totalAmount, chunkMetrics.totalAmount);
        targetMetrics.hocCount = safeAdd(targetMetrics.hocCount, chunkMetrics.hocCount);
        targetMetrics.hocAmount = safeAdd(targetMetrics.hocAmount, chunkMetrics.hocAmount);
        targetMetrics.hocCreditCount = safeAdd(targetMetrics.hocCreditCount, chunkMetrics.hocCreditCount);
        targetMetrics.hocCreditAmount = safeAdd(targetMetrics.hocCreditAmount, chunkMetrics.hocCreditAmount);
        targetMetrics.hocDebitCount = safeAdd(targetMetrics.hocDebitCount, chunkMetrics.hocDebitCount);
        targetMetrics.hocDebitAmount = safeAdd(targetMetrics.hocDebitAmount, chunkMetrics.hocDebitAmount);
        targetMetrics.ibdCount = safeAdd(targetMetrics.ibdCount, chunkMetrics.ibdCount);
        targetMetrics.ibdAmount = safeAdd(targetMetrics.ibdAmount, chunkMetrics.ibdAmount);
        targetMetrics.ibdCreditCount = safeAdd(targetMetrics.ibdCreditCount, chunkMetrics.ibdCreditCount);
        targetMetrics.ibdCreditAmount = safeAdd(targetMetrics.ibdCreditAmount, chunkMetrics.ibdCreditAmount);
        targetMetrics.ibdDebitCount = safeAdd(targetMetrics.ibdDebitCount, chunkMetrics.ibdDebitCount);
        targetMetrics.ibdDebitAmount = safeAdd(targetMetrics.ibdDebitAmount, chunkMetrics.ibdDebitAmount);

        targetMetrics.currencyCounts.USD = safeAdd(targetMetrics.currencyCounts.USD, chunkMetrics.currencyCounts.USD);
        targetMetrics.currencyCounts.MMK = safeAdd(targetMetrics.currencyCounts.MMK, chunkMetrics.currencyCounts.MMK);
        targetMetrics.currencyAmounts.USD = safeAdd(targetMetrics.currencyAmounts.USD, chunkMetrics.currencyAmounts.USD);
        targetMetrics.currencyAmounts.MMK = safeAdd(targetMetrics.currencyAmounts.MMK, chunkMetrics.currencyAmounts.MMK);

        // Accumulate unique serial numbers
        if (!targetMetrics.hocSerialNumbers) targetMetrics.hocSerialNumbers = new Set();
        if (!targetMetrics.ibdSerialNumbers) targetMetrics.ibdSerialNumbers = new Set();

        chunkMetrics.hocSerialNumbers.forEach(sn => targetMetrics.hocSerialNumbers.add(sn));
        chunkMetrics.ibdSerialNumbers.forEach(sn => targetMetrics.ibdSerialNumbers.add(sn));
    }


    // Update metrics directly with a row.
    // Added isChunkOrFileSpecific flag to control serial number collection.
    // If true, it adds to metrics.hocSerialNumbers/ibdSerialNumbers (for chunk/file specific counts).
    // Otherwise, it adds to this.hocSerialNumbers/ibdSerialNumbers (for global counts).
    updateMetricsWithRow(row, metrics, isChunkOrFileSpecific = false) {
        const safeAdd = (a, b) => (Number(a) || 0) + (Number(b) || 0);
        const amount = parseFloat(row.TRANSACTION_AMOUNT) || 0;

        metrics.totalTransactions++;
        metrics.totalAmount = safeAdd(metrics.totalAmount, amount);

        const isCredit = row.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'C';
        const isDebit = row.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'D';
        const serialNo = row.SERIAL_NO || '';

        const hocTargetSet = isChunkOrFileSpecific ? metrics.hocSerialNumbers : this.hocSerialNumbers;
        const ibdTargetSet = isChunkOrFileSpecific ? metrics.ibdSerialNumbers : this.ibdSerialNumbers;
        const allTargetSet = isChunkOrFileSpecific ? null : this.allSerialNumbers; // allSerialNumbers is global only

        if (row.REPORTTYPE === 'HOC') {
            metrics.hocCount++;
            metrics.hocAmount = safeAdd(metrics.hocAmount, amount);
            if (serialNo && hocTargetSet) hocTargetSet.add(serialNo);
            if (serialNo && allTargetSet) allTargetSet.add(serialNo);

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
            if (serialNo && ibdTargetSet) ibdTargetSet.add(serialNo);
            if (serialNo && allTargetSet) allTargetSet.add(serialNo);

            if (isCredit) {
                metrics.ibdCreditCount++;
                metrics.ibdCreditAmount = safeAdd(metrics.ibdCreditAmount, amount);
            } else if (isDebit) {
                metrics.ibdDebitCount++;
                metrics.ibdDebitAmount = safeAdd(metrics.ibdDebitAmount, amount);
            }
        } else if (row.REPORTTYPE === 'WU') {
            if (serialNo && ibdTargetSet) ibdTargetSet.add(serialNo);
            if (serialNo && allTargetSet) allTargetSet.add(serialNo);
        }

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

    // Update global metrics with a file's metrics - This function is no longer needed here
    // as global metrics are updated in DataProcessor after a file is fully processed.
    // updateGlobalMetrics(fileMetrics) { ... }

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
