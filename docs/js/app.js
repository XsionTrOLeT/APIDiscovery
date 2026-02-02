/**
 * PSD2 API Discovery - Frontend Application
 */

// Global state
let scanResults = null;
let allApis = [];
let scanLogs = []; // Store logs for display after scan

/**
 * Add a new URL input field
 */
function addUrlInput() {
    const urlList = document.getElementById('url-list');
    const urlRow = document.createElement('div');
    urlRow.className = 'url-row';
    urlRow.innerHTML = `
        <input type="url" class="url-input" placeholder="https://developer.example-bank.com" />
        <button type="button" class="btn-remove" onclick="removeUrl(this)" title="Remove">&times;</button>
    `;
    urlList.appendChild(urlRow);
    urlRow.querySelector('input').focus();
}

/**
 * Remove a URL input field
 */
function removeUrl(button) {
    const urlList = document.getElementById('url-list');
    const rows = urlList.querySelectorAll('.url-row');

    // Keep at least one input
    if (rows.length > 1) {
        button.parentElement.remove();
    }
}

/**
 * Clear all inputs and results
 */
function clearAll() {
    const urlList = document.getElementById('url-list');
    urlList.innerHTML = `
        <div class="url-row">
            <input type="url" class="url-input" placeholder="https://developer.example-bank.com" />
            <button type="button" class="btn-remove" onclick="removeUrl(this)" title="Remove">&times;</button>
        </div>
    `;

    document.getElementById('results-section').style.display = 'none';
    document.getElementById('progress-section').style.display = 'none';
    document.getElementById('error-section').style.display = 'none';
    document.getElementById('progress-log').innerHTML = '';

    scanResults = null;
    allApis = [];
    scanLogs = [];
}

/**
 * Reset after error
 */
function resetScan() {
    document.getElementById('error-section').style.display = 'none';
    document.getElementById('scan-btn').disabled = false;
    document.querySelector('.btn-text').style.display = 'inline';
    document.querySelector('.btn-loading').style.display = 'none';
}

/**
 * Get all entered URLs
 */
function getUrls() {
    const inputs = document.querySelectorAll('.url-input');
    const urls = [];

    inputs.forEach(input => {
        let url = input.value.trim();
        if (url) {
            // Add https:// if no scheme provided
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }
            urls.push(url);
        }
    });

    return urls;
}

/**
 * Validate URL
 */
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Start the scanning process
 */
