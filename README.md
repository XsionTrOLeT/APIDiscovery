# PSD2 API Discovery

A web application for discovering and inventorying PSD2-compatible banking APIs from public bank websites.

**Live Demo**: [https://xsionttrolet.github.io/APIDiscovery/](https://xsionttrolet.github.io/APIDiscovery/)

## Overview

This tool helps with API compliance automation by:
- Scanning bank websites to discover PSD2 APIs
- Creating an inventory of all discovered APIs
- Identifying API types (AIS, PIS, CAF)
- Extracting documentation and specification URLs
- Exporting results in JSON or CSV format

## Features

- **Multi-URL Input**: Enter multiple bank website URLs for batch scanning
- **Intelligent Crawling**: Follows links and prioritizes API-related pages
- **PSD2 Detection**: Identifies Account Information (AIS), Payment Initiation (PIS), and Confirmation of Funds (CAF) APIs
- **Confidence Scoring**: Ranks APIs based on keyword matches and page relevance
- **Export Options**: Download inventory as JSON or CSV
- **Filter & Search**: Filter results by API type or search keywords

## Quick Start (GitHub Pages - No Installation)

Simply visit the live demo link above and start scanning bank websites directly in your browser.

## Local Development

### Option 1: Static Version (Client-Side Only)

Open `docs/index.html` in your browser - no server required.

### Option 2: Flask Backend Version

1. Clone the repository:
```bash
git clone https://github.com/XsionTrOLeT/APIDiscovery.git
cd APIDiscovery
```

2. Create a virtual environment (recommended):
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Start the application:
```bash
python run.py
```

5. Open your browser and navigate to `http://localhost:5000`

## Usage

1. Enter one or more bank developer portal URLs (e.g., `https://developer.example-bank.com`)

2. Configure scan options:
   - **Max Crawl Depth**: How deep to follow links (1-3)
   - **Max Pages per Site**: Maximum pages to scan per website

3. Click "Import & Scan" to start the discovery process

4. Review the results and export as JSON or CSV

## API Types Detected

- **AIS (Account Information Service)**: APIs for accessing account information, balances, and transactions
- **PIS (Payment Initiation Service)**: APIs for initiating payments
- **CAF (Confirmation of Funds)**: APIs for checking fund availability

## Project Structure

```
APIDiscovery/
├── docs/                      # GitHub Pages static site
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── api-discovery.js   # Client-side discovery engine
│       └── app.js             # Frontend application
├── app/                       # Flask backend (optional)
│   ├── __init__.py
│   └── routes.py
├── utils/
│   └── api_discovery.py       # Python discovery module
├── .github/workflows/
│   └── deploy.yml             # GitHub Pages deployment
├── requirements.txt
├── run.py
└── README.md
```

## Example Output

The tool generates an inventory with the following information for each discovered API:

| Field | Description |
|-------|-------------|
| name | Bank/Provider name and API type |
| api_type | AIS, PIS, CAF, or PSD2 |
| url | Base URL of the bank |
| source_page | Page where API was discovered |
| description | Brief description extracted from page |
| documentation_url | Link to API documentation |
| swagger_url | Link to Swagger/OpenAPI specification |
| confidence_score | How confident the detection is (0-1) |
| keywords_found | PSD2 keywords detected on the page |
| discovered_at | Timestamp of discovery |

## Deployment

The application automatically deploys to GitHub Pages when changes are pushed to the `main` branch. The deployment is handled by GitHub Actions.

To enable GitHub Pages on your fork:
1. Go to Settings > Pages
2. Set Source to "GitHub Actions"

## License

MIT License
