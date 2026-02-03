/**
 * PSD2 API Discovery - Playwright Scraper
 *
 * This script crawls bank developer portals and discovers PSD2 APIs.
 * It uses Playwright for full JavaScript rendering support.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Output paths
const outputDir = path.join(__dirname, '..', 'docs', 'data');
const apisOutputPath = path.join(outputDir, 'apis.json');
const logOutputPath = path.join(outputDir, 'scan-log.json');

// Keywords for API detection
const KEYWORDS = config.keywords;

// Store scan logs
const scanLogs = [];

function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, message, type };
    scanLogs.push(logEntry);
    console.log(`[${timestamp}] [${type.toUpperCase()}] ${message}`);
}

/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const result = { urls: null };

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--urls' && args[i + 1]) {
            result.urls = args[i + 1].split(',').map(u => u.trim()).filter(u => u);
            i++;
        }
    }

    return result;
}

/**
 * Extract base domain from URL
 */
function getBaseDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace('www.', '').split('.').slice(-2).join('.');
    } catch {
        return url;
    }
}

/**
 * Extract provider name from URL
 */
function getProviderName(url) {
    try {
        const urlObj = new URL(url);
        const parts = urlObj.hostname.replace('developer.', '').replace('www.', '').split('.');
        // Capitalize first letter
        const name = parts[0];
        return name.charAt(0).toUpperCase() + name.slice(1);
    } catch {
        return 'Unknown';
    }
}

/**
 * Check if a URL is API-related based on path keywords
 */
function isApiRelatedUrl(url) {
    const apiPathKeywords = [
        'api', 'apis', 'developer', 'developers', 'docs', 'documentation',
        'reference', 'openbanking', 'open-banking', 'psd2', 'sandbox',
        'product', 'products', 'service', 'services', 'account', 'payment',
        'specification', 'swagger', 'openapi'
    ];

    const lowerUrl = url.toLowerCase();
    return apiPathKeywords.some(keyword => lowerUrl.includes(keyword));
}

/**
 * Analyze page content for PSD2 APIs
 */
