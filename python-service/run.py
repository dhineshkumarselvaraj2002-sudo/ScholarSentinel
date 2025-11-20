#!/usr/bin/env python3
"""
Simple launcher script for the PDF service.
Run this from the python-service directory: python run.py
Or from parent: python python-service/run.py
"""
import sys
from pathlib import Path

# Add current directory to path
current_dir = Path(__file__).parent
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

# Now import and run
import uvicorn
from main import app

if __name__ == "__main__":
    try:
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            reload=False,
            log_level="info"
        )
    except KeyboardInterrupt:
        print("\nServer stopped by user")
    except Exception as e:
        print(f"Server error: {e}")
        raise

