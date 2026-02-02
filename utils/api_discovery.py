"""
API Discovery Module for PSD2-compatible APIs

This module crawls bank websites to discover and catalog APIs that are
compatible with PSD2 (Payment Services Directive 2) regulations.
"""

import re
import logging
from urllib.parse import urljoin, urlparse
from typing import Dict, List, Set, Optional
from dataclasses import dataclass, field, asdict
from datetime import datetime

import requests
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class APIEndpoint:
    """Represents a discovered API endpoint."""
    name: str
    url: str
    source_page: str
    api_type: str  # AIS, PIS, PIIS, CAF, etc.
    description: str = ""
    version: str = ""
    documentation_url: str = ""
    swagger_url: str = ""
    sandbox_url: str = ""
    production_url: str = ""
    authentication: str = ""
    discovered_at: str = field(default_factory=lambda: datetime.now().isoformat())
    confidence_score: float = 0.0
    keywords_found: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return asdict(self)


class PSD2APIDiscovery:
    """
    Discovers PSD2-compatible APIs from bank websites.

    PSD2 API Types:
    - AIS (Account Information Service)
    - PIS (Payment Initiation Service)
    - PIIS/CAF (Payment Instrument Issuer Service / Confirmation of Funds)
    """

    # PSD2-related keywords to search for
    PSD2_KEYWORDS = {
        'general': [
            'psd2', 'open banking', 'openbanking', 'api portal', 'developer portal',
            'api documentation', 'api sandbox', 'tpp', 'third party provider',
            'berlin group', 'nextgenPSD2', 'stet', 'open bank project',
            'oauth', 'oauth2', 'openid connect', 'client credentials',
            'xs2a', 'access to account'
        ],
        'ais': [
            'account information', 'ais api', 'account access', 'balance',
            'transaction history', 'account list', 'aisp',
            'account information service', 'read account', 'get accounts',
            '/accounts', '/balances', '/transactions'
        ],
        'pis': [
            'payment initiation', 'pis api', 'pisp', 'initiate payment',
            'payment service', 'sepa payment', 'instant payment', 'bulk payment',
            'payment submission', '/payments', '/payment-initiations',
            'domestic payment', 'international payment'
        ],
        'caf': [
            'confirmation of funds', 'caf api', 'funds confirmation',
            'piis', 'card based payment', 'fundsconfirmation',
            '/funds-confirmations', 'available funds'
        ],
        'technical': [
            'swagger', 'openapi', 'api specification', 'rest api', 'json api',
            'postman', 'api reference', 'api explorer', 'try it out',
            'sandbox environment', 'test environment', 'production api'
        ]
    }

    # URL patterns that often indicate API documentation
    API_URL_PATTERNS = [
        r'/api', r'/developer', r'/openbanking', r'/psd2',
        r'/portal', r'/documentation', r'/docs', r'/swagger',
        r'/sandbox', r'/tpp', r'/xs2a', r'/oauth'
    ]

    def __init__(self, max_depth: int = 2, max_pages: int = 50, timeout: int = 10):
        """
        Initialize the API discovery crawler.

        Args:
            max_depth: Maximum depth to crawl from the starting URL
            max_pages: Maximum number of pages to crawl per domain
            timeout: Request timeout in seconds
        """
        self.max_depth = max_depth
        self.max_pages = max_pages
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (compatible; APIDiscoveryBot/1.0; PSD2 Compliance Research)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
        })

    def discover_apis(self, urls: List[str], progress_callback=None) -> Dict:
        """
        Discover PSD2 APIs from a list of URLs.

        Args:
            urls: List of bank website URLs to scan
            progress_callback: Optional callback for progress updates

        Returns:
            Dictionary containing discovered APIs and metadata
        """
        all_apis = []
        scan_results = []

        for i, url in enumerate(urls):
            if progress_callback:
                progress_callback(f"Scanning {url}...", (i + 1) / len(urls) * 100)

            try:
                result = self._scan_website(url)
                scan_results.append(result)
                all_apis.extend(result['apis'])
            except Exception as e:
                logger.error(f"Error scanning {url}: {e}")
                scan_results.append({
                    'url': url,
                    'status': 'error',
                    'error': str(e),
                    'apis': []
                })

        return {
            'total_apis_found': len(all_apis),
            'apis': all_apis,
            'scan_results': scan_results,
            'scan_timestamp': datetime.now().isoformat()
        }

    def _scan_website(self, start_url: str) -> Dict:
        """Scan a single website for PSD2 APIs."""
        parsed = urlparse(start_url)
        base_domain = f"{parsed.scheme}://{parsed.netloc}"

        visited: Set[str] = set()
        to_visit: List[tuple] = [(start_url, 0)]  # (url, depth)
        discovered_apis: List[APIEndpoint] = []
        pages_scanned = 0
        api_related_pages = []

        while to_visit and pages_scanned < self.max_pages:
            current_url, depth = to_visit.pop(0)

            if current_url in visited or depth > self.max_depth:
                continue

            visited.add(current_url)
            pages_scanned += 1

            try:
                page_result = self._analyze_page(current_url, base_domain)

                if page_result['is_api_related']:
                    api_related_pages.append({
                        'url': current_url,
                        'relevance_score': page_result['relevance_score'],
                        'keywords': page_result['keywords_found']
                    })

                    # Extract API endpoints from the page
                    apis = self._extract_apis(page_result, current_url, base_domain)
                    discovered_apis.extend(apis)

                # Add new links to visit (prioritize API-related URLs)
                if depth < self.max_depth:
                    for link in page_result['links']:
                        if link not in visited:
                            # Prioritize API-related links
                            priority = 0 if self._is_api_related_url(link) else 1
                            to_visit.append((link, depth + 1))

                    # Sort to prioritize API-related URLs
                    to_visit.sort(key=lambda x: (not self._is_api_related_url(x[0]), x[1]))

            except Exception as e:
                logger.warning(f"Error analyzing {current_url}: {e}")

        # Deduplicate APIs
        unique_apis = self._deduplicate_apis(discovered_apis)

        return {
            'url': start_url,
            'status': 'success',
            'pages_scanned': pages_scanned,
            'api_related_pages': api_related_pages,
            'apis': [api.to_dict() for api in unique_apis]
        }

    def _analyze_page(self, url: str, base_domain: str) -> Dict:
        """Analyze a single page for API-related content."""
        response = self.session.get(url, timeout=self.timeout)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'lxml')
        text_content = soup.get_text(separator=' ', strip=True).lower()

        # Find keywords
        keywords_found = []
        for category, keywords in self.PSD2_KEYWORDS.items():
            for keyword in keywords:
                if keyword.lower() in text_content:
                    keywords_found.append(f"{category}:{keyword}")

        # Calculate relevance score
        relevance_score = self._calculate_relevance(keywords_found, url)

        # Extract links
        links = self._extract_links(soup, base_domain, url)

        # Extract potential API documentation URLs
        api_docs = self._find_api_documentation(soup, base_domain, url)

        # Extract swagger/OpenAPI specs
        swagger_urls = self._find_swagger_specs(soup, response.text, base_domain, url)

        return {
            'url': url,
            'title': soup.title.string if soup.title else '',
            'is_api_related': relevance_score > 0.2,
            'relevance_score': relevance_score,
            'keywords_found': keywords_found,
            'links': links,
            'api_documentation_urls': api_docs,
            'swagger_urls': swagger_urls,
            'text_content': text_content[:5000]  # Keep first 5000 chars for analysis
        }

    def _calculate_relevance(self, keywords_found: List[str], url: str) -> float:
        """Calculate how relevant a page is to PSD2 APIs."""
        score = 0.0

        # Score based on keywords found
        categories_found = set(kw.split(':')[0] for kw in keywords_found)

        if 'general' in categories_found:
            score += 0.3
        if 'ais' in categories_found:
            score += 0.25
        if 'pis' in categories_found:
            score += 0.25
        if 'caf' in categories_found:
            score += 0.2
        if 'technical' in categories_found:
            score += 0.2

        # Bonus for URL patterns
        if self._is_api_related_url(url):
            score += 0.2

        return min(score, 1.0)

    def _is_api_related_url(self, url: str) -> bool:
        """Check if a URL looks like it might be API-related."""
        url_lower = url.lower()
        return any(re.search(pattern, url_lower) for pattern in self.API_URL_PATTERNS)

    def _extract_links(self, soup: BeautifulSoup, base_domain: str, current_url: str) -> List[str]:
        """Extract all internal links from a page."""
        links = []
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            full_url = urljoin(current_url, href)
            parsed = urlparse(full_url)

            # Only keep internal links
            if parsed.netloc == urlparse(base_domain).netloc:
                # Clean the URL (remove fragments)
                clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                if parsed.query:
                    clean_url += f"?{parsed.query}"
                links.append(clean_url)

        return list(set(links))

    def _find_api_documentation(self, soup: BeautifulSoup, base_domain: str, current_url: str) -> List[Dict]:
        """Find links to API documentation."""
        doc_links = []
        doc_keywords = ['documentation', 'docs', 'api reference', 'getting started',
                       'quickstart', 'guide', 'tutorial', 'specification']

        for a_tag in soup.find_all('a', href=True):
            link_text = a_tag.get_text(strip=True).lower()
            href = a_tag['href'].lower()

            for keyword in doc_keywords:
                if keyword in link_text or keyword in href:
                    full_url = urljoin(current_url, a_tag['href'])
                    doc_links.append({
                        'url': full_url,
                        'text': a_tag.get_text(strip=True),
                        'type': 'documentation'
                    })
                    break

        return doc_links

    def _find_swagger_specs(self, soup: BeautifulSoup, html_content: str,
                           base_domain: str, current_url: str) -> List[str]:
        """Find Swagger/OpenAPI specification URLs."""
        swagger_urls = []

        # Look for common swagger patterns in the HTML
        patterns = [
            r'swagger[.-]?ui',
            r'openapi',
            r'api-?docs',
            r'\.yaml["\']',
            r'\.json["\'].*swagger',
            r'swagger\.json',
            r'openapi\.json',
            r'openapi\.yaml'
        ]

        for pattern in patterns:
            matches = re.findall(rf'["\']([^"\']*{pattern}[^"\']*)["\']', html_content, re.I)
            for match in matches:
                full_url = urljoin(current_url, match)
                swagger_urls.append(full_url)

        # Look for links with swagger in the text
        for a_tag in soup.find_all('a', href=True):
            text = a_tag.get_text(strip=True).lower()
            href = a_tag['href'].lower()
            if 'swagger' in text or 'swagger' in href or 'openapi' in text or 'openapi' in href:
                full_url = urljoin(current_url, a_tag['href'])
                swagger_urls.append(full_url)

        return list(set(swagger_urls))

    def _extract_apis(self, page_result: Dict, source_url: str, base_domain: str) -> List[APIEndpoint]:
        """Extract API endpoint information from analyzed page data."""
        apis = []

        # Determine API types from keywords
        api_types = self._determine_api_types(page_result['keywords_found'])

        # Create API entries based on found documentation
        for api_type in api_types:
            api = APIEndpoint(
                name=f"{urlparse(base_domain).netloc} - {api_type}",
                url=base_domain,
                source_page=source_url,
                api_type=api_type,
                description=self._extract_description(page_result),
                confidence_score=page_result['relevance_score'],
                keywords_found=page_result['keywords_found']
            )

            # Add documentation URLs if found
            if page_result['api_documentation_urls']:
                api.documentation_url = page_result['api_documentation_urls'][0]['url']

            # Add swagger URLs if found
            if page_result['swagger_urls']:
                api.swagger_url = page_result['swagger_urls'][0]

            apis.append(api)

        return apis

    def _determine_api_types(self, keywords_found: List[str]) -> List[str]:
        """Determine what types of PSD2 APIs are available based on keywords."""
        types = []

        keywords_str = ' '.join(keywords_found).lower()

        if any(kw in keywords_str for kw in ['ais', 'account information', 'aisp']):
            types.append('AIS')
        if any(kw in keywords_str for kw in ['pis', 'payment initiation', 'pisp']):
            types.append('PIS')
        if any(kw in keywords_str for kw in ['caf', 'confirmation of funds', 'piis']):
            types.append('CAF')

        # Default to general PSD2 if specific types not found but PSD2 keywords exist
        if not types and any('general' in kw for kw in keywords_found):
            types.append('PSD2')

        return types if types else ['Unknown']

    def _extract_description(self, page_result: Dict) -> str:
        """Extract a brief description from the page content."""
        content = page_result.get('text_content', '')

        # Try to find a relevant sentence
        sentences = re.split(r'[.!?]', content)
        for sentence in sentences[:20]:  # Check first 20 sentences
            if any(keyword in sentence.lower() for keyword in ['api', 'psd2', 'banking', 'payment']):
                clean_sentence = ' '.join(sentence.split())[:300]
                if len(clean_sentence) > 20:
                    return clean_sentence + '...'

        return page_result.get('title', 'No description available')

    def _deduplicate_apis(self, apis: List[APIEndpoint]) -> List[APIEndpoint]:
        """Remove duplicate API entries."""
        seen = set()
        unique = []

        for api in apis:
            key = (api.url, api.api_type)
            if key not in seen:
                seen.add(key)
                unique.append(api)

        return unique