function analyzePageContent(url, content, title) {
    const apis = [];
    const lowerContent = content.toLowerCase();
    const lowerTitle = (title || '').toLowerCase();

    // Count keyword matches
    const keywordMatches = {
        psd2: 0,
        ais: 0,
        pis: 0,
        caf: 0
    };

    const foundKeywords = [];

    for (const [category, keywords] of Object.entries(KEYWORDS)) {
        for (const keyword of keywords) {
            const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            const matches = (lowerContent.match(regex) || []).length;
            if (matches > 0) {
                keywordMatches[category] += matches;
                if (!foundKeywords.includes(keyword)) {
                    foundKeywords.push(keyword);
                }
            }
        }
    }

    // Determine API type based on keyword matches
    const totalMatches = Object.values(keywordMatches).reduce((a, b) => a + b, 0);

    if (totalMatches === 0) {
        return apis;
    }

    // Determine primary API type
    let apiType = 'PSD2';
    let maxMatches = keywordMatches.psd2;

    if (keywordMatches.ais > maxMatches) {
        apiType = 'AIS';
        maxMatches = keywordMatches.ais;
    }
    if (keywordMatches.pis > maxMatches) {
        apiType = 'PIS';
        maxMatches = keywordMatches.pis;
    }
    if (keywordMatches.caf > maxMatches) {
        apiType = 'CAF';
        maxMatches = keywordMatches.caf;
    }

    // Calculate confidence score
    let confidenceScore = Math.min(totalMatches / 20, 1);

    // Boost confidence if URL is API-related
    if (isApiRelatedUrl(url)) {
        confidenceScore = Math.min(confidenceScore + 0.2, 1);
    }

    // Boost if title contains API keywords
    if (lowerTitle.includes('api') || lowerTitle.includes('psd2') || lowerTitle.includes('open banking')) {
        confidenceScore = Math.min(confidenceScore + 0.1, 1);
    }

    // Only report if confidence is reasonable
    if (confidenceScore >= 0.3) {
        const providerName = getProviderName(url);

        // Extract description from content
        let description = '';
        const descPatterns = [
            /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
            /<p[^>]*class=["'][^"']*(?:description|intro|summary)[^"']*["'][^>]*>([^<]+)</i,
            /<p[^>]*>([^<]{50,200})<\/p>/i
        ];

        for (const pattern of descPatterns) {
            const match = content.match(pattern);
            if (match && match[1]) {
                description = match[1].trim().substring(0, 300);
                break;
            }
        }

        if (!description) {
            description = `${apiType} API from ${providerName} - PSD2 compliant banking API`;
        }

        // Look for documentation links
        let documentationUrl = null;
        let swaggerUrl = null;

        const docPatterns = [
            /href=["']([^"']*(?:documentation|docs|api-reference|reference)[^"']*)["']/gi,
            /href=["']([^"']*(?:swagger|openapi|api-spec)[^"']*)["']/gi
        ];

        const docMatch = content.match(docPatterns[0]);
        if (docMatch) {
            try {
                documentationUrl = new URL(docMatch[0].match(/href=["']([^"']+)["']/)[1], url).href;
            } catch {}
        }

        const swaggerMatch = content.match(docPatterns[1]);
        if (swaggerMatch) {
            try {
                swaggerUrl = new URL(swaggerMatch[0].match(/href=["']([^"']+)["']/)[1], url).href;
            } catch {}
        }

        apis.push({
            name: `${providerName} ${apiType} API`,
            api_type: apiType,
            url: new URL(url).origin,
            source_page: url,
            description: description,
            documentation_url: documentationUrl,
            swagger_url: swaggerUrl,
            confidence_score: Math.round(confidenceScore * 100) / 100,
            keywords_found: foundKeywords.slice(0, 10),
            discovered_at: new Date().toISOString()
        });
    }

    return apis;
}

/**
 * Extract links from page
 */
function extractLinks(baseUrl, content) {
    const links = new Set();
    const baseDomain = getBaseDomain(baseUrl);

    // Extract href links
    const hrefPattern = /href=["']([^"'#]+)["']/gi;
    let match;

    while ((match = hrefPattern.exec(content)) !== null) {
        try {
            const link = new URL(match[1], baseUrl).href;
            const linkDomain = getBaseDomain(link);

            // Only follow links on same domain
            if (linkDomain === baseDomain && !link.includes('#')) {
                // Skip non-HTML resources
                const skipExtensions = ['.pdf', '.zip', '.png', '.jpg', '.gif', '.css', '.js', '.svg'];
                if (!skipExtensions.some(ext => link.toLowerCase().endsWith(ext))) {
                    links.add(link);
                }
            }
        } catch {}
    }

    return Array.from(links);
}

/**
 * Crawl a single website
 */
async function crawlSite(browser, startUrl, options) {
    const { maxDepth, maxPagesPerSite, timeout, waitTime } = options;

    log(`Starting crawl of ${startUrl}`, 'info');

    const visited = new Set();
    const toVisit = [{ url: startUrl, depth: 0 }];
    const apis = [];
    const apiRelatedPages = [];
    let pagesScanned = 0;

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    try {
        while (toVisit.length > 0 && pagesScanned < maxPagesPerSite) {
            const { url, depth } = toVisit.shift();

            if (visited.has(url)) continue;
            visited.add(url);

            log(`Scanning (depth ${depth}): ${url}`, 'info');

            const page = await context.newPage();

            try {
                await page.goto(url, {
                    timeout: timeout,
                    waitUntil: 'networkidle'
                });

                // Wait for dynamic content
                await page.waitForTimeout(waitTime);

                // Get page content and title
                const content = await page.content();
                const title = await page.title();

                pagesScanned++;

                // Analyze for APIs
                const foundApis = analyzePageContent(url, content, title);
                if (foundApis.length > 0) {
                    apis.push(...foundApis);
                    apiRelatedPages.push(url);
                    log(`Found ${foundApis.length} API(s) on ${url}`, 'success');
                }

                // Extract and queue links if not at max depth
                if (depth < maxDepth) {
                    const links = extractLinks(url, content);

                    // Prioritize API-related URLs
                    const sortedLinks = links.sort((a, b) => {
                        const aIsApi = isApiRelatedUrl(a);
                        const bIsApi = isApiRelatedUrl(b);
                        if (aIsApi && !bIsApi) return -1;
                        if (!aIsApi && bIsApi) return 1;
                        return 0;
                    });

                    for (const link of sortedLinks) {
                        if (!visited.has(link)) {
                            toVisit.push({ url: link, depth: depth + 1 });
                        }
                    }
                }

            } catch (error) {
                log(`Error loading ${url}: ${error.message}`, 'error');
            } finally {
                await page.close();
            }
        }

    } finally {
        await context.close();
    }

    return {
        url: startUrl,
        status: 'success',
        pagesScanned,
        apiRelatedPages,
        apis
    };
}

/**
 * Main scraper function
 */
async function scrape() {
    const args = parseArgs();
    const urls = args.urls || config.urls;
    const options = config.options;

    log(`Starting PSD2 API Discovery scraper`, 'info');
    log(`URLs to scan: ${urls.join(', ')}`, 'info');

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Load existing APIs to merge
    let existingApis = [];
    if (fs.existsSync(apisOutputPath)) {
        try {
            const existing = JSON.parse(fs.readFileSync(apisOutputPath, 'utf-8'));
            existingApis = existing.apis || [];
            log(`Loaded ${existingApis.length} existing APIs`, 'info');
        } catch {}
    }

    const browser = await chromium.launch({
        headless: true
    });

    const allApis = [];
    const scanResults = [];

    try {
        for (const url of urls) {
            try {
                const result = await crawlSite(browser, url, options);
                scanResults.push(result);
                allApis.push(...result.apis);
            } catch (error) {
                log(`Failed to crawl ${url}: ${error.message}`, 'error');
                scanResults.push({
                    url,
                    status: 'error',
                    error: error.message,
                    pagesScanned: 0,
                    apis: []
                });
            }
        }
    } finally {
        await browser.close();
    }

    // Merge with existing APIs (deduplicate by source_page)
    const apiMap = new Map();

    // Add existing APIs
    for (const api of existingApis) {
        apiMap.set(api.source_page, api);
    }

    // Add/update with new APIs
    for (const api of allApis) {
        apiMap.set(api.source_page, api);
    }

    const mergedApis = Array.from(apiMap.values());

    // Sort by confidence score
    mergedApis.sort((a, b) => b.confidence_score - a.confidence_score);

    // Save results
    const output = {
        lastUpdated: new Date().toISOString(),
        totalApis: mergedApis.length,
        scanResults: scanResults,
        apis: mergedApis
    };

    fs.writeFileSync(apisOutputPath, JSON.stringify(output, null, 2));
    log(`Saved ${mergedApis.length} APIs to ${apisOutputPath}`, 'success');

    // Save scan log
    const logOutput = {
        scanDate: new Date().toISOString(),
        urlsScanned: urls,
        totalApisFound: allApis.length,
        logs: scanLogs
    };

    fs.writeFileSync(logOutputPath, JSON.stringify(logOutput, null, 2));
    log(`Saved scan log to ${logOutputPath}`, 'success');

    log(`Scraping complete! Found ${allApis.length} new APIs, ${mergedApis.length} total`, 'success');
}

// Run scraper
scrape().catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
});