async function startScan() {
    const urls = getUrls();

    if (urls.length === 0) {
        alert('Please enter at least one URL to scan.');
        return;
    }

    // Validate URLs
    const validUrls = [];
    const invalidUrls = [];

    for (const url of urls) {
        if (isValidUrl(url)) {
            validUrls.push(url);
        } else {
            invalidUrls.push(url);
        }
    }

    if (validUrls.length === 0) {
        alert('No valid URLs provided. Please check your input.');
        return;
    }

    // Clear previous logs
    scanLogs = [];

    if (invalidUrls.length > 0) {
        addLog(`Skipping invalid URLs: ${invalidUrls.join(', ')}`, 'error');
    }

    const scanBtn = document.getElementById('scan-btn');
    const btnText = document.querySelector('.btn-text');
    const btnLoading = document.querySelector('.btn-loading');

    // Update UI
    scanBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';

    document.getElementById('progress-section').style.display = 'block';
    document.getElementById('results-section').style.display = 'none';
    document.getElementById('error-section').style.display = 'none';
    document.getElementById('progress-log').innerHTML = '';

    updateProgress(0, 'Initializing scan...');

    try {
        const maxDepth = parseInt(document.getElementById('max-depth').value) || 2;
        const maxPages = parseInt(document.getElementById('max-pages').value) || 30;

        addLog('Starting API discovery scan...', 'info');

        const discovery = new PSD2APIDiscovery({
            maxDepth: maxDepth,
            maxPages: maxPages,
            onProgress: updateProgress,
            onLog: addLog
        });

        scanResults = await discovery.discoverApis(validUrls);
        allApis = scanResults.apis || [];

        // Add invalid URLs to response for user awareness
        if (invalidUrls.length > 0) {
            scanResults.invalidUrls = invalidUrls;
        }

        updateProgress(100, 'Scan complete!');
        addLog(`Scan complete! Found ${allApis.length} API(s)`, 'success');

        // Short delay to show completion
        await new Promise(resolve => setTimeout(resolve, 500));

        displayResults();

    } catch (error) {
        console.error('Scan error:', error);
        addLog(`Fatal error: ${error.message}`, 'error');
        showError(error.message);
    } finally {
        scanBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
}

/**
 * Update progress display
 */
function updateProgress(percent, message) {
    document.getElementById('progress-fill').style.width = `${percent}%`;
    document.getElementById('progress-text').textContent = message;
}

/**
 * Add log entry (stores in array and displays in progress log)
 */
function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { timestamp, message, type };

    // Store in array for later display
    scanLogs.push(logEntry);

    // Display in progress log during scan
    const log = document.getElementById('progress-log');
    if (log) {
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${escapeHtml(message)}`;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
    }
}

/**
 * Show error message
 */
function showError(message) {
    document.getElementById('progress-section').style.display = 'none';
    document.getElementById('error-section').style.display = 'block';
    document.getElementById('error-message').textContent = message;

    // Still show logs in error case
    displayLogsInResults();
}

/**
 * Display scan results
 */
function displayResults() {
    document.getElementById('progress-section').style.display = 'none';
    document.getElementById('results-section').style.display = 'block';

    // Update stats
    updateStats();

    // Populate table
    populateTable(allApis);

    // Show scan details
    showScanDetails();

    // Show logs in results section
    displayLogsInResults();
}

/**
 * Display logs in the results section
 */
function displayLogsInResults() {
    const logsContent = document.getElementById('scan-logs-content');
    if (!logsContent) return;

    logsContent.innerHTML = '';

    if (scanLogs.length === 0) {
        logsContent.innerHTML = '<div class="log-entry log-info">No logs available.</div>';
        return;
    }

    scanLogs.forEach(log => {
        const entry = document.createElement('div');
        entry.className = `log-entry log-${log.type}`;
        entry.innerHTML = `<span class="log-timestamp">[${log.timestamp}]</span> ${escapeHtml(log.message)}`;
        logsContent.appendChild(entry);
    });
}

/**
 * Toggle logs visibility
 */
function toggleLogs() {
    const logsContent = document.getElementById('scan-logs-content');
    const toggleBtn = document.getElementById('toggle-logs-btn');

    if (logsContent.classList.contains('collapsed')) {
        logsContent.classList.remove('collapsed');
        toggleBtn.textContent = 'Hide Logs';
    } else {
        logsContent.classList.add('collapsed');
        toggleBtn.textContent = 'Show Logs';
    }
}

/**
 * Update statistics cards
 */
function updateStats() {
    document.getElementById('total-apis').textContent = allApis.length;
    document.getElementById('total-sites').textContent = scanResults.scanResults?.length || 0;

    // Calculate total pages scanned
    let totalPages = 0;
    if (scanResults.scanResults) {
        scanResults.scanResults.forEach(result => {
            totalPages += result.pagesScanned || 0;
        });
    }
    document.getElementById('total-pages').textContent = totalPages;

    // Count by API type
    const aisCount = allApis.filter(api => api.api_type === 'AIS').length;
    const pisCount = allApis.filter(api => api.api_type === 'PIS').length;
    const cafCount = allApis.filter(api => api.api_type === 'CAF').length;

    document.getElementById('ais-count').textContent = aisCount;
    document.getElementById('pis-count').textContent = pisCount;
    document.getElementById('caf-count').textContent = cafCount;
}

/**
 * Populate the API table
 */
function populateTable(apis) {
    const tbody = document.getElementById('api-table-body');
    tbody.innerHTML = '';

    if (apis.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    No APIs found matching your criteria.
                </td>
            </tr>
        `;
        return;
    }

    apis.forEach(api => {
        const row = document.createElement('tr');

        // Confidence level class
        let confidenceClass = 'confidence-low';
        if (api.confidence_score >= 0.7) {
            confidenceClass = 'confidence-high';
        } else if (api.confidence_score >= 0.4) {
            confidenceClass = 'confidence-medium';
        }

        // API type class
        const typeClass = api.api_type.toLowerCase();

        row.innerHTML = `
            <td>
                <strong>${escapeHtml(api.name)}</strong>
                <br>
                <small style="color: var(--text-secondary);">${escapeHtml(api.url)}</small>
            </td>
            <td>
                <span class="api-type ${typeClass}">${escapeHtml(api.api_type)}</span>
            </td>
            <td>${escapeHtml(truncate(api.description, 150))}</td>
            <td class="link-cell">
                ${api.documentation_url ? `<a href="${escapeHtml(api.documentation_url)}" target="_blank" rel="noopener">Documentation</a><br>` : ''}
                ${api.swagger_url ? `<a href="${escapeHtml(api.swagger_url)}" target="_blank" rel="noopener">Swagger/OpenAPI</a>` : ''}
                ${!api.documentation_url && !api.swagger_url ? '-' : ''}
            </td>
            <td>
                <div class="confidence-bar">
                    <div class="confidence-fill ${confidenceClass}" style="width: ${api.confidence_score * 100}%"></div>
                </div>
                <small>${Math.round(api.confidence_score * 100)}%</small>
            </td>
            <td class="link-cell">
                <a href="${escapeHtml(api.source_page)}" target="_blank" rel="noopener">View Source</a>
            </td>
        `;

        tbody.appendChild(row);
    });
}

