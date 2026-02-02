/**
 * PSD2 API Discovery - Frontend Application
 */

// Global state
let scanResults = null;
let allApis = [];

/**
 * Add a new URL input field
 */
function addUrlInput() {
    const urlList = document.getElementById('url-list');
    const urlRow = document.createElement('div');
    urlRow.className = 'url-row';
    urlRow.innerHTML = `
        <input type="url" class="url-input" placeholder="https://developer.example-bank.com" />
        <button type="button" class="btn-remove" onclick="removeUrl(this)" title="Remove">×</button>
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
            <button type="button" class="btn-remove" onclick="removeUrl(this)" title="Remove">×</button>
        </div>
    `;

    document.getElementById('results-section').style.display = 'none';
    document.getElementById('progress-section').style.display = 'none';
    document.getElementById('error-section').style.display = 'none';

    scanResults = null;
    allApis = [];
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
        const url = input.value.trim();
        if (url) {
            urls.push(url);
        }
    });

    return urls;
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

    updateProgress(0, 'Initializing scan...');

    try {
        const maxDepth = parseInt(document.getElementById('max-depth').value) || 2;
        const maxPages = parseInt(document.getElementById('max-pages').value) || 50;

        updateProgress(10, `Scanning ${urls.length} website(s)...`);

        const response = await fetch('/api/scan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                urls: urls,
                max_depth: maxDepth,
                max_pages: maxPages
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Scan failed');
        }

        updateProgress(90, 'Processing results...');

        scanResults = await response.json();
        allApis = scanResults.apis || [];

        updateProgress(100, 'Scan complete!');

        // Short delay to show completion
        await new Promise(resolve => setTimeout(resolve, 500));

        displayResults();

    } catch (error) {
        console.error('Scan error:', error);
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
 * Show error message
 */
function showError(message) {
    document.getElementById('progress-section').style.display = 'none';
    document.getElementById('error-section').style.display = 'block';
    document.getElementById('error-message').textContent = message;
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
}

/**
 * Update statistics cards
 */
function updateStats() {
    document.getElementById('total-apis').textContent = allApis.length;
    document.getElementById('total-sites').textContent = scanResults.scan_results?.length || 0;

    // Calculate total pages scanned
    let totalPages = 0;
    if (scanResults.scan_results) {
        scanResults.scan_results.forEach(result => {
            totalPages += result.pages_scanned || 0;
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
                ${api.documentation_url ? `<a href="${escapeHtml(api.documentation_url)}" target="_blank">Documentation</a><br>` : ''}
                ${api.swagger_url ? `<a href="${escapeHtml(api.swagger_url)}" target="_blank">Swagger/OpenAPI</a>` : ''}
                ${!api.documentation_url && !api.swagger_url ? '-' : ''}
            </td>
            <td>
                <div class="confidence-bar">
                    <div class="confidence-fill ${confidenceClass}" style="width: ${api.confidence_score * 100}%"></div>
                </div>
                <small>${Math.round(api.confidence_score * 100)}%</small>
            </td>
            <td class="link-cell">
                <a href="${escapeHtml(api.source_page)}" target="_blank">View Source</a>
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

    if (!scanResults.scan_results) return;

    scanResults.scan_results.forEach(result => {
        const div = document.createElement('div');
        div.className = 'scan-detail-item';

        const statusClass = result.status === 'success' ? 'status-success' : 'status-error';
        const statusText = result.status === 'success' ? 'Completed' : 'Failed';

        div.innerHTML = `
            <h4>${escapeHtml(result.url)}</h4>
            <p>
                Status: <span class="${statusClass}">${statusText}</span>
                ${result.pages_scanned ? ` | Pages Scanned: ${result.pages_scanned}` : ''}
                ${result.api_related_pages ? ` | API-Related Pages: ${result.api_related_pages.length}` : ''}
                ${result.apis ? ` | APIs Found: ${result.apis.length}` : ''}
            </p>
            ${result.error ? `<p style="color: var(--error-color);">Error: ${escapeHtml(result.error)}</p>` : ''}
        `;

        container.appendChild(div);
    });

    // Show invalid URLs if any
    if (scanResults.invalid_urls && scanResults.invalid_urls.length > 0) {
        const div = document.createElement('div');
        div.className = 'scan-detail-item';
        div.innerHTML = `
            <h4 style="color: var(--warning-color);">Invalid URLs (Skipped)</h4>
            <p>${scanResults.invalid_urls.map(u => escapeHtml(u)).join(', ')}</p>
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
async function exportJSON() {
    if (!allApis || allApis.length === 0) {
        alert('No APIs to export.');
        return;
    }

    try {
        const response = await fetch('/api/export/json', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ apis: allApis })
        });

        if (response.ok) {
            const blob = await response.blob();
            downloadBlob(blob, 'api_inventory.json');
        }
    } catch (error) {
        console.error('Export error:', error);
        alert('Failed to export JSON.');
    }
}

/**
 * Export results as CSV
 */
async function exportCSV() {
    if (!allApis || allApis.length === 0) {
        alert('No APIs to export.');
        return;
    }

    try {
        const response = await fetch('/api/export/csv', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ apis: allApis })
        });

        if (response.ok) {
            const blob = await response.blob();
            downloadBlob(blob, 'api_inventory.csv');
        }
    } catch (error) {
        console.error('Export error:', error);
        alert('Failed to export CSV.');
    }
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
