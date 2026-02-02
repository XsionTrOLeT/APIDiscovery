/**
 * PSD2 API Discovery - Enhanced Client-Side Discovery Engine
 *
 * This module crawls bank developer portals to discover PSD2-compatible APIs.
 * It understands common portal structures like product listings and documentation pages.
 */

class PSD2APIDiscovery {
    // CORS proxy options
    static CORS_PROXIES = [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest='
    ];

    // PSD2 API type definitions
    static API_TYPES = {
        AIS: {
            name: 'Account Information Service',
            keywords: ['account information', 'ais', 'aisp', 'account access', 'balance',
                      'transaction', 'account list', 'read account', 'get accounts',
                      'account details', 'account data']
        },
        PIS: {
            name: 'Payment Initiation Service',
            keywords: ['payment initiation', 'pis', 'pisp', 'initiate payment',
                      'payment service', 'sepa payment', 'instant payment', 'bulk payment',
                      'payment submission', 'domestic payment', 'international payment',
                      'payment request', 'transfer']
        },
        CAF: {
            name: 'Confirmation of Funds',
            keywords: ['confirmation of funds', 'caf', 'funds confirmation',
                      'piis', 'card based payment', 'available funds', 'fund check']
        },
        OAUTH: {
            name: 'OAuth/Authentication',
            keywords: ['oauth', 'authorization', 'authentication', 'token', 'consent',
                      'openid', 'identity', 'login', 'access token']
        }
    };

    // Patterns for detecting product/API listings
    static PRODUCT_PATTERNS = {
        // Common CSS classes/IDs for product cards
        cardSelectors: [
            '.product-card', '.api-card', '.product-item', '.api-item',
            '[class*="product"]', '[class*="api-card"]', '[class*="service-card"]',
            '.card', '.tile', '.listing-item', '.grid-item'
        ],
        // Link patterns that lead to API details
        detailLinkPatterns: [
            /\/products?\//i, /\/apis?\//i, /\/services?\//i,
            /\/openbanking\//i, /\/psd2\//i, /\/documentation/i,
            /\/overview/i, /\/details/i, /\/specification/i
        ],
        // Patterns for documentation links
        docLinkPatterns: [
            /documentation/i, /docs/i, /api-?reference/i, /specification/i,
            /swagger/i, /openapi/i, /developer/i, /guide/i
        ]
    };

    constructor(options = {}) {
        this.maxDepth = options.maxDepth || 3;
        this.maxPages = options.maxPages || 50;
        this.timeout = options.timeout || 20000;
        this.proxyIndex = 0;
        this.onProgress = options.onProgress || (() => {});
        this.onLog = options.onLog || (() => {});
        this.discoveredProducts = new Map();
    }