/**
 * Show scan details
 */
function showScanDetails() {
    const container = document.getElementById('scan-details-content');
    container.innerHTML = '';

    if (!scanResults.scanResults) return;

    scanResults.scanResults.forEach(result => {
        const div = document.createElement('div');
        div.className = 'scan-detail-item';

        const statusClass = result.status === 'success' ? 'status-success' : 'status-error';
        const statusText = result.status === 'success' ? 'Completed' : 'Failed';

        div.innerHTML = `
            <h4>${escapeHtml(result.url)}</h4>
            <p>
                Status: <span class="${statusClass}">${statusText}</span>
                ${result.pagesScanned ? ` | Pages Scanned: ${result.pagesScanned}` : ''}
                ${result.apiRelatedPages ? ` | API-Related Pages: ${result.apiRelatedPages.length}` : ''}
                ${result.apis ? ` | APIs Found: ${result.apis.length}` : ''}
            </p>
            ${result.error ? `<p style="color: var(--error-color);">Error: ${escapeHtml(result.error)}</p>` : ''}
        `;

        container.appendChild(div);
    });

    // Show invalid URLs if any
    if (scanResults.invalidUrls && scanResults.invalidUrls.length > 0) {
        const div = document.createElement('div');
        div.className = 'scan-detail-item';
        div.innerHTML = `
            <h4 style="color: var(--warning-color);">Invalid URLs (Skipped)</h4>
            <p>${scanResults.invalidUrls.map(u => escapeHtml(u)).join(', ')}</p>
        `;
        container.appendChild(div);
    }
}

/**
 * Filter results based on search and type
 */
function filterResults() {
    const searchTerm = document.getElementById('search-filter').value.toLowerCase();
    const typeFilter = document.getElementById('type-filter').value;

    const filtered = allApis.filter(api => {
        const matchesSearch = !searchTerm ||
            api.name.toLowerCase().includes(searchTerm) ||
            api.description.toLowerCase().includes(searchTerm) ||
            api.url.toLowerCase().includes(searchTerm);

        const matchesType = !typeFilter || api.api_type === typeFilter;

        return matchesSearch && matchesType;
    });

    populateTable(filtered);
}

/**
 * Export results as JSON
 */
function exportJSON() {
    if (!allApis || allApis.length === 0) {
        alert('No APIs to export.');
        return;
    }

    const dataStr = JSON.stringify(allApis, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    downloadBlob(blob, 'api_inventory.json');
}

/**
 * Export results as CSV
 */
function exportCSV() {
    if (!allApis || allApis.length === 0) {
        alert('No APIs to export.');
        return;
    }

    const headers = [
        'name', 'api_type', 'url', 'source_page', 'description',
        'documentation_url', 'swagger_url', 'confidence_score',
        'discovered_at', 'keywords_found'
    ];

    const csvRows = [headers.join(',')];

    for (const api of allApis) {
        const row = headers.map(header => {
            let value = api[header];
            if (Array.isArray(value)) {
                value = value.join('; ');
            }
            // Escape quotes and wrap in quotes
            value = String(value || '').replace(/"/g, '""');
            return `"${value}"`;
        });
        csvRows.push(row.join(','));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    downloadBlob(blob, 'api_inventory.csv');
}

/**
 * Export logs as text file
 */
function exportLogs() {
    if (!scanLogs || scanLogs.length === 0) {
        alert('No logs to export.');
        return;
    }

    const logText = scanLogs.map(log => `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}`).join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    downloadBlob(blob, 'scan_logs.txt');
}

/**
 * Download a blob as a file
 */
function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Truncate text
 */
function truncate(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Allow Enter key to add new URL row
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('url-input')) {
        e.preventDefault();
        addUrlInput();
    }
});
