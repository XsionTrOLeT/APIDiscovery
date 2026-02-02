"""
Flask routes for the API Discovery application.
"""

import json
import csv
import io
from flask import Blueprint, render_template, request, jsonify, Response
from utils.api_discovery import PSD2APIDiscovery
import validators

main = Blueprint('main', __name__)


@main.route('/')
def index():
    """Render the main page."""
    return render_template('index.html')


@main.route('/api/scan', methods=['POST'])
def scan_urls():
    """
    Scan provided URLs for PSD2 APIs.

    Expected JSON body:
    {
        "urls": ["https://example-bank.com", "https://another-bank.com"],
        "max_depth": 2,
        "max_pages": 50
    }
    """
    try:
        data = request.get_json()

        if not data or 'urls' not in data:
            return jsonify({'error': 'No URLs provided'}), 400

        urls = data.get('urls', [])

        # Validate URLs
        valid_urls = []
        invalid_urls = []

        for url in urls:
            url = url.strip()
            if not url:
                continue

            # Add https:// if no scheme provided
            if not url.startswith(('http://', 'https://')):
                url = 'https://' + url

            if validators.url(url):
                valid_urls.append(url)
            else:
                invalid_urls.append(url)

        if not valid_urls:
            return jsonify({
                'error': 'No valid URLs provided',
                'invalid_urls': invalid_urls
            }), 400

        # Initialize discovery with optional parameters
        max_depth = data.get('max_depth', 2)
        max_pages = data.get('max_pages', 50)

        discovery = PSD2APIDiscovery(
            max_depth=max_depth,
            max_pages=max_pages
        )

        # Run discovery
        results = discovery.discover_apis(valid_urls)

        # Add invalid URLs to response for user awareness
        if invalid_urls:
            results['invalid_urls'] = invalid_urls

        return jsonify(results)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@main.route('/api/export/json', methods=['POST'])
def export_json():
    """Export API inventory as JSON file."""
    try:
        data = request.get_json()
        apis = data.get('apis', [])

        response = Response(
            json.dumps(apis, indent=2),
            mimetype='application/json',
            headers={'Content-Disposition': 'attachment;filename=api_inventory.json'}
        )
        return response

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@main.route('/api/export/csv', methods=['POST'])
def export_csv():
    """Export API inventory as CSV file."""
    try:
        data = request.get_json()
        apis = data.get('apis', [])

        if not apis:
            return jsonify({'error': 'No APIs to export'}), 400

        # Create CSV
        output = io.StringIO()
        fieldnames = [
            'name', 'api_type', 'url', 'source_page', 'description',
            'documentation_url', 'swagger_url', 'confidence_score',
            'discovered_at', 'keywords_found'
        ]

        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()

        for api in apis:
            # Convert keywords list to string
            api_copy = api.copy()
            if 'keywords_found' in api_copy:
                api_copy['keywords_found'] = '; '.join(api_copy['keywords_found'])
            writer.writerow(api_copy)

        response = Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': 'attachment;filename=api_inventory.csv'}
        )
        return response

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@main.route('/health')
def health():
    """Health check endpoint."""
    return jsonify({'status': 'healthy'})
