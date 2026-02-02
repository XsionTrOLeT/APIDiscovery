/**
 * PSD2 API Discovery - Client-Side Discovery Engine
 *
 * This module crawls bank websites to discover PSD2-compatible APIs.
 * It runs entirely in the browser using a CORS proxy.
 */

class PSD2APIDiscovery {
    // CORS proxy options (we'll try multiple in case one fails)
    static CORS_PROXIES = [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?',
    ];

    // PSD2-related keywords to search for
    static PSD2_KEYWORDS = {
        general: [
            'psd2', 'open banking', 'openbanking', 'api portal', 'developer portal',
            'api documentation', 'api sandbox', 'tpp', 'third party provider',
            'berlin group', 'nextgenpsd2', 'stet', 'open bank project',
            'oauth', 'oauth2', 'openid connect', 'client credentials',
            'xs2a', 'access to account'
        ],
        ais: [
            'account information', 'ais api', 'ais-api', 'account access', 'balance',
            'transaction history', 'account list', 'aisp',
            'account information service', 'read account', 'get accounts',
            '/accounts', '/balances', '/transactions'
        ],
        pis: [
            'payment initiation', 'pis api', 'pis-api', 'pisp', 'initiate payment',
            'payment service', 'sepa payment', 'instant payment', 'bulk payment',
            'payment submission', '/payments', '/payment-initiations',
            'domestic payment', 'international payment'
        ],
        caf: [
            'confirmation of funds', 'caf api', 'caf-api', 'funds confirmation',
            'piis', 'card based payment', 'fundsconfirmation',
            '/funds-confirmations', 'available funds'
        ],
        technical: [
            'swagger', 'openapi', 'api specification', 'rest api', 'json api',
            'postman', 'api reference', 'api explorer', 'try it out',
            'sandbox environment', 'test environment', 'production api'
        ]
    };

    // URL patterns that often indicate API documentation
    static API_URL_PATTERNS = [
        /\/api/i, /\/developer/i, /\/openbanking/i, /\/psd2/i,
        /\/portal/i, /\/documentation/i, /\/docs/i, /\/swagger/i,
        /\/sandbox/i, /\/tpp/i, /\/xs2a/i, /\/oauth/i
    ];

    constructor(options = {}) {
        this.maxDepth = options.maxDepth || 2;
        this.maxPages = options.maxPages || 30;
        this.timeout = options.timeout || 15000;
        this.proxyIndex = 0;
        this.onProgress = options.onProgress || (() => {});
        this.onLog = options.onLog || (() => {});
    }

    /**
     * Discover PSD2 APIs from a list of URLs
     */
    async discoverApis(urls) {
        const allApis = [];
        const scanResults = [];

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            this.onProgress(`Scanning ${url}...`, ((i + 1) / urls.length) * 100);

            try {
                const result = await this.scanWebsite(url);
                scanResults.push(result);
                allApis.push(...result.apis);
            } catch (error) {
                this.onLog(`Error scanning ${url}: ${error.message}`, 'error');
                scanResults.push({
                    url: url,
                    status: 'error',
                    error: error.message,
                    apis: [],
                    pagesScanned: 0
                });
            }
        }