    /**
     * Discover PSD2 APIs from a list of URLs
     */
    async discoverApis(urls) {
        const allApis = [];
        const scanResults = [];

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            this.onProgress(`Scanning ${url}...`, ((i) / urls.length) * 100);

            try {
                const result = await this.scanPortal(url);
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

        this.onProgress('Scan complete!', 100);

        return {
            totalApisFound: allApis.length,
            apis: this.deduplicateApis(allApis),
            scanResults: scanResults,
            scanTimestamp: new Date().toISOString()
        };
    }

    /**
     * Scan a developer portal for APIs
     */
    async scanPortal(startUrl) {
        const parsedUrl = new URL(startUrl);
        const baseDomain = `${parsedUrl.protocol}//${parsedUrl.hostname}`;

        this.discoveredProducts.clear();
        const visited = new Set();
        const toVisit = [{ url: startUrl, depth: 0, type: 'listing' }];
        const discoveredApis = [];
        let pagesScanned = 0;

        this.onLog(`Starting scan of ${baseDomain}`, 'info');

        while (toVisit.length > 0 && pagesScanned < this.maxPages) {
            // Prioritize: listing pages first, then detail pages, then doc pages
            toVisit.sort((a, b) => {
                const priority = { listing: 0, detail: 1, documentation: 2, other: 3 };
                return (priority[a.type] || 3) - (priority[b.type] || 3);
            });

            const { url: currentUrl, depth, type } = toVisit.shift();

            if (visited.has(currentUrl) || depth > this.maxDepth) {
                continue;
            }

            visited.add(currentUrl);
            pagesScanned++;

            try {
                this.onLog(`[${type}] Scanning: ${currentUrl}`, 'info');
                const pageData = await this.fetchAndParse(currentUrl);

                if (!pageData) continue;

                // Analyze the page based on its type
                if (type === 'listing' || depth === 0) {
                    // Look for product/API cards on listing pages
                    const products = this.extractProductListings(pageData, currentUrl, baseDomain);

                    for (const product of products) {
                        if (!visited.has(product.detailUrl)) {
                            toVisit.push({
                                url: product.detailUrl,
                                depth: depth + 1,
                                type: 'detail',
                                productInfo: product
                            });
                        }
                    }

                    if (products.length > 0) {
                        this.onLog(`Found ${products.length} API products on listing page`, 'success');
                    }
                }

                // Extract API information from current page
                const apis = this.extractApiInfo(pageData, currentUrl, baseDomain, type);
                discoveredApis.push(...apis);

                if (apis.length > 0) {
                    this.onLog(`Extracted ${apis.length} API(s) from ${currentUrl}`, 'success');
                }

                // Find more links to explore
                if (depth < this.maxDepth) {
                    const newLinks = this.findRelevantLinks(pageData, currentUrl, baseDomain, visited);
                    for (const link of newLinks) {
                        if (!visited.has(link.url)) {
                            toVisit.push({ url: link.url, depth: depth + 1, type: link.type });
                        }
                    }
                }

            } catch (error) {
                this.onLog(`Error analyzing ${currentUrl}: ${error.message}`, 'error');
            }
        }

        const uniqueApis = this.deduplicateApis(discoveredApis);
        this.onLog(`Completed: Found ${uniqueApis.length} unique API(s)`, 'success');

        return {
            url: startUrl,
            status: 'success',
            pagesScanned,
            apis: uniqueApis
        };
    }

    /**
     * Fetch and parse a URL
     */
    async fetchAndParse(url) {
        const html = await this.fetchWithProxy(url);
        if (!html) return null;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const textContent = doc.body?.textContent || '';

        return { doc, html, textContent, url };
    }

    /**
     * Fetch a URL using CORS proxy with retry logic
     */
    async fetchWithProxy(url, retryCount = 0) {
        const maxRetries = PSD2APIDiscovery.CORS_PROXIES.length;
        const proxyIndex = (this.proxyIndex + retryCount) % maxRetries;
        const proxy = PSD2APIDiscovery.CORS_PROXIES[proxyIndex];
        const proxyUrl = proxy + encodeURIComponent(url);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(proxyUrl, {
                signal: controller.signal,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
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
            if (retryCount < maxRetries - 1) {
                this.onLog(`Proxy failed, trying alternative...`, 'info');
                return this.fetchWithProxy(url, retryCount + 1);
            }

            throw error;
        }
    }

    /**
     * Extract product listings from a page (API cards, product tiles, etc.)
     */
    extractProductListings(pageData, currentUrl, baseDomain) {
        const { doc } = pageData;
        const products = [];

        // Try to find product cards using various selectors
        for (const selector of PSD2APIDiscovery.PRODUCT_PATTERNS.cardSelectors) {
            try {
                const cards = doc.querySelectorAll(selector);
                for (const card of cards) {
                    const product = this.parseProductCard(card, currentUrl, baseDomain);
                    if (product) {
                        products.push(product);
                    }
                }
            } catch (e) {
                // Selector might be invalid, continue
            }
        }

        // Also look for links that match product/API patterns
        const links = doc.querySelectorAll('a[href]');
        for (const link of links) {
            const href = link.getAttribute('href');
            const text = link.textContent?.trim();

            if (this.isProductLink(href, text)) {
                const fullUrl = this.resolveUrl(href, currentUrl);
                if (fullUrl && fullUrl.startsWith(baseDomain)) {
                    // Check if we already have this product
                    const existing = products.find(p => p.detailUrl === fullUrl);
                    if (!existing) {
                        products.push({
                            name: text || 'Unknown API',
                            detailUrl: fullUrl,
                            sourceUrl: currentUrl,
                            apiType: this.detectApiType(text + ' ' + href)
                        });
                    }
                }
            }
        }

        return products;
    }

    /**
     * Parse a product card element
     */
    parseProductCard(card, currentUrl, baseDomain) {
        // Find the title
        const titleEl = card.querySelector('h1, h2, h3, h4, .title, .name, [class*="title"], [class*="name"]');
        const title = titleEl?.textContent?.trim();

        // Find the link
        const linkEl = card.querySelector('a[href]') || card.closest('a[href]');
        const href = linkEl?.getAttribute('href');

        // Find description
        const descEl = card.querySelector('p, .description, [class*="description"], [class*="desc"]');
        const description = descEl?.textContent?.trim();

        if (!title && !href) return null;

        const fullUrl = href ? this.resolveUrl(href, currentUrl) : null;

        // Only include if it looks like an API/product
        const cardText = card.textContent?.toLowerCase() || '';
        const isApiRelated = this.isApiRelatedContent(cardText);

        if (!isApiRelated && !this.isProductLink(href, title)) return null;

        return {
            name: title || 'Unknown API',
            description: description || '',
            detailUrl: fullUrl,
            sourceUrl: currentUrl,
            apiType: this.detectApiType(cardText)
        };
    }

    /**
     * Check if a link looks like it leads to a product/API page
     */
    isProductLink(href, text) {
        if (!href) return false;

        const combined = (href + ' ' + (text || '')).toLowerCase();

        // Check for API-related terms
        const apiTerms = ['api', 'product', 'service', 'account', 'payment', 'psd2',
                         'openbanking', 'ais', 'pis', 'oauth', 'documentation'];

        if (apiTerms.some(term => combined.includes(term))) {
            return true;
        }

        // Check URL patterns
        return PSD2APIDiscovery.PRODUCT_PATTERNS.detailLinkPatterns.some(p => p.test(href));
    }

    /**
     * Check if content is API-related
     */
    isApiRelatedContent(text) {
        const lowerText = text.toLowerCase();
        const apiKeywords = [
            'api', 'psd2', 'openbanking', 'open banking', 'account information',
            'payment initiation', 'oauth', 'authorization', 'rest', 'endpoint',
            'sandbox', 'production', 'ais', 'pis', 'aisp', 'pisp'
        ];
        return apiKeywords.some(kw => lowerText.includes(kw));
    }

    /**
     * Extract API information from a page
     */
    extractApiInfo(pageData, currentUrl, baseDomain, pageType) {
        const { doc, textContent } = pageData;
        const apis = [];

        const title = doc.querySelector('h1')?.textContent?.trim() ||
                     doc.querySelector('title')?.textContent?.trim() ||
                     'Unknown API';

        const description = this.extractDescription(doc, textContent);
        const apiType = this.detectApiType(textContent);

        // Only create an API entry if the page seems to be about a specific API
        if (pageType === 'detail' || pageType === 'documentation' || this.isApiDetailPage(doc, textContent)) {

            // Find documentation URL
            const docUrl = this.findDocumentationUrl(doc, currentUrl);

            // Find swagger/OpenAPI URL
            const swaggerUrl = this.findSwaggerUrl(doc, pageData.html, currentUrl);

            // Find version info
            const version = this.extractVersion(doc, textContent);

            // Find sandbox URL
            const sandboxUrl = this.findSandboxUrl(doc, currentUrl);

            const api = {
                name: this.cleanTitle(title),
                url: baseDomain,
                source_page: currentUrl,
                api_type: apiType,
                description: description,
                version: version,
                documentation_url: docUrl || currentUrl,
                swagger_url: swaggerUrl,
                sandbox_url: sandboxUrl,
                production_url: '',
                authentication: this.detectAuthMethod(textContent),
                discovered_at: new Date().toISOString(),
                confidence_score: this.calculateConfidence(pageType, textContent, apiType),
                keywords_found: this.extractKeywords(textContent)
            };

            apis.push(api);
        }

        return apis;
    }

    /**
     * Check if a page is an API detail page
     */
    isApiDetailPage(doc, textContent) {
        const lowerText = textContent.toLowerCase();

        // Check for typical API documentation patterns
        const indicators = [
            'endpoint', 'request', 'response', 'http', 'get ', 'post ', 'put ',
            'authorization', 'header', 'parameter', 'api reference', 'specification',
            'sandbox', 'production', 'base url', 'authentication'
        ];

        const matchCount = indicators.filter(i => lowerText.includes(i)).length;
        return matchCount >= 3;
    }

    /**
     * Detect the API type from content
     */
    detectApiType(text) {
        const lowerText = text.toLowerCase();

        for (const [type, config] of Object.entries(PSD2APIDiscovery.API_TYPES)) {
            if (config.keywords.some(kw => lowerText.includes(kw))) {
                return type;
            }
        }

        return 'PSD2';
    }

    /**
     * Extract a clean description
     */
    extractDescription(doc, textContent) {
        // Try meta description first
        const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content');
        if (metaDesc && metaDesc.length > 20) {
            return metaDesc.substring(0, 300);
        }

        // Try first meaningful paragraph
        const paragraphs = doc.querySelectorAll('p');
        for (const p of paragraphs) {
            const text = p.textContent?.trim();
            if (text && text.length > 50 && text.length < 500) {
                if (this.isApiRelatedContent(text)) {
                    return text.substring(0, 300);
                }
            }
        }

        // Fall back to extracting from text content
        const sentences = textContent.split(/[.!?]/);
        for (const sentence of sentences.slice(0, 30)) {
            const clean = sentence.trim().replace(/\s+/g, ' ');
            if (clean.length > 30 && clean.length < 300 && this.isApiRelatedContent(clean)) {
                return clean;
            }
        }

        return 'PSD2 Banking API';
    }

    /**
     * Find documentation URL on the page
     */
    findDocumentationUrl(doc, currentUrl) {
        const links = doc.querySelectorAll('a[href]');

        for (const link of links) {
            const href = link.getAttribute('href');
            const text = link.textContent?.toLowerCase() || '';

            if (PSD2APIDiscovery.PRODUCT_PATTERNS.docLinkPatterns.some(p => p.test(href) || p.test(text))) {
                return this.resolveUrl(href, currentUrl);
            }
        }

        return null;
    }

    /**
     * Find Swagger/OpenAPI URL
     */
    findSwaggerUrl(doc, html, currentUrl) {
        // Check for swagger links
        const links = doc.querySelectorAll('a[href]');
        for (const link of links) {
            const href = link.getAttribute('href')?.toLowerCase() || '';
            const text = link.textContent?.toLowerCase() || '';

            if (href.includes('swagger') || href.includes('openapi') ||
                text.includes('swagger') || text.includes('openapi') ||
                href.endsWith('.yaml') || href.endsWith('.json')) {
                return this.resolveUrl(link.getAttribute('href'), currentUrl);
            }
        }

        // Check for embedded swagger URLs in the HTML
        const swaggerMatch = html.match(/["'](https?:\/\/[^"']*(?:swagger|openapi)[^"']*)["']/i);
        if (swaggerMatch) {
            return swaggerMatch[1];
        }

        return '';
    }

    /**
     * Find sandbox URL
     */
    findSandboxUrl(doc, currentUrl) {
        const links = doc.querySelectorAll('a[href]');

        for (const link of links) {
            const href = link.getAttribute('href')?.toLowerCase() || '';
            const text = link.textContent?.toLowerCase() || '';

            if (href.includes('sandbox') || text.includes('sandbox') ||
                text.includes('test environment') || text.includes('try it')) {
                return this.resolveUrl(link.getAttribute('href'), currentUrl);
            }
        }

        return '';
    }

    /**
     * Extract version information
     */
    extractVersion(doc, textContent) {
        // Look for version patterns
        const versionPatterns = [
            /version[:\s]+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i,
            /v([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i,
            /api[:\s]+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i
        ];

        for (const pattern of versionPatterns) {
            const match = textContent.match(pattern);
            if (match) {
                return match[1];
            }
        }

        return '';
    }

    /**
     * Detect authentication method
     */
    detectAuthMethod(textContent) {
        const lowerText = textContent.toLowerCase();

        if (lowerText.includes('oauth 2') || lowerText.includes('oauth2')) {
            return 'OAuth 2.0';
        }
        if (lowerText.includes('oauth')) {
            return 'OAuth';
        }
        if (lowerText.includes('openid connect') || lowerText.includes('oidc')) {
            return 'OpenID Connect';
        }
        if (lowerText.includes('mtls') || lowerText.includes('mutual tls')) {
            return 'mTLS';
        }
        if (lowerText.includes('api key')) {
            return 'API Key';
        }
        if (lowerText.includes('bearer')) {
            return 'Bearer Token';
        }

        return '';
    }

    /**
     * Extract keywords found on the page
     */
    extractKeywords(textContent) {
        const keywords = [];
        const lowerText = textContent.toLowerCase();

        for (const [type, config] of Object.entries(PSD2APIDiscovery.API_TYPES)) {
            for (const keyword of config.keywords) {
                if (lowerText.includes(keyword)) {
                    keywords.push(`${type}:${keyword}`);
                }
            }
        }

        // Add general PSD2 keywords
        const generalKeywords = ['psd2', 'open banking', 'berlin group', 'stet', 'xs2a'];
        for (const kw of generalKeywords) {
            if (lowerText.includes(kw)) {
                keywords.push(`general:${kw}`);
            }
        }

        return [...new Set(keywords)];
    }

    /**
     * Calculate confidence score
     */
    calculateConfidence(pageType, textContent, apiType) {
        let score = 0.3; // Base score

        if (pageType === 'documentation') score += 0.3;
        if (pageType === 'detail') score += 0.2;

        if (apiType !== 'PSD2') score += 0.2;

        const indicators = ['endpoint', 'sandbox', 'production', 'authentication', 'api reference'];
        const matchCount = indicators.filter(i => textContent.toLowerCase().includes(i)).length;
        score += matchCount * 0.05;

        return Math.min(score, 1.0);
    }

    /**
     * Find relevant links to explore
     */
    findRelevantLinks(pageData, currentUrl, baseDomain, visited) {
        const { doc } = pageData;
        const links = [];

        doc.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href');
            const text = a.textContent?.toLowerCase() || '';

            const fullUrl = this.resolveUrl(href, currentUrl);
            if (!fullUrl || !fullUrl.startsWith(baseDomain) || visited.has(fullUrl)) {
                return;
            }

            let type = 'other';
            const hrefLower = href?.toLowerCase() || '';

            if (hrefLower.includes('documentation') || text.includes('documentation') ||
                hrefLower.includes('docs') || hrefLower.includes('reference')) {
                type = 'documentation';
            } else if (hrefLower.includes('product') || hrefLower.includes('api') ||
                       hrefLower.includes('service') || hrefLower.includes('overview')) {
                type = 'detail';
            } else if (this.isApiRelatedContent(text + ' ' + href)) {
                type = 'detail';
            }

            if (type !== 'other') {
                links.push({ url: fullUrl, type });
            }
        });

        return links;
    }

    /**
     * Clean up a title
     */
    cleanTitle(title) {
        return title
            .replace(/\s*[-|]\s*.+$/, '') // Remove site name after - or |
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 100);
    }

    /**
     * Resolve a relative URL
     */
    resolveUrl(href, baseUrl) {
        if (!href) return null;
        try {
            return new URL(href, baseUrl).href.split('#')[0];
        } catch {
            return null;
        }
    }

    /**
     * Remove duplicate API entries
     */
    deduplicateApis(apis) {
        const seen = new Map();

        for (const api of apis) {
            const key = `${api.name}|${api.api_type}`;
            const existing = seen.get(key);

            if (!existing || api.confidence_score > existing.confidence_score) {
                seen.set(key, api);
            }
        }

        return Array.from(seen.values());
    }
}

// Export for use in app.js
window.PSD2APIDiscovery = PSD2APIDiscovery;
