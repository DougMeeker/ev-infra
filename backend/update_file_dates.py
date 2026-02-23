#!/usr/bin/env python3
"""
Script to extract and update file_created_at for existing files in the database.
Reads EXIF metadata from image files to populate the date taken field.

Usage:
    python update_file_dates.py [--dry-run]
"""
import sys
import os
from datetime import datetime
import io

# Add parent directory to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.extensions import db
from app.models import File
from app.services.files_service import get_storage_provider

def extract_exif_date_from_bytes(file_bytes):
    """Extract EXIF date from file bytes in memory."""
    try:
        from PIL import Image
        
        image = Image.open(io.BytesIO(file_bytes))
        
        # Extract EXIF data
        exif_data = image._getexif()
        if not exif_data:
            return None
        
        # Look for date fields in order of preference
        date_tags = [
            36867,  # DateTimeOriginal - when photo was taken
            36868,  # DateTimeDigitized - when photo was digitized
            306,    # DateTime - last modified
        ]
        
        for tag_id in date_tags:
            if tag_id in exif_data:
                date_str = exif_data[tag_id]
                if isinstance(date_str, str):
                    try:
                        # EXIF dates are typically in format: "YYYY:MM:DD HH:MM:SS"
                        return datetime.strptime(date_str, '%Y:%m:%d %H:%M:%S')
                    except ValueError:
                        continue
        
        return None
    except Exception as e:
        print(f"  Error extracting EXIF: {e}")
        return None

def get_file_bytes_from_storage(storage, stored_name, storage_type):
    """Get file bytes from storage (local or S3/MinIO)."""
    try:
        if storage_type == 'LocalStorageProvider':
            upload_dir = storage._ensure_dir()
            file_path = os.path.join(upload_dir, stored_name)
            
            if not os.path.exists(file_path):
                return None, f"File not found at {file_path}"
            
            with open(file_path, 'rb') as f:
                return f.read(), None
        
        elif storage_type == 'S3StorageProvider':
            # Download from S3/MinIO
            try:
                response = storage.client.get_object(Bucket=storage.bucket, Key=stored_name)
                return response['Body'].read(), None
            except Exception as e:
                return None, f"S3/MinIO error: {e}"
        
        else:
            return None, f"Unsupported storage type: {storage_type}"
    
    except Exception as e:
        return None, f"Error reading file: {e}"

def update_file_dates(dry_run=False):
    """Update file_created_at for all files in the database."""
    app = create_app()
    
    with app.app_context():
        # Get storage provider
        storage = get_storage_provider()
        storage_type = type(storage).__name__
        
        print(f"Using storage: {storage_type}")
        
        # Query all files
        files = File.query.all()
        print(f"Found {len(files)} files in database")
        print(f"Mode: {'DRY RUN' if dry_run else 'UPDATING DATABASE'}")
        print("-" * 60)
        
        updated_count = 0
        skipped_count = 0
        error_count = 0
        
        for file in files:
            # Skip if file_created_at is already set
            if file.file_created_at is not None:
                print(f"✓ {file.original_name}: Already has date ({file.file_created_at})")
                skipped_count += 1
                continue
            
            # Skip non-image files
            if not (file.content_type or '').startswith('image/'):
                print(f"- {file.original_name}: Not an image, skipping")
                skipped_count += 1
                continue
            
            # Get file bytes from storage
            file_bytes, error = get_file_bytes_from_storage(storage, file.stored_name, storage_type)
            
            if error:
                print(f"✗ {file.original_name}: {error}")
                error_count += 1
                continue
            
            # Extract EXIF date from bytes
            exif_date = extract_exif_date_from_bytes(file_bytes)
            
            if exif_date:
                print(f"→ {file.original_name}: Found date {exif_date}")
                if not dry_run:
                    file.file_created_at = exif_date
                    updated_count += 1
                else:
                    print(f"  (Would update to {exif_date})")
                    updated_count += 1
            else:
                print(f"- {file.original_name}: No EXIF date found")
                skipped_count += 1
        
        # Commit changes if not dry run
        if not dry_run and updated_count > 0:
            db.session.commit()
            print("\n" + "=" * 60)
            print(f"✓ Database updated successfully")
        
        print("\n" + "=" * 60)
        print(f"Summary:")
        print(f"  Updated: {updated_count}")
        print(f"  Skipped: {skipped_count}")
        print(f"  Errors:  {error_count}")
        print(f"  Total:   {len(files)}")
        
        if dry_run and updated_count > 0:
            print(f"\nRun without --dry-run to apply changes")

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Update file_created_at for existing files')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be updated without making changes')
    
    args = parser.parse_args()
    
    try:
        update_file_dates(dry_run=args.dry_run)
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