        return {
            totalApisFound: allApis.length,
            apis: allApis,
            scanResults: scanResults,
            scanTimestamp: new Date().toISOString()
        };
    }

    /**
     * Scan a single website for PSD2 APIs
     */
    async scanWebsite(startUrl) {
        const parsedUrl = new URL(startUrl);
        const baseDomain = `${parsedUrl.protocol}//${parsedUrl.hostname}`;

        const visited = new Set();
        const toVisit = [{ url: startUrl, depth: 0 }];
        const discoveredApis = [];
        const apiRelatedPages = [];
        let pagesScanned = 0;

        this.onLog(`Starting scan of ${baseDomain}`, 'info');

        while (toVisit.length > 0 && pagesScanned < this.maxPages) {
            const { url: currentUrl, depth } = toVisit.shift();

            if (visited.has(currentUrl) || depth > this.maxDepth) {
                continue;
            }

            visited.add(currentUrl);
            pagesScanned++;

            try {
                this.onLog(`Scanning: ${currentUrl}`, 'info');
                const pageResult = await this.analyzePage(currentUrl, baseDomain);

                if (pageResult.isApiRelated) {
                    apiRelatedPages.push({
                        url: currentUrl,
                        relevanceScore: pageResult.relevanceScore,
                        keywords: pageResult.keywordsFound
                    });

                    // Extract API endpoints from the page
                    const apis = this.extractApis(pageResult, currentUrl, baseDomain);
                    discoveredApis.push(...apis);

                    this.onLog(`Found API-related page: ${currentUrl} (score: ${pageResult.relevanceScore.toFixed(2)})`, 'success');
                }

                // Add new links to visit (prioritize API-related URLs)
                if (depth < this.maxDepth) {
                    for (const link of pageResult.links) {
                        if (!visited.has(link)) {
                            toVisit.push({ url: link, depth: depth + 1 });
                        }
                    }

                    // Sort to prioritize API-related URLs
                    toVisit.sort((a, b) => {
                        const aIsApi = this.isApiRelatedUrl(a.url) ? 0 : 1;
                        const bIsApi = this.isApiRelatedUrl(b.url) ? 0 : 1;
                        return aIsApi - bIsApi || a.depth - b.depth;
                    });
                }

            } catch (error) {
                this.onLog(`Error analyzing ${currentUrl}: ${error.message}`, 'error');
            }
        }

        // Deduplicate APIs
        const uniqueApis = this.deduplicateApis(discoveredApis);

        this.onLog(`Completed scan of ${baseDomain}: ${uniqueApis.length} APIs found`, 'success');

        return {
            url: startUrl,
            status: 'success',
            pagesScanned: pagesScanned,
            apiRelatedPages: apiRelatedPages,
            apis: uniqueApis
        };
    }

    /**
     * Fetch a URL using CORS proxy
     */
    async fetchWithProxy(url) {
        const proxy = PSD2APIDiscovery.CORS_PROXIES[this.proxyIndex];
        const proxyUrl = proxy + encodeURIComponent(url);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(proxyUrl, {
                signal: controller.signal,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.text();
        } catch (error) {
            clearTimeout(timeoutId);

            // Try next proxy
            if (this.proxyIndex < PSD2APIDiscovery.CORS_PROXIES.length - 1) {
                this.proxyIndex++;
                return this.fetchWithProxy(url);
            }

            throw error;
        }
    }

    /**
     * Analyze a single page for API-related content
     */
    async analyzePage(url, baseDomain) {
        const html = await this.fetchWithProxy(url);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const textContent = doc.body?.textContent?.toLowerCase() || '';

        // Find keywords
        const keywordsFound = [];
        for (const [category, keywords] of Object.entries(PSD2APIDiscovery.PSD2_KEYWORDS)) {
            for (const keyword of keywords) {
                if (textContent.includes(keyword.toLowerCase())) {
                    keywordsFound.push(`${category}:${keyword}`);
                }
            }
        }

        // Calculate relevance score
        const relevanceScore = this.calculateRelevance(keywordsFound, url);

        // Extract links
        const links = this.extractLinks(doc, baseDomain, url);

        // Extract potential API documentation URLs
        const apiDocs = this.findApiDocumentation(doc, baseDomain, url);

        // Extract swagger/OpenAPI specs
        const swaggerUrls = this.findSwaggerSpecs(doc, html, baseDomain, url);

        return {
            url: url,
            title: doc.title || '',
            isApiRelated: relevanceScore > 0.2,
            relevanceScore: relevanceScore,
            keywordsFound: keywordsFound,
            links: links,
            apiDocumentationUrls: apiDocs,
            swaggerUrls: swaggerUrls,
            textContent: textContent.substring(0, 5000)
        };
    }

    /**
     * Calculate how relevant a page is to PSD2 APIs
     */
    calculateRelevance(keywordsFound, url) {
        let score = 0.0;

        const categoriesFound = new Set(keywordsFound.map(kw => kw.split(':')[0]));

        if (categoriesFound.has('general')) score += 0.3;
        if (categoriesFound.has('ais')) score += 0.25;
        if (categoriesFound.has('pis')) score += 0.25;
        if (categoriesFound.has('caf')) score += 0.2;
        if (categoriesFound.has('technical')) score += 0.2;

        // Bonus for URL patterns
        if (this.isApiRelatedUrl(url)) score += 0.2;

        return Math.min(score, 1.0);
    }

    /**
     * Check if a URL looks like it might be API-related
     */
    isApiRelatedUrl(url) {
        return PSD2APIDiscovery.API_URL_PATTERNS.some(pattern => pattern.test(url));
    }

    /**
     * Extract all internal links from a page
     */
    extractLinks(doc, baseDomain, currentUrl) {
        const links = new Set();
        const baseHostname = new URL(baseDomain).hostname;

        doc.querySelectorAll('a[href]').forEach(a => {
            try {
                const href = a.getAttribute('href');
                if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
                    return;
                }

                const fullUrl = new URL(href, currentUrl);

                // Only keep internal links
                if (fullUrl.hostname === baseHostname) {
                    // Clean the URL (remove fragments)
                    fullUrl.hash = '';
                    links.add(fullUrl.href);
                }
            } catch (e) {
                // Invalid URL, skip
            }
        });

        return Array.from(links);
    }

    /**
     * Find links to API documentation
     */
    findApiDocumentation(doc, baseDomain, currentUrl) {
        const docLinks = [];
        const docKeywords = [
            'documentation', 'docs', 'api reference', 'getting started',
            'quickstart', 'guide', 'tutorial', 'specification'
        ];

        doc.querySelectorAll('a[href]').forEach(a => {
            const linkText = a.textContent?.toLowerCase() || '';
            const href = a.getAttribute('href')?.toLowerCase() || '';

            for (const keyword of docKeywords) {
                if (linkText.includes(keyword) || href.includes(keyword)) {
                    try {
                        const fullUrl = new URL(a.getAttribute('href'), currentUrl);
                        docLinks.push({
                            url: fullUrl.href,
                            text: a.textContent?.trim(),
                            type: 'documentation'
                        });
                    } catch (e) {
                        // Invalid URL
                    }
                    break;
                }
            }
        });

        return docLinks;
    }

    /**
     * Find Swagger/OpenAPI specification URLs
     */
    findSwaggerSpecs(doc, html, baseDomain, currentUrl) {
        const swaggerUrls = new Set();

        // Look for common swagger patterns in the HTML
        const patterns = [
            /swagger[.-]?ui/gi,
            /openapi/gi,
            /api-?docs/gi,
            /swagger\.json/gi,
            /openapi\.json/gi,
            /openapi\.yaml/gi
        ];

        for (const pattern of patterns) {
            const matches = html.match(new RegExp(`["']([^"']*${pattern.source}[^"']*)["']`, 'gi'));
            if (matches) {
                for (const match of matches) {
                    const url = match.replace(/["']/g, '');
                    try {
                        const fullUrl = new URL(url, currentUrl);
                        swaggerUrls.add(fullUrl.href);
                    } catch (e) {
                        // Invalid URL
                    }
                }
            }
        }

        // Look for links with swagger in the text
        doc.querySelectorAll('a[href]').forEach(a => {
            const text = a.textContent?.toLowerCase() || '';
            const href = a.getAttribute('href')?.toLowerCase() || '';
            if (text.includes('swagger') || href.includes('swagger') ||
                text.includes('openapi') || href.includes('openapi')) {
                try {
                    const fullUrl = new URL(a.getAttribute('href'), currentUrl);
                    swaggerUrls.add(fullUrl.href);
                } catch (e) {
                    // Invalid URL
                }
            }
        });

        return Array.from(swaggerUrls);
    }

    /**
     * Extract API endpoint information from analyzed page data
     */
    extractApis(pageResult, sourceUrl, baseDomain) {
        const apis = [];
        const apiTypes = this.determineApiTypes(pageResult.keywordsFound);
        const hostname = new URL(baseDomain).hostname;

        for (const apiType of apiTypes) {
            const api = {
                name: `${hostname} - ${apiType}`,
                url: baseDomain,
                source_page: sourceUrl,
                api_type: apiType,
                description: this.extractDescription(pageResult),
                version: '',
                documentation_url: pageResult.apiDocumentationUrls[0]?.url || '',
                swagger_url: pageResult.swaggerUrls[0] || '',
                sandbox_url: '',
                production_url: '',
                authentication: '',
                discovered_at: new Date().toISOString(),
                confidence_score: pageResult.relevanceScore,
                keywords_found: pageResult.keywordsFound
            };

            apis.push(api);
        }

        return apis;
    }

    /**
     * Determine what types of PSD2 APIs are available based on keywords
     */
    determineApiTypes(keywordsFound) {
        const types = [];
        const keywordsStr = keywordsFound.join(' ').toLowerCase();

        if (keywordsStr.includes('ais') || keywordsStr.includes('account information') || keywordsStr.includes('aisp')) {
            types.push('AIS');
        }
        if (keywordsStr.includes('pis') || keywordsStr.includes('payment initiation') || keywordsStr.includes('pisp')) {
            types.push('PIS');
        }
        if (keywordsStr.includes('caf') || keywordsStr.includes('confirmation of funds') || keywordsStr.includes('piis')) {
            types.push('CAF');
        }

        // Default to general PSD2 if specific types not found but PSD2 keywords exist
        if (types.length === 0 && keywordsFound.some(kw => kw.startsWith('general:'))) {
            types.push('PSD2');
        }

        return types.length > 0 ? types : ['Unknown'];
    }

    /**
     * Extract a brief description from the page content
     */
    extractDescription(pageResult) {
        const content = pageResult.textContent || '';
        const sentences = content.split(/[.!?]/);

        for (const sentence of sentences.slice(0, 20)) {
            if (['api', 'psd2', 'banking', 'payment', 'account'].some(kw => sentence.includes(kw))) {
                const cleanSentence = sentence.trim().replace(/\s+/g, ' ').substring(0, 300);
                if (cleanSentence.length > 20) {
                    return cleanSentence + '...';
                }
            }
        }

        return pageResult.title || 'No description available';
    }

    /**
     * Remove duplicate API entries
     */
    deduplicateApis(apis) {
        const seen = new Set();
        const unique = [];

        for (const api of apis) {
            const key = `${api.url}|${api.api_type}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(api);
            }
        }

        return unique;
    }
}

// Export for use in app.js
window.PSD2APIDiscovery = PSD2APIDiscovery;
