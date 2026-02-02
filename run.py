#!/usr/bin/env python3
"""
PSD2 API Discovery Application

Run this file to start the web application.
"""

from app import create_app

app = create_app()

if __name__ == '__main__':
    print("=" * 60)
    print("  PSD2 API Discovery Tool")
    print("  Starting server at http://localhost:5000")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)
