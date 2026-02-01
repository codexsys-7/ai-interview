"""
Pytest configuration and shared fixtures for all tests.

This file is automatically loaded by pytest before running tests.
It sets up the test environment, loading the real .env file if available.
"""

import os
import sys

# Add backend directory to path for imports FIRST
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Load the real .env file if it exists (this gives us the real DATABASE_URL)
from dotenv import load_dotenv
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(env_path)

# Only set dummy values if not already set by .env
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test_db")
os.environ.setdefault("OPENAI_API_KEY", "test-api-key-for-testing")

import pytest


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers", "integration: mark test as integration test (requires real database)"
    )


# Flag to check if we have a real database connection
_database_available = None

def is_database_available():
    """Check if a real database connection is available."""
    global _database_available
    if _database_available is None:
        try:
            from sqlalchemy import create_engine, text
            engine = create_engine(os.environ.get("DATABASE_URL"))
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            _database_available = True
        except Exception:
            _database_available = False
    return _database_available


@pytest.fixture
def skip_if_no_database():
    """Skip test if database is not available."""
    if not is_database_available():
        pytest.skip("Database not available - skipping integration test")
