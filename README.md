# PSD2 API Discovery

A web application for discovering and inventorying PSD2-compatible banking APIs from public bank websites.

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

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
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

## Usage

1. Start the application:
```bash
python run.py
```

2. Open your browser and navigate to `http://localhost:5000`

3. Enter one or more bank developer portal URLs (e.g., `https://developer.example-bank.com`)

4. Configure scan options:
   - **Max Crawl Depth**: How deep to follow links (1-5)
   - **Max Pages per Site**: Maximum pages to scan per website

5. Click "Import & Scan" to start the discovery process

6. Review the results and export as needed

## API Types Detected

- **AIS (Account Information Service)**: APIs for accessing account information, balances, and transactions
- **PIS (Payment Initiation Service)**: APIs for initiating payments
- **CAF (Confirmation of Funds)**: APIs for checking fund availability

## Project Structure

```
APIDiscovery/
├── app/
│   ├── __init__.py      # Flask app factory
│   └── routes.py        # API routes
├── static/
│   ├── css/
│   │   └── style.css    # Application styles
│   └── js/
│       └── app.js       # Frontend JavaScript
├── templates/
│   └── index.html       # Main HTML template
├── utils/
│   ├── __init__.py
│   └── api_discovery.py # API discovery logic
├── requirements.txt     # Python dependencies
├── run.py              # Application entry point
└── README.md
```

## API Endpoints

- `GET /` - Main web interface
- `POST /api/scan` - Start scanning URLs for APIs
- `POST /api/export/json` - Export inventory as JSON
- `POST /api/export/csv` - Export inventory as CSV
- `GET /health` - Health check endpoint

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

## License

MIT License
