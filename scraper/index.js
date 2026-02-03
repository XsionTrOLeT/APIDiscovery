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

    // Log page details for debugging
    log(`  Page title: "${title || '(no title)'}"`, 'info');
    log(`  Content length: ${content.length} chars`, 'info');

    // Log a sample of the text content (strip HTML tags)
    const textContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const textSample = textContent.substring(0, 500);
    log(`  Text sample: "${textSample}..."`, 'info');

    // Count keyword matches - initialize dynamically from config
    const keywordMatches = {};
    for (const category of Object.keys(KEYWORDS)) {
        keywordMatches[category] = 0;
    }

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

    // Log keyword matches
    const matchSummary = Object.entries(keywordMatches).map(([k, v]) => `${k}=${v}`).join(', ');
    log(`  Keyword matches: ${matchSummary}`, 'info');
    if (foundKeywords.length > 0) {
        log(`  Keywords found: ${foundKeywords.join(', ')}`, 'success');
    } else {
        log(`  No API-related keywords found on this page`, 'warning');
    }

    // Calculate total matches (api_patterns boost the score but don't count alone)
    const apiTypeMatches = (keywordMatches.psd2 || 0) + (keywordMatches.ais || 0) +
                          (keywordMatches.pis || 0) + (keywordMatches.caf || 0);
    const patternMatches = keywordMatches.api_patterns || 0;

    // Need at least some API type keywords OR significant pattern matches
    if (apiTypeMatches === 0 && patternMatches < 5) {
        log(`  Not enough matches to qualify as API (apiTypes=${apiTypeMatches}, patterns=${patternMatches})`, 'warning');
        return apis;
    }

    const totalMatches = apiTypeMatches + patternMatches;

    // Determine primary API type
    let apiType = 'PSD2';
    let maxMatches = keywordMatches.psd2 || 0;

    if ((keywordMatches.ais || 0) > maxMatches) {
        apiType = 'AIS';
        maxMatches = keywordMatches.ais;
    }
    if ((keywordMatches.pis || 0) > maxMatches) {
        apiType = 'PIS';
        maxMatches = keywordMatches.pis;
    }
    if ((keywordMatches.caf || 0) > maxMatches) {
        apiType = 'CAF';
        maxMatches = keywordMatches.caf;
    }

    // If only api_patterns matched, label as generic PSD2/API
    if (apiTypeMatches === 0 && patternMatches >= 5) {
        apiType = 'PSD2';
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

    // Log confidence score
    log(`  Confidence score: ${Math.round(confidenceScore * 100)}% (threshold: 30%)`, 'info');

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

        log(`  API detected: ${providerName} ${apiType} API`, 'success');
    } else {
        log(`  Confidence too low (${Math.round(confidenceScore * 100)}%), not recording as API`, 'warning');
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
    const { maxDepth, maxPagesPerSite, timeout, waitTime, minContentLength = 10000 } = options;

    log(`Starting crawl of ${startUrl}`, 'info');

    const visited = new Set();
    const toVisit = [{ url: startUrl, depth: 0 }];
    const apis = [];
    const apiRelatedPages = [];
    let pagesScanned = 0;

    // Create a browser context that looks like a real browser
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        hasTouch: false,
        javaScriptEnabled: true,
        locale: 'en-US',
        timezoneId: 'Europe/Amsterdam',
        permissions: ['geolocation'],
        extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"'
        }
    });

    // Add script to mask automation detection
    await context.addInitScript(() => {
        // Override the navigator.webdriver property
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
        // Add plugins
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5]
        });
        // Add languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en']
        });
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

                // Wait for SPA content containers to appear
                const contentSelectors = [
                    '.markdown-content',
                    '.api-content',
                    '.documentation-content',
                    '.content',
                    'article',
                    'main'
                ];

                let foundSelector = null;
                for (const selector of contentSelectors) {
                    try {
                        await page.waitForSelector(selector, { timeout: 5000 });
                        foundSelector = selector;
                        log(`  Found content container: ${selector}`, 'info');
                        break;
                    } catch {
                        // Selector not found, try next
                    }
                }

                // Additional wait for dynamic content to render
                await page.waitForTimeout(waitTime);

                // Get page title
                const title = await page.title();

                // Extract content using Playwright's evaluate to get rendered text
                let content = '';
                let extractedText = '';

                try {
                    // Try to get text from specific content containers first
                    extractedText = await page.evaluate(() => {
                        const selectors = [
                            '.markdown-content',
                            '.api-content',
                            '.documentation-content',
                            '.content',
                            'article',
                            'main',
                            'body'
                        ];

                        for (const selector of selectors) {
                            const elements = document.querySelectorAll(selector);
                            if (elements.length > 0) {
                                let text = '';
                                elements.forEach(el => {
                                    // Get text content, including from shadow DOM if present
                                    text += el.textContent || el.innerText || '';
                                });
                                if (text.trim().length > 100) {
                                    return { selector, text: text.trim() };
                                }
                            }
                        }

                        // Fallback: get all text from body
                        return {
                            selector: 'body',
                            text: document.body.textContent || document.body.innerText || ''
                        };
                    });

                    log(`  Extracted text from '${extractedText.selector}': ${extractedText.text.length} chars`, 'info');
                    content = extractedText.text;
                } catch (evalError) {
                    log(`  Error extracting text: ${evalError.message}`, 'error');
                }

                // Also get full HTML for link extraction
                const htmlContent = await page.content();

                // If extracted text is still empty, try getting outerHTML of content containers
                if (content.length < 100) {
                    log(`  Text extraction returned little content, trying innerHTML...`, 'warning');
                    try {
                        content = await page.evaluate(() => {
                            const selectors = ['.markdown-content', '.content', 'article', 'main', 'body'];
                            for (const selector of selectors) {
                                const el = document.querySelector(selector);
                                if (el && el.innerHTML.length > 100) {
                                    return el.innerHTML;
                                }
                            }
                            return document.body.innerHTML || '';
                        });
                        log(`  innerHTML extraction: ${content.length} chars`, 'info');
                    } catch (e) {
                        content = htmlContent;
                    }
                }

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
                    const links = extractLinks(url, htmlContent);
                    log(`  Found ${links.length} links on page`, 'info');

                    // Prioritize API-related URLs
                    const sortedLinks = links.sort((a, b) => {
                        const aIsApi = isApiRelatedUrl(a);
                        const bIsApi = isApiRelatedUrl(b);
                        if (aIsApi && !bIsApi) return -1;
                        if (!aIsApi && bIsApi) return 1;
                        return 0;
                    });

                    let newLinksQueued = 0;
                    for (const link of sortedLinks) {
                        if (!visited.has(link)) {
                            toVisit.push({ url: link, depth: depth + 1 });
                            newLinksQueued++;
                        }
                    }
                    log(`  Queued ${newLinksQueued} new links for crawling`, 'info');
                } else {
                    log(`  Max depth reached, not following links`, 'info');
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
